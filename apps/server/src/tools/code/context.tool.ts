import { tool } from '@langchain/core/tools';
import fs from 'fs/promises';
import { z } from 'zod';

import {
    CodeContextResultSchema,
    CodeGrepMatchSchema,
    type CodeContextResult,
} from '../../graph/code/code.type.js';

const CodeContextInputSchema = z.object({
    issue: z.string().trim().min(1),
    matches: z.array(CodeGrepMatchSchema),
    maxFiles: z.number().int().positive().max(20).default(8),
    contextLines: z.number().int().positive().max(80).default(20),
});

function rankFiles(matches: z.infer<typeof CodeGrepMatchSchema>[]) {
    const ranked = new Map<string, { count: number; match: z.infer<typeof CodeGrepMatchSchema> }>();

    for (const match of matches) {
        const key = match.absolutePath;
        const current = ranked.get(key);
        ranked.set(key, {
            count: (current?.count ?? 0) + 1,
            match: current?.match ?? match,
        });
    }

    return [...ranked.values()]
        .sort((left, right) => right.count - left.count)
        .map((item) => item.match);
}

function buildSnippet(lines: string[], line: number, contextLines: number) {
    const startLine = Math.max(1, line - contextLines);
    const endLine = Math.min(lines.length, line + contextLines);
    const content = lines
        .slice(startLine - 1, endLine)
        .map((sourceLine, index) => `${startLine + index}: ${sourceLine}`)
        .join('\n');

    return { startLine, endLine, content };
}

export const codeContext = tool(
    async (input): Promise<CodeContextResult> => {
        const parsed = CodeContextInputSchema.parse(input);
        const warnings: string[] = [];
        const files: CodeContextResult['files'] = [];
        const ranked = rankFiles(parsed.matches).slice(0, parsed.maxFiles);

        for (const fileMatch of ranked) {
            const fileMatches = parsed.matches.filter(
                (match) => match.absolutePath === fileMatch.absolutePath,
            );

            let content: string;
            try {
                content = await fs.readFile(fileMatch.absolutePath, 'utf-8');
            } catch {
                warnings.push(`Could not read ${fileMatch.repo}/${fileMatch.filePath}`);
                continue;
            }

            const lines = content.split(/\r?\n/);
            const snippets = fileMatches
                .slice(0, 4)
                .map((match) => buildSnippet(lines, match.line, parsed.contextLines));

            files.push({
                repo: fileMatch.repo,
                filePath: fileMatch.filePath,
                absolutePath: fileMatch.absolutePath,
                snippets,
            });
        }

        return CodeContextResultSchema.parse({
            ok: files.length > 0,
            files,
            warnings,
        });
    },
    {
        name: 'code_context',
        description:
            'Read focused code snippets around grep matches so an LLM can reason about a fix.',
        schema: CodeContextInputSchema,
    },
);
