import { getPlaywrightDefaults } from './config.js';
import { BrowseDevtool, BrowserDevice, BrowserEngine } from './type.js';
import { logger } from '../observability/logger.js';

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
    tools: Array<BrowseDevtool>
}
export async function crawlerBrowser({ url, engine = BrowserEngine.Chromium, device = BrowserDevice.Desktop, tools}: CrawlerOption): Promise<Array<string>> {
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

        const signals: string[] = [];

        tools.forEach((tool) => {
            if (tool === BrowseDevtool.Console) {
                page.on("console", msg => {
                    signals.push(`[console:${msg.type()}] ${msg.text()}`);
                });
            }

            if(tool === BrowseDevtool.Network) {
                page.on("response", res => {
                    if (res.status() >= 400) {
                        signals.push(`[failed] [status: ${res.status()}] [url: ${res.url()}]`);
                    }
                });

                page.on("requestfailed", req => {
                    signals.push(`[failed] [url: ${req.url()}] [error: ${req.failure()?.errorText}]`);
                });
            }
        });

        await page.goto(url, {
            waitUntil: "networkidle"
        });

        //fix for shopify store dev
        const isShopify = await page.evaluate(() => Boolean((window as any).Shopify));
        console.log("isShopify: ", isShopify)

        if(isShopify) {
            const passwordInput = page.locator('input[type="password"], input[name="password"]');

            if (await passwordInput.count()) {
                await passwordInput.first().fill("1");

                await Promise.all([
                    page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => null),
                    page.locator('button[type="submit"], input[type="submit"], button').first().click(),
                ]);
            }
        }

        await page.waitForTimeout(5000)
        // await page.waitForURL(url, { waitUntil: "networkidle" });
        const browserData = await page.evaluate(() => {
            const dom = document.documentElement.outerHTML
            return {
                scripts: [...document.scripts].map(s => `[script] [src: ${s.src}]`),
                dom: `[dom: ${dom}]`,
                global: `[window: ${Object.keys(window)}]`,
            };
        });

        console.log("browserData: ", browserData)

        if (tools.includes(BrowseDevtool.Script)) {
            signals.push(...browserData.scripts);
        }

        if(tools.includes(BrowseDevtool.Dom)) {
            signals.push(browserData.dom)
        }

        if(tools.includes(BrowseDevtool.Global)) {
            signals.push(browserData.global)
        }
        return signals
    } catch (e: unknown) {
        if (e instanceof Error) {
            logger.error(e.message);
        } else {
            logger.error('Unknown error');
        }
    } finally {
        browser?.close();
    }
    throw new Error("relevant not found")
}
