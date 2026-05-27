import { tool } from '@langchain/core/tools';

import {
    DatabaseInsightInputSchema,
    DatabaseInsightResultSchema,
    type DatabaseInsightInput,
    type DatabaseInsightResult,
} from '../../../../graph/database/database.type.js';
import { LlmOpenAI } from '../../../../llm/openai.llm.js';
import { logger } from '../../../../observability/logger.js';
import { createDatabaseLLMTokenUsageCallback } from './llm-token-usage.js';

const PROMPT = `
You are a database diagnosis agent.

Summarize the executed read-only database checks for the user's issue.

Rules:
- Ground findings only in the schema, planned checks, and execution results.
- Say when data exists, when no data was found, and when a check failed.
- Suggest concrete next database checks only; do not suggest writes or migrations.
- Keep the summary concise and operational.
- Return only a valid JSON object matching the requested output schema.

Required JSON shape:
{
  "ok": true,
  "summary": "one concise string summary, never an object",
  "likelySources": ["sourceName"],
  "likelyTargets": ["collection_or_table_or_key"],
  "findings": ["concrete evidence from the executed checks"],
  "suggestedNextChecks": ["short text description of the next read-only check"],
  "confidence": "low"
}

Constraints:
- summary must be a string.
- likelySources, likelyTargets, findings, and suggestedNextChecks must be arrays of strings.
- suggestedNextChecks must not contain query objects.
- confidence must be exactly one of: low, medium, high.
- Do not use keys named nextChecks, analytics, shops, events, or settings at the top level.
`;

const VALID_CONFIDENCE = new Set(['low', 'medium', 'high']);

function fallbackInsight(input: DatabaseInsightInput): DatabaseInsightResult {
    const executed = input.execution.results;
    const found = executed.filter((result) => result.exists);
    const failed = executed.filter((result) => !result.ok);
    const likelySources = [...new Set(executed.map((result) => result.source))];
    const likelyTargets = [...new Set(found.length ? found.map((result) => result.target) : executed.map((result) => result.target))];
    const findings = executed.map((result) => {
        if (!result.ok) {
            return `${result.source}/${result.target}: check failed: ${result.error ?? 'unknown error'}`;
        }

        return `${result.source}/${result.target}: ${result.exists ? `found ${result.rowCount} row(s)` : 'no data found'}`;
    });

    return {
        ok: failed.length === 0 && found.length > 0,
        summary: found.length
            ? `Found data in ${found.length} database target(s) for "${input.issue}".`
            : `No matching data was confirmed for "${input.issue}" across ${executed.length} database check(s).`,
        likelySources,
        likelyTargets,
        findings,
        suggestedNextChecks: failed.length
            ? ['Fix failed check inputs or source connectivity, then rerun the same database checks.']
            : ['Add narrower filters from concrete identifiers in the issue, then rerun focused checks.'],
        confidence: found.length ? 'medium' : failed.length ? 'low' : 'low',
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function contentToText(content: unknown): string {
    if (typeof content === 'string') return content;
    return JSON.stringify(content);
}

function parseJSONContent(content: string): unknown {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return JSON.parse(fenced?.[1] ?? trimmed);
}

function stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (typeof item === 'string') return item;
            if (isRecord(item) && typeof item.reason === 'string') return item.reason;
            return JSON.stringify(item);
        })
        .filter(Boolean);
}

function summarizeLooseSummary(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value;
    if (!isRecord(value)) return undefined;

    return Object.entries(value)
        .map(([target, detail]) => {
            if (!isRecord(detail)) return `${target}: ${JSON.stringify(detail)}`;

            const parts = [target];
            if (typeof detail.exists === 'boolean') {
                parts.push(detail.exists ? 'data exists' : 'no data found');
            }
            if (typeof detail.rowCount === 'number') {
                parts.push(`${detail.rowCount} row(s)`);
            }
            if (typeof detail.todayRecord === 'boolean') {
                parts.push(detail.todayRecord ? 'today record exists' : 'no today record');
            }
            if (typeof detail.note === 'string') {
                parts.push(detail.note);
            }

            return parts.join(': ');
        })
        .join('; ');
}

