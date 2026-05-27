import { tool } from '@langchain/core/tools';
import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

import {
    CodeGrepResultSchema,
    CodeRepoSchema,
    type CodeGrepMatch,
    type CodeGrepResult,
} from '../../../graph/code/code.type.js';

const DEFAULT_IGNORES = [
    '**/.git/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/.cache/**',
    '**/pnpm-lock.yaml',
    '**/package-lock.json',
    '**/yarn.lock',
];

const MAX_FILE_BYTES = 1_500_000;

const CodeGrepInputSchema = z.object({
    workspacePath: z.string().trim().min(1),
    repos: z.array(CodeRepoSchema),
    fileGlobs: z.array(z.string()).min(1),
    fileRegexes: z.array(z.string()).default([]),
    contentRegexes: z.array(z.string()).min(1),
    maxMatches: z.number().int().positive().max(500).default(120),
});

function compileRegex(pattern: string, warnings: string[]) {
    try {
        return new RegExp(pattern, 'i');
    } catch {
        warnings.push(`Invalid regex skipped: ${pattern}`);
        return null;
    }
}

function isLikelyBinary(content: string) {
    return content.includes('\u0000');
}

function previewLine(line: string) {
    return line.trim().replace(/\s+/g, ' ').slice(0, 500);
}

export const codeGrep = tool(
    async (input): Promise<CodeGrepResult> => {
        const parsed = CodeGrepInputSchema.parse(input);
        const warnings: string[] = [];
        const matches: CodeGrepMatch[] = [];
        let searchedFiles = 0;

        const fileRegexes = parsed.fileRegexes
            .map((pattern) => compileRegex(pattern, warnings))
            .filter((regex): regex is RegExp => Boolean(regex));
        const contentRegexes = parsed.contentRegexes
            .map((pattern) => ({ pattern, regex: compileRegex(pattern, warnings) }))
            .filter((item): item is { pattern: string; regex: RegExp } => Boolean(item.regex));

        if (!contentRegexes.length) {
            return {
                ok: false,
                workspacePath: parsed.workspacePath,
                searchedFiles,
                matches,
                warnings: [...warnings, 'No valid content regexes to search.'],
            };
        }

        for (const repo of parsed.repos) {
            const entries = await fg(parsed.fileGlobs, {
                cwd: repo.localPath,
                absolute: true,
                onlyFiles: true,
                dot: true,
                ignore: DEFAULT_IGNORES,
                unique: true,
            });

            for (const absolutePath of entries) {
                if (matches.length >= parsed.maxMatches) break;

                const relativePath = path
                    .relative(repo.localPath, absolutePath)
                    .replace(/\\/g, '/');
                if (fileRegexes.length && !fileRegexes.some((regex) => regex.test(relativePath))) {
                    continue;
                }

                let stat;
                try {
                    stat = await fs.stat(absolutePath);
                } catch {
                    continue;
                }

                if (stat.size > MAX_FILE_BYTES) {
                    warnings.push(`Skipped large file: ${repo.name}/${relativePath}`);
                    continue;
                }

                let content: string;
                try {
                    content = await fs.readFile(absolutePath, 'utf-8');
                } catch {
                    warnings.push(`Skipped unreadable file: ${repo.name}/${relativePath}`);
                    continue;
                }

                if (isLikelyBinary(content)) {
                    warnings.push(`Skipped binary file: ${repo.name}/${relativePath}`);
                    continue;
                }

                searchedFiles += 1;
                const lines = content.split(/\r?\n/);

                for (const [lineIndex, line] of lines.entries()) {
                    if (matches.length >= parsed.maxMatches) break;

                    for (const { pattern, regex } of contentRegexes) {
                        regex.lastIndex = 0;
                        const result = regex.exec(line);
                        if (!result) continue;

                        const match: CodeGrepMatch = {
                            repo: repo.name,
                            filePath: relativePath,
                            absolutePath,
                            line: lineIndex + 1,
                            pattern,
                            preview: previewLine(line),
                        };

                        if (result.index >= 0) {
                            match.column = result.index + 1;
                        }

                        matches.push(match);
                        break;
                    }
                }
            }
        }

        return CodeGrepResultSchema.parse({
            ok: matches.length > 0,
            workspacePath: parsed.workspacePath,
            searchedFiles,
            matches,
            warnings,
        });
    },
    {
        name: 'code_grep',
        description:
            'Search cloned repositories with fast-glob file globs plus file/content regex filters.',
        schema: CodeGrepInputSchema,
    },
);
