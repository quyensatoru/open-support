import { tool } from '@langchain/core/tools';
import { nativeEnum, z } from 'zod';
import { logger } from '../../observability/logger.js';
import { LlmOpenAI } from '../../llm/openai.llm.js';
import { DevtoolKeywordSchema, type DetectMemory, type EvaluateKeywordResult } from '../../graph/brower-diagnose.types.js';
import { BrowseDevtool } from '../../playwright/type.js';

const DetectkeywordSchema = z.object({
    keywords: z.array(z.string()).min(1),
    byTools: DevtoolKeywordSchema,
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

const PROMPT = `
You generate browser detection keywords for an unknown app.

Input:
- app: string
- devtools: (Dom, Script, Network, Console, Storage)
- memory: { success: [], failed: [] }

Goal:
Return SHORT keyword fragments to match in browser signals (DOM, script, network, console, storage).

Rules:
- Do NOT crawl or verify.
- Generate from app name + simple variations:
  (raw, kebab-case, snake_case, camelCase, compact)
- Combine with neutral runtime terms:
  (init, sdk, config, api, client, module, data, state)
- Keywords must be:
  - short (1–3 tokens)
  - partial (usable for substring match)
- Avoid generic words alone.
- Avoid memory.failed, reuse memory.success if relevant.
- Include every devtool key in byTools.
- Return empty arrays for devtools that were not requested.
`

export const evaluateKeyword = tool(
    async ({ app, devtools }): Promise<EvaluateKeywordResult> => {
        const memoryKeyword = getMemory(app);
        
        try {
            const llm = await LlmOpenAI();

            const result = await llm.withStructuredOutput(DetectkeywordSchema).invoke([
                {
                    role: 'system',
                    content: PROMPT,
                },
                {
                    role: 'user',
                    content: JSON.stringify(
                        {
                            app,
                            memory: memoryKeyword,
                            devtools
                        },
                        null,
                        2,
                    ),
                },
            ]);
            console.log("result: ", result)

            return {
                ok: true,
                app,
                keywords: result.keywords,
                byTools: result.byTools,
                memory: memoryKeyword,
            }
        } catch (e: unknown) {
            if (e instanceof Error) {
                logger.error(e.message);
            } else {
                logger.error('Failed execute tool');
            }
        }

        return {
            ok: false,
            app,
            keywords: [],
            memory: memoryKeyword,
        };
    },
    {
        name: 'browser.detect',
        description: 'Crawl a website in Playwright and persist browser signals to a debug log.',
        schema: z.object({
            app: z.string().describe('App name'),
            devtools: z.array(nativeEnum(BrowseDevtool))
        }),
    },
);
