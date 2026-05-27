import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import {
    DatabaseThinkingInputSchema,
    type DatabaseCheck,
    type DatabaseCheckPlan,
    type DatabaseSchemaResult,
} from '../../../../graph/database/database.type.js';
import { logger } from '../../../../observability/logger.js';
import { createDatabaseLLMTokenUsageCallback } from './llm-token-usage.js';
import { LlmOpenAI } from '../../../../llm/openai.llm.js';

const SQL_SOURCE_TYPES = new Set(['postgres', 'mysql', 'sqlite', 'mssql']);

const PROMPT = `
You are a database investigation planner.

Given a user issue and available database schemas, choose read-only checks that can confirm
whether relevant data exists.

Rules:
- Prefer collections/tables/keys whose names or fields match the issue.
- Choose only source and target names. Do not generate database queries.
- Use only connected sources from availableSources.
- Return only a valid JSON object matching the required shape.

Required JSON shape:
{
  "ok": true,
  "issue": "same issue string",
  "targets": [
    {
      "id": "stable-check-id",
      "source": "one connected source name",
      "targetKind": "collection",
      "target": "collection_or_table_or_key",
      "reason": "why this target matters"
    }
  ],
  "rationale": "short reason for the plan",
  "warnings": []
}

Constraints:
- source must be one of availableSources.
- targetKind must be one of: collection, table, key, keyPattern, source.
- Do not return query, filter, projection, aggregate, nextChecks, or explanatory markdown.
`;

const TargetSelectionSchema = z.object({
    ok: z.boolean(),
    issue: z.string(),
    targets: z.array(
        z.object({
            id: z.string().trim().min(1).optional(),
            source: z.string().trim().min(1),
            targetKind: z.enum(['collection', 'table', 'key', 'keyPattern', 'source']).optional(),
            target: z.string().trim().min(1),
            reason: z.string().trim().min(1),
        }),
    ),
    rationale: z.string(),
    warnings: z.array(z.string()).default([]),
});

type TargetSelection = z.infer<typeof TargetSelectionSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wordsFromText(text: string): string[] {
    return [
        ...new Set(
            text
                .split(/[^a-zA-Z0-9_-]+/)
                .map((word) => word.trim().toLowerCase())
                .filter((word) => word.length >= 3)
                .slice(0, 20),
        ),
    ];
}

function fieldNames(schema: unknown): string[] {
    if (!isRecord(schema)) return [];

    return Object.keys(schema).filter((key) => !key.startsWith('__') && key !== 'note');
}

function fieldType(schema: unknown, field: string): string | undefined {
    if (!isRecord(schema)) return undefined;
    const value = schema[field];
    if (!isRecord(value) || typeof value.type !== 'string') return undefined;
    return value.type;
}

function targetScore(target: string, targetSchema: unknown, words: string[]): number {
    const lowerTarget = target.toLowerCase();
    const fields = fieldNames(targetSchema).join(' ').toLowerCase();

    return words.reduce((score, word) => {
        if (lowerTarget.includes(word)) return score + 4;
        if (fields.includes(word)) return score + 2;
        return score;
    }, 0);
}

function compactSchema(schema: DatabaseSchemaResult): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [source, sourceSchema] of Object.entries(schema.schemas)) {
        if (!isRecord(sourceSchema)) {
            result[source] = sourceSchema;
            continue;
        }

        if (isRecord(sourceSchema.byType)) {
            result[source] = {
                keyPrefix: sourceSchema.keyPrefix,
                redisTypes: Object.keys(sourceSchema.byType),
                operations: sourceSchema.operations,
            };
            continue;
        }

        result[source] = Object.fromEntries(
            Object.entries(sourceSchema)
                .slice(0, 40)
                .map(([target, targetSchema]) => [
                    target,
                    {
                        fields: fieldNames(targetSchema).slice(0, 60),
                    },
                ]),
        );
    }

    return result;
}

