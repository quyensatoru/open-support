import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { BrowserDevice, BrowserEngine } from '../../playwright/type.js';
import type { BrowserDiagnoseResult } from '../../graph/browser/diagnose.graph.js';

export const diagnoseSite = tool(
    async (): Promise<BrowserDiagnoseResult> => {
        return {
            ok: true,
        };
    },
    {
        name: 'browser_diagnose_site',
        description: 'Open a website in Playwright and return basic response diagnostics.',
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
