import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '../observability/logger.js';
import { LlmOpenAI } from '../llm/openai.llm.js';
import { DetectMemory } from '../graph/brower-diagnose.graph.js';

const DetectHintSchema = z.object({
    keywords: z.array(z.string()).min(1),
});

const memory = new Map<string, DetectMemory>();

function getMemory(app: string): DetectMemory {
    return (
        memory.get(app) ?? {
            success: [],
            failed: [],
        }
    );
}

export function saveMemory(app: string, data: DetectMemory) {
    memory.set(app, data);
}

export const evaluateKeyword = tool(
    async ({ app }) => {
        try {
            const memory = getMemory(app);
            const llm = await LlmOpenAI();

            const result = await llm.withStructuredOutput(DetectHintSchema).invoke([
                {
                    role: 'system',
                    content: `
You are a browser detection keyword generator.

Given an app name, guess keywords that may appear on a storefront in:
- script src
- inline JavaScript
- network URLs
- DOM id/class/data attributes
- localStorage/sessionStorage keys
- window global variables

Rules:
- Do not crawl.
- Do not return explanations outside JSON.
- Avoid failed keywords from memory.
- Prefer short, realistic, searchable fragments.
`,
                },
                {
                    role: 'user',
                    content: JSON.stringify(
                        {
                            app,
                            memory: memory,
                        },
                        null,
                        2,
                    ),
                },
            ]);

            const keywords = [...new Set(result.keywords)]
                .map((k) => k.trim())
                .filter(Boolean)
                .filter((k) => !memory.failed.includes(k));
            return JSON.stringify(
                {
                    ok: true,
                    app,
                    keywords,
                    memory,
                },
                null,
                2,
            );
        } catch (e: unknown) {
            if (e instanceof Error) {
                logger.error(e.message);
            } else {
                logger.error('Failed execute tool');
            }
        }
        return JSON.stringify(
            {
                ok: false,
                app,
                keywords: [],
                memory,
            },
            null,
            2,
        );
    },
    {
        name: 'browser.detect',
        description: 'Crawl a website in Playwright and persist browser signals to a debug log.',
        schema: z.object({
            app: z.string().describe('App name'),
        }),
    },
);