function findingsFromLooseSummary(value: unknown): string[] {
    if (!isRecord(value)) return [];

    return Object.entries(value).map(([target, detail]) => {
        if (!isRecord(detail)) return `${target}: ${JSON.stringify(detail)}`;

        const note = typeof detail.note === 'string' ? detail.note : '';
        const rowCount = typeof detail.rowCount === 'number' ? ` (${detail.rowCount} row(s))` : '';
        const exists =
            typeof detail.exists === 'boolean'
                ? detail.exists
                    ? 'data exists'
                    : 'no data found'
                : 'checked';

        return `${target}: ${exists}${rowCount}${note ? ` - ${note}` : ''}`;
    });
}

function normalizeInsightResult(raw: unknown, input: DatabaseInsightInput): DatabaseInsightResult {
    const strict = DatabaseInsightResultSchema.safeParse(raw);
    if (strict.success) return strict.data;

    const fallback = fallbackInsight(input);
    if (!isRecord(raw)) return fallback;

    const looseSummary = raw.summary;
    const summary = summarizeLooseSummary(looseSummary) ?? fallback.summary;
    const looseTargets = isRecord(looseSummary) ? Object.keys(looseSummary) : [];
    const nextChecks = stringArray(raw.suggestedNextChecks ?? raw.nextChecks);
    const nextCheckSources = Array.isArray(raw.nextChecks)
        ? raw.nextChecks
              .map((item) => (isRecord(item) && typeof item.source === 'string' ? item.source : undefined))
              .filter((source): source is string => Boolean(source))
        : [];

    return DatabaseInsightResultSchema.parse({
        ok: typeof raw.ok === 'boolean' ? raw.ok : fallback.ok,
        summary,
        likelySources: stringArray(raw.likelySources).length
            ? stringArray(raw.likelySources)
            : [...new Set([...fallback.likelySources, ...nextCheckSources])],
        likelyTargets: stringArray(raw.likelyTargets).length
            ? stringArray(raw.likelyTargets)
            : looseTargets.length
              ? looseTargets
              : fallback.likelyTargets,
        findings: stringArray(raw.findings).length
            ? stringArray(raw.findings)
            : findingsFromLooseSummary(looseSummary).length
              ? findingsFromLooseSummary(looseSummary)
              : fallback.findings,
        suggestedNextChecks: nextChecks.length ? nextChecks : fallback.suggestedNextChecks,
        confidence:
            typeof raw.confidence === 'string' && VALID_CONFIDENCE.has(raw.confidence)
                ? raw.confidence
                : fallback.confidence,
    });
}

function compactExecution(input: DatabaseInsightInput) {
    return {
        app: input.app,
        issue: input.issue,
        sourceTypes: input.schema.sourceTypes,
        plan: {
            rationale: input.plan.rationale,
            checks: input.plan.checks.map((check) => ({
                id: check.id,
                source: check.source,
                targetKind: check.targetKind,
                target: check.target,
                reason: check.reason,
            })),
        },
        execution: input.execution.results.map((result) => ({
            id: result.id,
            source: result.source,
            targetKind: result.targetKind,
            target: result.target,
            ok: result.ok,
            exists: result.exists,
            rowCount: result.rowCount,
            error: result.error,
            sample: result.sample.slice(0, 3),
        })),
    };
}

export const databaseInsight = tool(
    async (input): Promise<DatabaseInsightResult> => {
        const parsed = DatabaseInsightInputSchema.parse(input);

        try {
            const llm = await LlmOpenAI();
            const response = await llm.invoke(
                [
                    { role: 'system', content: PROMPT },
                    {
                        role: 'user',
                        content: JSON.stringify(compactExecution(parsed), null, 2),
                    },
                ],
                {
                    response_format: { type: 'json_object' },
                    callbacks: [createDatabaseLLMTokenUsageCallback('database.insight')],
                },
            );
            const result = normalizeInsightResult(parseJSONContent(contentToText(response.content)), parsed);

            return {
                ...result,
                ok: result.ok && parsed.execution.results.some((item) => item.exists),
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`database.insight fallback: ${message}`);
            return fallbackInsight(parsed);
        }
    },
    {
        name: 'database_insight',
        description:
            'Summarize database check results and suggest the next read-only checks for an issue.',
        schema: DatabaseInsightInputSchema,
    },
);
