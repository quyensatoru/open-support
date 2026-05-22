import { getPlaywrightDefaults } from './config.js';
import { BrowseDevtool, BrowserDevice, BrowserEngine } from './type.js';
import { logger } from '../observability/logger.js';
import type { DevtoolKeywordType, DomSignalType, StructuredSignalType } from '../graph/brower-diagnose.types.js';

export type BrowserSearchResult = {
    query: string;
    title: string;
    url: string;
    excerpt: string;
};

export type CrawlerOption = {
    url: string;
    engine?: BrowserEngine;
    device?: BrowserDevice;
    devtools: Array<BrowseDevtool>;
};

export async function crawlerBrowser({
    url,
    engine = BrowserEngine.Chromium,
    device = BrowserDevice.Desktop,
    devtools,
}: CrawlerOption): Promise<StructuredSignalType> {
    const defaults = getPlaywrightDefaults();
    let browser;
    try {
        if (!engine || !device) {
            throw new Error('no provide engine or device');
        }

        const playwright = await import('playwright');
        const browserType = playwright[engine];

        browser = await browserType.launch({
            headless: defaults.headless,
            timeout: defaults.timeoutMs,
        });

        const context = await browser.newContext({
            isMobile: device === BrowserDevice.Mobile,
            hasTouch: device === BrowserDevice.Mobile,
        });

        const page = await context.newPage();

        const signals: StructuredSignalType = {};

        devtools.forEach((tool) => {
            if (tool === BrowseDevtool.Console) {
                page.on('console', (msg) => {
                    if (!signals.console) {
                        signals.console = []
                    }
                    signals.console.push(`${msg.type()} ${msg.text()}`)
                });
            }

            if (tool === BrowseDevtool.Network) {
                page.on('response', (res) => {
                    if (res.status() >= 400) {
                        if (!signals.network) {
                            signals.network = []
                        }
                        signals.network.push(`[response] [status: ${res.status()}] [url: ${res.url()}]`)
                    }
                });

                page.on('requestfailed', (req) => {
                    if (!signals.network) {
                        signals.network = []
                    }
                    signals.network.push(`[request] [url: ${req.url()}] [error: ${req.failure()?.errorText}]`)
                });
            }
        });

        await page.goto(url, {
            waitUntil: 'networkidle',
        });

        //fix for shopify store dev

        const passwordInput = page.locator('input[type="password"], input[name="password"]');

        if (await passwordInput.count()) {
            await passwordInput.first().fill('1');

            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => null),
                page
                    .locator('button[type="submit"], input[type="submit"], button')
                    .first()
                    .click(),
            ]);
        }

        await page.waitForURL(url, { waitUntil: "networkidle" });
        const browserData = await page.evaluate(() => {
            const dom = document.documentElement.outerHTML;
            return {
                scripts: [...document.scripts].map((s) => `[script] [${s.src}] [${s.textContent}]`),
                dom: `[dom: ${dom}]`,
                global: `[window: ${Object.keys(window)}]`,
            };
        });

        const dom: DomSignalType =  await page.$$eval('*', (nodes) =>
            nodes.map((el) => {
                const attrs = Array.from(el.attributes)
                    .map((a) => `${a.name}="${a.value}"`)
                    .join(' ');

                const text = el.textContent?.trim().replace(/\s+/g, ' ');

                return {
                    tag: el.tagName.toLowerCase(),
                    id: el.id || undefined,
                    className: typeof el.className === 'string' ? el.className : undefined,
                    attrs,
                    text,
                    html: el.outerHTML,
                };
            }),
        );

        if (devtools.includes(BrowseDevtool.Script)) {
            if (!signals.script) {
                signals.script = []
            }
            signals.script.push(...browserData.scripts);
        }

        if (devtools.includes(BrowseDevtool.Dom)) {
            signals.dom = dom;
        }

        if (devtools.includes(BrowseDevtool.Global)) {
            if (!signals.global) {
                signals.global = []
            }
            signals.global.push(browserData.global);
        }
        return signals;
    } catch (e: unknown) {
        if (e instanceof Error) {
            logger.error(e.message);
        } else {
            logger.error('Unknown error');
        }
    } finally {
        browser?.close();
    }
    throw new Error('relevant not found');
}