function quoteSQLIdentifier(sourceType: string | undefined, identifier: string): string {
    const parts = identifier.split('.').filter(Boolean);

    if (sourceType === 'mysql') {
        return parts.map((part) => `\`${part.replaceAll('`', '``')}\``).join('.');
    }

    if (sourceType === 'mssql') {
        return parts.map((part) => `[${part.replaceAll(']', ']]')}]`).join('.');
    }

    return parts.map((part) => `"${part.replaceAll('"', '""')}"`).join('.');
}

function sqlSample(sourceType: string | undefined, target: string, limit: number): string {
    const table = quoteSQLIdentifier(sourceType, target);

    if (sourceType === 'mssql') {
        return `SELECT TOP (${limit}) * FROM ${table}`;
    }

    return `SELECT * FROM ${table} LIMIT ${limit}`;
}

function redisPattern(words: string[]): string {
    const first = words[0];
    if (!first) return '*';
    return `*${first.replaceAll('*', '')}*`;
}

function sourceEngine(sourceType: string | undefined, sourceSchema: unknown) {
    if (sourceType === 'redis' || (isRecord(sourceSchema) && isRecord(sourceSchema.byType))) {
        return 'redis';
    }

    if (sourceType === 'mongodb') {
        return 'mongodb';
    }

    if (sourceType && SQL_SOURCE_TYPES.has(sourceType)) {
        return 'sql';
    }

    return 'mongodb';
}

function rankedTargets(sourceSchema: unknown, words: string[]): string[] {
    if (!isRecord(sourceSchema)) return [];
    if (isRecord(sourceSchema.byType)) return Object.keys(sourceSchema.byType);

    return Object.entries(sourceSchema)
        .filter(([target]) => !target.startsWith('__') && target !== 'note' && target !== 'error')
        .map(([target, targetSchema]) => ({
            target,
            score: targetScore(target, targetSchema, words),
        }))
        .sort((left, right) => right.score - left.score)
        .map((item) => item.target);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDomain(issue: string): string | undefined {
    const match = issue.match(/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+\.[a-z]{2,}/i);
    return match?.[0]?.toLowerCase();
}

function startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function endOfToday(): Date {
    const start = startOfToday();
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function dateRangeFromIssue(issue: string): { start?: Date; end?: Date } {
    if (/\b(today)\b|h[oô]m nay|ng[aà]y h[oô]m nay/i.test(issue)) {
        return { start: startOfToday(), end: endOfToday() };
    }

    if (/\b(yesterday)\b|h[oô]m qua/i.test(issue)) {
        const end = startOfToday();
        return { start: new Date(end.getTime() - 24 * 60 * 60 * 1000), end };
    }

    if (/\b(last|past)\s+week\b|7\s+days?|tu[aầ]n v[uừ]a qua/i.test(issue)) {
        return { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    }

    if (/\b(last|past)\s+month\b|30\s+days?|th[aá]ng v[uừ]a qua/i.test(issue)) {
        return { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    return {};
}

function relevantMongoStringFields(targetSchema: unknown): string[] {
    return fieldNames(targetSchema).filter((field) => {
        const type = fieldType(targetSchema, field);
        return (
            type === 'string' &&
            /(domain|myshopify|shop_name|url|href|source\.url|email)/i.test(field)
        );
    });
}

function relevantDateFields(targetSchema: unknown): string[] {
    return fieldNames(targetSchema).filter((field) => {
        const type = fieldType(targetSchema, field);
        return (
            type === 'date' &&
            /(createdAt|updatedAt|date|last_active|start_trial_date|time_reset|timestamp)/i.test(field)
        );
    });
}

function relevantNumberDateFields(targetSchema: unknown): string[] {
    return fieldNames(targetSchema).filter((field) => {
        const type = fieldType(targetSchema, field);
        return type === 'number' && /(timestamp|time|created|updated|date)/i.test(field);
    });
}

function mongoProjection(targetSchema: unknown): Record<string, 1> {
    const projection: Record<string, 1> = { _id: 1 };
    const fields = [
        ...relevantMongoStringFields(targetSchema),
        ...relevantDateFields(targetSchema),
        ...relevantNumberDateFields(targetSchema),
        'domain',
        'shop',
        'shopify.myshopify_domain',
    ];

    for (const field of [...new Set(fields)].slice(0, 20)) {
        projection[field] = 1;
    }

    return projection;
}

function mongoSort(targetSchema: unknown): Record<string, -1> | undefined {
    const field = relevantDateFields(targetSchema)[0] ?? relevantNumberDateFields(targetSchema)[0];
    if (!field) return undefined;
    return { [field]: -1 };
}

function mongoFilter(issue: string, targetSchema: unknown): Record<string, unknown> {
    const clauses: Record<string, unknown>[] = [];
    const domain = extractDomain(issue);
    const range = dateRangeFromIssue(issue);

    if (domain) {
        const fields = relevantMongoStringFields(targetSchema);
        if (fields.length) {
            clauses.push({
                $or: fields.slice(0, 12).map((field) => ({
                    [field]: /url|href/i.test(field)
                        ? new RegExp(escapeRegExp(domain), 'i')
                        : domain,
                })),
            });
        }
    }

    if (range.start) {
        const dateClauses = relevantDateFields(targetSchema).slice(0, 8).map((field) => ({
            [field]: {
                $gte: range.start,
                ...(range.end ? { $lt: range.end } : {}),
            },
        }));
        const numberDateClauses = relevantNumberDateFields(targetSchema).slice(0, 8).map((field) => ({
            [field]: {
                $gte: range.start!.getTime(),
                ...(range.end ? { $lt: range.end.getTime() } : {}),
            },
        }));
        const allDateClauses = [...dateClauses, ...numberDateClauses];
        if (allDateClauses.length) {
            clauses.push({ $or: allDateClauses });
        }
    }

    if (!clauses.length) return {};
    if (clauses.length === 1) return clauses[0]!;
    return { $and: clauses };
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

function safeId(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function targetSchema(schema: DatabaseSchemaResult, source: string, target: string): unknown {
    const sourceSchema = schema.schemas[source];
    if (!isRecord(sourceSchema)) return undefined;
    if (target in sourceSchema) return sourceSchema[target];
    return undefined;
}

function buildCheckFromTarget(input: {
    issue: string;
    schema: DatabaseSchemaResult;
    sampleLimit: number;
    index: number;
    target: TargetSelection['targets'][number];
}): DatabaseCheck | null {
    const sourceSchema = input.schema.schemas[input.target.source];
    const sourceType = input.schema.sourceTypes[input.target.source];
    const engine = sourceEngine(sourceType, sourceSchema);
    const target = input.target.target;
    const reason = input.target.reason;
    const id = input.target.id ?? `${engine}-${input.target.source}-${target}-${input.index + 1}`;
    const words = wordsFromText(`${input.issue} ${target}`);

    if (engine === 'redis') {
        const pattern = target.includes('*') ? target : redisPattern(words);
        return {
            id: safeId(id),
            source: input.target.source,
            targetKind: 'keyPattern',
            target: pattern,
            reason,
            query: {
                engine: 'redis',
                operation: 'scan',
                key: '',
                pattern,
                count: input.sampleLimit,
            },
        };
    }

    if (engine === 'sql') {
        return {
            id: safeId(id),
            source: input.target.source,
            targetKind: 'table',
            target,
            reason,
            query: {
                engine: 'sql',
                sql: sqlSample(sourceType, target, input.sampleLimit),
                limit: input.sampleLimit,
            },
        };
    }

    const schemaForTarget = targetSchema(input.schema, input.target.source, target);
    const query: DatabaseCheck['query'] = {
        engine: 'mongodb',
        collection: target,
        filter: mongoFilter(input.issue, schemaForTarget),
        projection: mongoProjection(schemaForTarget),
        limit: input.sampleLimit,
    };
    const sort = mongoSort(schemaForTarget);
    if (sort) query.sort = sort;

    return {
        id: safeId(id),
        source: input.target.source,
        targetKind: 'collection',
        target,
        reason,
        query,
    };
}

function selectionToPlan(input: {
    app?: string;
    issue: string;
    schema: DatabaseSchemaResult;
    selection: TargetSelection;
    maxChecks: number;
    sampleLimit: number;
}): DatabaseCheckPlan {
    const validSources = new Set(input.schema.availableSources);
    const warnings = [...input.selection.warnings];
    const checks = input.selection.targets
        .filter((target) => validSources.has(target.source))
        .slice(0, input.maxChecks)
        .map((target, index) =>
            buildCheckFromTarget({
                issue: input.issue,
                schema: input.schema,
                sampleLimit: input.sampleLimit,
                index,
                target,
            }),
        )
        .filter((check): check is DatabaseCheck => Boolean(check));

    if (checks.length < input.selection.targets.length) {
        warnings.push('Some LLM-selected targets were dropped because they referenced unavailable sources.');
    }

    if (!checks.length) {
        return fallbackPlan(input);
    }

    return {
        ok: true,
        issue: input.issue,
        checks,
        rationale: input.selection.rationale,
        warnings,
    };
}

function fallbackPlan(input: {
    app?: string;
    issue: string;
    schema: DatabaseSchemaResult;
    maxChecks: number;
    sampleLimit: number;
}): DatabaseCheckPlan {
    const warnings: string[] = [];
    const checks: DatabaseCheck[] = [];
    const words = wordsFromText(`${input.app ?? ''} ${input.issue}`);

    for (const source of input.schema.availableSources) {
        const sourceSchema = input.schema.schemas[source];
        const sourceType = input.schema.sourceTypes[source];
        const engine = sourceEngine(sourceType, sourceSchema);

        if (engine === 'redis') {
            checks.push({
                id: `redis-${source}-scan`,
                source,
                targetKind: 'keyPattern',
                target: redisPattern(words),
                reason: `Scan Redis keys for terms related to "${input.issue}".`,
                query: {
                    engine: 'redis',
                    operation: 'scan',
                    key: '',
                    pattern: redisPattern(words),
                    count: input.sampleLimit,
                },
            });
            if (checks.length >= input.maxChecks) break;
            continue;
        }

        const targets = rankedTargets(sourceSchema, words).slice(0, input.maxChecks);
        if (!targets.length) {
            warnings.push(`No inspectable targets found for source "${source}".`);
            continue;
        }

        for (const target of targets) {
            if (engine === 'sql') {
                checks.push({
                    id: `sql-${source}-${target}`,
                    source,
                    targetKind: 'table',
                    target,
                    reason: `Sample table "${target}" to verify whether related rows exist.`,
                    query: {
                        engine: 'sql',
                        sql: sqlSample(sourceType, target, input.sampleLimit),
                        limit: input.sampleLimit,
                    },
                });
            } else {
                checks.push({
                    id: `mongo-${source}-${target}`,
                    source,
                    targetKind: 'collection',
                    target,
                    reason: `Sample collection "${target}" to verify whether related documents exist.`,
                    query: {
                        engine: 'mongodb',
                        collection: target,
                        filter: {},
                        limit: input.sampleLimit,
                    },
                });
            }

            if (checks.length >= input.maxChecks) break;
        }

        if (checks.length >= input.maxChecks) break;
    }

    if (!checks.length) {
        warnings.push('No database checks could be generated from the connected schemas.');
    }

    return {
        ok: checks.length > 0,
        issue: input.issue,
        checks,
        rationale: 'Fallback plan generated from schema target names and issue keywords.',
        warnings,
    };
}

function normalizePlan(plan: DatabaseCheckPlan, schema: DatabaseSchemaResult, maxChecks: number) {
    const validSources = new Set(schema.availableSources);
    const checks = plan.checks.filter((check) => validSources.has(check.source)).slice(0, maxChecks);
    const warnings = [...plan.warnings];

    if (checks.length < plan.checks.length) {
        warnings.push('Some checks were dropped because they referenced unavailable sources.');
    }

    return {
        ...plan,
        ok: checks.length > 0,
        checks,
        warnings,
    };
}

export const databaseThinking = tool(
    async (input): Promise<DatabaseCheckPlan> => {
        const parsed = DatabaseThinkingInputSchema.parse(input);
        const maxChecks = parsed.maxChecks ?? 8;
        const sampleLimit = parsed.sampleLimit ?? 10;

        try {
            const llm = await LlmOpenAI();
            const response = await llm.invoke(
                [
                    { role: 'system', content: PROMPT },
                    {
                        role: 'user',
                        content: JSON.stringify(
                            {
                                app: parsed.app,
                                issue: parsed.issue,
                                maxChecks,
                                sampleLimit,
                                availableSources: parsed.schema.availableSources,
                                sourceTypes: parsed.schema.sourceTypes,
                                schema: compactSchema(parsed.schema),
                            },
                            null,
                            2,
                        ),
                    },
                ],
                {
                    response_format: { type: 'json_object' },
                    callbacks: [createDatabaseLLMTokenUsageCallback('database.thinking')],
                },
            );
            const selection = TargetSelectionSchema.parse(parseJSONContent(contentToText(response.content)));

            const planInput = {
                issue: parsed.issue,
                schema: parsed.schema,
                selection,
                maxChecks,
                sampleLimit,
            };

            const plan = parsed.app
                ? selectionToPlan({ ...planInput, app: parsed.app })
                : selectionToPlan(planInput);

            return normalizePlan(
                plan,
                parsed.schema,
                maxChecks,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`database.thinking fallback: ${message}`);
            const fallbackInput = {
                issue: parsed.issue,
                schema: parsed.schema,
                maxChecks,
                sampleLimit,
            };
            if (parsed.app) {
                return fallbackPlan({
                    ...fallbackInput,
                    app: parsed.app,
                });
            }

            return fallbackPlan(fallbackInput);
        }
    },
    {
        name: 'database_thinking',
        description:
            'Infer which database collections, tables, or keys should be checked for a user issue.',
        schema: DatabaseThinkingInputSchema,
    },
);
