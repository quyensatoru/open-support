import { tool } from '@langchain/core/tools';
import { string, z } from 'zod';
import fs from 'fs';
import { logger } from '../observability/logger.js';
import path from 'path';
import { BrowserGrepResult } from '../graph/brower-diagnose.graph.js';

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPatterns(hint: string) {
    const raw = hint.trim();

    const variants = [
        raw,
        raw.replace(/\s+/g, ''),
        raw.replace(/\s+/g, '-'),
        raw.replace(/\s+/g, '_'),
    ].filter(Boolean);

    return [...new Set(variants)].map((value) => new RegExp(escapeRegExp(value), 'i'));
}

export const detectSite = tool(
    async ({ keywords, runId }): Promise<BrowserGrepResult> => {
        try {
            const filePath = path.join(process.cwd(), '.debug', `${runId}.log`);

            if (!fs.existsSync(filePath)) {
                return {
                    ok: false,
                };
            }

            const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);

            let matches: string[] = [];
            keywords.forEach((k) => {
                const patterns = buildPatterns(k);

                const matched = lines
                    .filter((line) => patterns.some((pattern) => pattern.test(line)))
                    .slice(0, 50);
                matches.push(...matched);
            });

            if(matches.length) {
                return {
                    ok: true,
                    runId,
                    keywords,
                    matchCount: matches.length,
                    matches: matches,
                };
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
            runId,
            keywords,
            matchCount: 0,
            matches: [],
        };
    },
    {
        name: 'system.grep',
        schema: z.object({
            runId: z.string().describe('Run id returned by browser.detect'),
            keywords: z.array(z.string()).describe('keywords about script on website'),
        }),
    },
);
