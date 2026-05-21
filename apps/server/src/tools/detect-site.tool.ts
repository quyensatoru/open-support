import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { BrowseDevtool } from '../playwright/type.js';
import { logger } from '../observability/logger.js';
import { crawlerBrowser } from '../playwright/crawler.js';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserDevice, BrowserEngine } from '../playwright/type.js';
import { BrowserDetectResult } from '../graph/brower-diagnose.graph.js';

function createRunId() {
    return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const detectSite = tool(
    async ({ url, tools, metadata }): Promise<BrowserDetectResult> => {
        const runId = createRunId();
        try {
            const engine = metadata?.engine ?? BrowserEngine.Chromium;
            const device = metadata?.device ?? BrowserDevice.Desktop;
            const signals = await crawlerBrowser({
                url,
                tools,
                engine,
                device,
            });
            const debugDir = path.join(process.cwd(), '.debug');
            const filePath = path.join(debugDir, `${runId}.log`);

            fs.mkdirSync(debugDir, { recursive: true });

            fs.writeFileSync(filePath, signals.join('\n'), 'utf-8');

            return {
                ok: true,
                runId,
                filePath,
                url,
                signalCount: signals.length,
            };
        } catch (e: unknown) {
            if (e instanceof Error) {
                logger.error(e.message);
            } else {
                logger.error('Failed execute tool');
            }
        }
        return {
            ok: false,
            runId,
            url,
        };
    },
    {
        name: 'browser.detect',
        description: 'Crawl a website in Playwright and persist browser signals to a debug log.',
        schema: z.object({
            url: z.url().describe('Link website'),
            tools: z
                .array(z.nativeEnum(BrowseDevtool))
                .describe('Describe tab must be trace on devtool browser')
                .default([BrowseDevtool.Dom, BrowseDevtool.Network, BrowseDevtool.Script]),
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
