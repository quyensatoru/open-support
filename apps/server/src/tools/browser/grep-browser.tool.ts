import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import { logger } from '../../observability/logger.js';
import path from 'path';
import { DevtoolKeywordSchema } from '../../graph/browser/diagnose.types.js';
import type {
    BrowserGrepResult,
    DomSignalType,
    SignalMatchType,
    StructuredSignalType,
} from '../../graph/browser/diagnose.types.js';
import { BrowseDevtool } from '../../playwright/type.js';

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

function normalizeText(value: unknown): string {
    if (!value) return '';

    if (typeof value === 'string') return value;

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function grepDomSignals(domSignals: DomSignalType, patterns: RegExp[]) {
    return domSignals
        .map((el) => {
            const parts = {
                tag: normalizeText(el.tag),
                attrs: normalizeText(el.attrs),
                text: normalizeText(el.text),
                html: normalizeText(el.html),
            };

            const searchable = [parts.tag, parts.attrs, parts.text, parts.html]
                .filter(Boolean)
                .join(' ');

            const matched = patterns.some((pattern) => pattern.test(searchable));

            if (!matched) return null;

            return [
                `tag: ${parts.tag}`,
                parts.attrs ? `attrs: ${parts.attrs}` : '',
                parts.text ? `text: ${parts.text}` : '',
                parts.html ? `html: ${parts.html.slice(0, 500)}` : '',
            ]
                .filter(Boolean)
                .join('\n');
        })
        .filter((item): item is string => Boolean(item))
        .slice(0, 50);
}

export const grepBrowser = tool(
    async ({ keywordsByDevtool, devtools, runId }): Promise<BrowserGrepResult> => {
        try {
            const filePath = path.join(process.cwd(), '.debug', `${runId}.log`);

            if (!fs.existsSync(filePath)) {
                return {
                    ok: false,
                    reason: 'file debug not found',
                };
            }

            const text = fs.readFileSync(filePath, 'utf-8').toString();

            let signal: StructuredSignalType = {};

            try {
                signal = JSON.parse(text);
            } catch {
                logger.error('Failed to parse JSON dom, script, network debug content');
                return {
                    ok: false,
                    runId,
                    keywordsByDevtool,
                    devtools,
                    matches: {},
                };
            }

            const matches: SignalMatchType = {};

            devtools.forEach((devtool) => {
                const keywords = keywordsByDevtool[devtool];
                const sg = signal[devtool];

                if (!keywords?.length || !sg?.length) {
                    return;
                }

                const devtoolMatches: string[] = [];

                keywords.forEach((keyword) => {
                    const patterns = buildPatterns(keyword);
                    if (devtool === BrowseDevtool.Dom) {
                        const matched = grepDomSignals(sg as DomSignalType, patterns);
                        devtoolMatches.push(...matched);
                    } else {
                        const matched = (sg as string[]).filter((line) =>
                            patterns.some((pattern) => pattern.test(line)),
                        );
                        devtoolMatches.push(...matched);
                    }
                });

                if (devtoolMatches.length) {
                    matches[devtool] = [...new Set(devtoolMatches)].slice(0, 50);
                }
            });

            if (Object.values(matches).some((match) => (match?.length ?? 0) > 0)) {
                return {
                    ok: true,
                    runId,
                    keywordsByDevtool,
                    devtools,
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
            keywordsByDevtool,
            matches: {},
        };
    },
    {
        name: 'system_grep',
        schema: z.object({
            runId: z.string().describe('Run id returned by browser.detect'),
            keywordsByDevtool: DevtoolKeywordSchema.describe('keyword about each devtool type'),
            devtools: z
                .array(z.nativeEnum(BrowseDevtool))
                .describe('Describe tab must be trace on devtool browser'),
        }),
    },
);
