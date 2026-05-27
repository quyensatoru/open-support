import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import {
    CodeContextResultSchema,
    CodeGrepResultSchema,
    CodeInsightResultSchema,
    CodeSearchPlanSchema,
    type CodeInsightResult,
} from '../../graph/code/code.type.js';
import { LlmOpenAI } from '../../llm/openai.llm.js';
import { logger } from '../../observability/logger.js';

const CodeInsightInputSchema = z.object({
    app: z.string().trim().min(1),
    issue: z.string().trim().min(1),
    mode: z.enum(['search', 'fix']).default('search'),
    thinking: CodeSearchPlanSchema,
    grep: CodeGrepResultSchema,
    context: CodeContextResultSchema.optional(),
});

const PROMPT = `
You are a coding agent summarizing an investigation.

Return actionable insight for the user's issue:
- summary: one concise paragraph.
- likelyFiles: relative repo/file references most relevant to inspect or edit.
- findings: concrete findings grounded in grep/context.
- suggestedFix: when mode is fix, describe the safest code change direction.
- confidence: low/medium/high based only on evidence.

Do not claim a fix is certain when only grep results are available.
`;

function fallbackInsight(input: z.infer<typeof CodeInsightInputSchema>): CodeInsightResult {
    const likelyFiles = [
        ...new Set(input.grep.matches.map((match) => `${match.repo}/${match.filePath}`)),
    ].slice(0, 10);

    return {
        ok: input.grep.matches.length > 0,
        summary: input.grep.matches.length
            ? `Found ${input.grep.matches.length} code match(es) across ${likelyFiles.length} likely file(s) for "${input.issue}".`
            : `No code matches found for "${input.issue}" using the generated search plan.`,
        likelyFiles,
        findings: input.grep.matches.slice(0, 8).map((match) => {
            return `${match.repo}/${match.filePath}:${match.line} matched ${match.pattern}: ${match.preview}`;
        }),
        ...(input.mode === 'fix'
            ? {
                  suggestedFix:
                      'Review the highest ranked context files, confirm the runtime path, then patch the smallest file that owns the matched behavior.',
              }
            : {}),
        confidence: input.grep.matches.length ? 'medium' : 'low',
    };
}

export const codeInsight = tool(
    async (input): Promise<CodeInsightResult> => {
        const parsed = CodeInsightInputSchema.parse(input);

        try {
            const llm = await LlmOpenAI();
            const result = await llm.withStructuredOutput(CodeInsightResultSchema).invoke([
                { role: 'system', content: PROMPT },
                {
                    role: 'user',
                    content: JSON.stringify(
                        {
                            app: parsed.app,
                            issue: parsed.issue,
                            mode: parsed.mode,
                            thinking: parsed.thinking,
                            grep: {
                                ...parsed.grep,
                                matches: parsed.grep.matches.slice(0, 60),
                            },
                            context: parsed.context,
                        },
                        null,
                        2,
                    ),
                },
            ]);

            return {
                ...result,
                ok: true,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`code.insight fallback: ${message}`);
            return fallbackInsight(parsed);
        }
    },
    {
        name: 'code_insight',
        description:
            'Summarize code search/context into actionable insight and optional fix direction for an issue.',
        schema: CodeInsightInputSchema,
    },
);
