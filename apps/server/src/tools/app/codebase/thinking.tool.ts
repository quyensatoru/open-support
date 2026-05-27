import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { LlmOpenAI } from '../../../llm/openai.llm.js';
import { logger } from '../../../observability/logger.js';
import { CodeSearchPlanSchema, type CodeSearchPlan } from '../../../graph/code/code.type.js';

const ThinkingInputSchema = z.object({
    app: z.string().trim().min(1),
    issue: z.string().trim().min(1),
    repoNames: z.array(z.string()).default([]),
    mode: z.enum(['search', 'fix']).default('search'),
});

const PROMPT = `
You are a senior coding investigation agent.

Task:
Given an app name and an issue, decide what code files and content should be searched.

Return:
- fileGlobs: fast-glob compatible file globs. Include broad source globs plus focused globs.
- fileRegexes: regex strings matched against relative file paths.
- contentRegexes: regex strings matched against file content.
- contextHints: short hints for later context extraction.
- wantsFix: true when the user asks to fix/debug/change implementation, false for pure discovery.
- rationale: concise reason for the search strategy.

Rules:
- Prefer source/config/script locations: src, app, apps, packages, scripts, extensions, theme, storefront, public.
- Avoid dependency/build folders.
- Regex must be valid JavaScript regex source without leading/trailing slashes.
- Content regex should include issue-specific words plus common implementation terms.
- Do not invent exact filenames unless the issue strongly suggests them.
`;

function wordsFromIssue(issue: string) {
    return issue
        .split(/[^a-zA-Z0-9_-]+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 3)
        .slice(0, 12);
}

function fallbackPlan(app: string, issue: string, mode: 'search' | 'fix'): CodeSearchPlan {
    const words = [...new Set([...wordsFromIssue(issue), ...wordsFromIssue(app)])];
    const contentRegexes = words.length
        ? words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        : [app.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];

    return {
        ok: false,
        issue,
        fileGlobs: [
            '**/*.{ts,tsx,js,jsx,mjs,cjs,json,liquid,html,css,scss,vue,svelte,php,rb,py,sh,yml,yaml}',
            'scripts/**/*',
            'extensions/**/*',
            'apps/**/*',
            'packages/**/*',
        ],
        fileRegexes: ['(src|app|apps|packages|scripts|extensions|theme|storefront|public)'],
        contentRegexes,
        contextHints: words,
        wantsFix: mode === 'fix' || /\b(fix|bug|debug|sửa|loi|lỗi|error|issue)\b/i.test(issue),
        rationale: 'Fallback plan generated from issue keywords.',
    };
}

export const codeThinking = tool(
    async (input): Promise<CodeSearchPlan> => {
        const parsed = ThinkingInputSchema.parse(input);

        try {
            const llm = await LlmOpenAI();
            const result = await llm.withStructuredOutput(CodeSearchPlanSchema).invoke([
                { role: 'system', content: PROMPT },
                {
                    role: 'user',
                    content: JSON.stringify(
                        {
                            app: parsed.app,
                            issue: parsed.issue,
                            repoNames: parsed.repoNames,
                            mode: parsed.mode,
                        },
                        null,
                        2,
                    ),
                },
            ]);

            return {
                ...result,
                issue: parsed.issue,
                wantsFix: parsed.mode === 'fix' || result.wantsFix,
                ok: true,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`code.thinking fallback: ${message}`);
            return fallbackPlan(parsed.app, parsed.issue, parsed.mode);
        }
    },
    {
        name: 'code_thinking',
        description:
            'Use an LLM to convert a code issue into file globs, file regexes, and content regexes for code search.',
        schema: ThinkingInputSchema,
    },
);
