import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getPlaywrightDefaults } from '../playwright/config.js';
import { logger } from '../observability/logger.js';

export enum BrowserEngine {
    Chromium = 'chromium',
    Firefox = 'firefox',
    Webkit = 'webkit',
}
export enum BrowserDevice {
    Mobile = 'mobile',
    Desktop = 'desktop',
}

export const diagnoseSite = tool(
    async ({ url, metadata }) => {
        const defaults = getPlaywrightDefaults();
        let browser;
        try {
            const engine = metadata.engine;
            const device = metadata.device;
            if (!engine) {
                throw new Error('no provide engine. Please enter browser engine');
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
            const res = await page.goto(url);
            console.log(res);
        } catch (e: unknown) {
            if (e instanceof Error) {
                logger.error(e.message);
            } else {
                logger.error('Unknown error');
            }
        } finally {
            browser?.close();
        }
    },
    {
        name: 'browser.diagnose',
        schema: z.object({
            url: z.string().describe('Link website needs diagnose'),
            metadata: z
                .object({
                    engine: z.nativeEnum(BrowserEngine).optional().default(BrowserEngine.Chromium),
                    device: z.nativeEnum(BrowserDevice).optional().default(BrowserDevice.Desktop),
                })
                .optional()
                .default({
                    engine: BrowserEngine.Chromium,
                    device: BrowserDevice.Desktop,
                }),
        }),
    },
);
