import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
    makeAppConfigRepo,
    makeMemoryRepo,
    makeSupportRunRepo,
    makeSupportRunStepRepo,
    makeWorkflowConfigRepo,
    type MemoryListFilters,
    type MemoryPatch,
    type SupportRunListFilters,
} from '../repo/index.js';
import type {
    AppConfig,
    DbSourceConfig,
    Memory,
    NewMemory,
    NewSupportRun,
    NewSupportRunStep,
    SupportRunStatus,
} from '../schema/index.js';
import { AppDatabaseConfigSchema, type AppDatabaseConfig } from '../../graph/database/database.type.js';
import {
    invokeSupportGraph,
    SupportGraphInputSchema,
    SupportGraphNameSchema,
    type ParsedSupportGraphInput,
    type SupportGraphOutput,
    type SupportGraphStep,
    type SupportMemorySnapshot,
} from '../../graph/support/support.graph.js';
import { ConfigReferenceError } from './config.service.js';

const JsonMapSchema = z.record(z.string(), z.unknown());

const NamespaceSchema = z.union([
    z.string().trim().min(1),
    z.array(z.string().trim().min(1)).min(1),
]);

const MemoryConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const SupportRunInputSchema = z.object({
    appKey: z.string().trim().min(1).max(64).default('default-shopify-app'),
    workflowKey: z.string().trim().min(1).max(64).default('support-default'),
    issue: z.string().trim().min(1),
    storeUrl: z.string().trim().min(1).optional(),
    storeDomain: z.string().trim().min(1).optional(),
    threadId: z.string().trim().min(1).optional(),
    mode: z.enum(['diagnose', 'search', 'fix']).default('diagnose'),
    maxHypotheses: z.number().int().positive().max(6).default(4),
    repoName: z.string().trim().min(1).optional(),
    repoNames: z.array(z.string().trim().min(1)).default([]),
    metadata: JsonMapSchema.default({}),
});

export const SupportRunListQuerySchema = z.object({
    appKey: z.string().trim().min(1).optional(),
    threadId: z.string().trim().min(1).optional(),
    status: z.enum(['queued', 'running', 'interrupted', 'partial', 'completed', 'failed']).optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
});

export const MemoryInputSchema = z.object({
    namespace: NamespaceSchema,
    key: z.string().trim().min(1).max(160).optional(),
    kind: z.string().trim().min(1).max(40).default('fact'),
    content: z.string().trim().min(1),
    value: JsonMapSchema.default({}),
    confidence: MemoryConfidenceSchema.default('medium'),
    sourceRunId: z.string().uuid().nullable().optional(),
    sourceStepId: z.string().uuid().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
});

export const MemoryListQuerySchema = z.object({
    namespace: NamespaceSchema.optional(),
    kind: z.string().trim().min(1).optional(),
    query: z.string().trim().min(1).optional(),
    includeExpired: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => (value === undefined ? undefined : value === 'true')),
    limit: z.coerce.number().int().positive().max(200).optional(),
});

export const MemoryPatchSchema = z
    .object({
        namespace: NamespaceSchema.optional(),
        key: z.string().trim().min(1).max(160).optional(),
        kind: z.string().trim().min(1).max(40).optional(),
        content: z.string().trim().min(1).optional(),
        value: JsonMapSchema.optional(),
        confidence: MemoryConfidenceSchema.optional(),
        sourceRunId: z.string().uuid().nullable().optional(),
        sourceStepId: z.string().uuid().nullable().optional(),
        expiresAt: z.string().datetime().nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: 'Patch body must include at least one field.',
    });

export type SupportRunInput = z.input<typeof SupportRunInputSchema>;
export type MemoryInput = z.input<typeof MemoryInputSchema>;

function asJsonMap(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    return { value };
}

export function normalizeMemoryNamespace(namespace: z.input<typeof NamespaceSchema>): string {
    const parts = Array.isArray(namespace) ? namespace : namespace.split('.');
    return parts
        .map((part) => part.trim())
        .filter(Boolean)
        .join('.');
}

function memoryKey(content: string): string {
    const normalized = content
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96);
    return normalized || `memory-${randomUUID()}`;
}

function domainFromUrl(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const raw = /^https?:\/\//i.test(value) ? value : `https://${value}`;

    try {
        return new URL(raw).hostname.toLowerCase();
    } catch {
        return undefined;
    }
}

function supportNamespace(appKey: string, storeDomain?: string): string {
    return ['support', appKey, storeDomain].filter(Boolean).join('.');
}

function resolveSecretRef(secretRef: string | undefined): string | undefined {
    if (!secretRef) return undefined;
    const envMatch = secretRef.match(/^env:([A-Z0-9_]+)$/i);
    if (!envMatch) return undefined;
    return process.env[envMatch[1] ?? '']?.trim() || undefined;
}

function resolveDbSources(sources: DbSourceConfig[]): AppDatabaseConfig | undefined {
    if (!sources.length) return undefined;

    const resolved = Object.fromEntries(
        sources.map((source) => {
            const config = {
                ...(source.config ?? {}),
                type: source.type,
            };
            const secret = resolveSecretRef(source.secretRef);

            if (secret) {
                if (source.type === 'mongodb') {
                    Object.assign(config, { uri: secret });
                } else if (source.type === 'redis') {
                    Object.assign(config, { url: secret });
                } else {
                    Object.assign(config, { dsn: secret });
                }
            }

            return [source.key, config];
        }),
    );

    const parsed = AppDatabaseConfigSchema.safeParse(resolved);
    return parsed.success ? parsed.data : undefined;
}

function graphOrderFromConfig(
    graphOrder: string[],
): ParsedSupportGraphInput['graphOrder'] | undefined {
    const parsed = graphOrder.filter((graph) => SupportGraphNameSchema.safeParse(graph).success);
    return parsed.length ? (parsed as ParsedSupportGraphInput['graphOrder']) : undefined;
}

function memorySnapshot(row: Memory): SupportMemorySnapshot {
    return {
        id: row.id,
        namespace: row.namespace,
        key: row.key,
        kind: row.kind,
        content: row.content,
        confidence: row.confidence,
        value: row.value,
    };
}

function cleanMemory(input: MemoryInput): NewMemory {
    const data = MemoryInputSchema.parse(input);
    const namespace = normalizeMemoryNamespace(data.namespace);

    return {
        namespace,
        key: data.key ?? memoryKey(data.content),
        kind: data.kind,
        content: data.content,
        value: data.value,
        confidence: data.confidence,
        sourceRunId: data.sourceRunId ?? null,
        sourceStepId: data.sourceStepId ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    };
}

function cleanMemoryPatch(input: z.infer<typeof MemoryPatchSchema>): MemoryPatch {
    return {
        ...(input.namespace !== undefined
            ? { namespace: normalizeMemoryNamespace(input.namespace) }
            : {}),
        ...(input.key !== undefined ? { key: input.key } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.sourceRunId !== undefined ? { sourceRunId: input.sourceRunId } : {}),
        ...(input.sourceStepId !== undefined ? { sourceStepId: input.sourceStepId } : {}),
        ...(input.expiresAt !== undefined
            ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
            : {}),
        updatedAt: new Date(),
    };
}

async function loadRunMemories(
    memories: ReturnType<typeof makeMemoryRepo>,
    appKey: string,
    storeDomain: string | undefined,
): Promise<SupportMemorySnapshot[]> {
    const appMemories = await memories.list({
        namespace: supportNamespace(appKey),
        limit: 10,
    });
    const storeMemories = storeDomain
        ? await memories.list({
              namespace: supportNamespace(appKey, storeDomain),
              limit: 20,
          })
        : [];
    const byKey = new Map<string, Memory>();

    for (const item of [...appMemories, ...storeMemories]) {
        byKey.set(`${item.namespace}:${item.key}`, item);
    }

    return [...byKey.values()].map(memorySnapshot);
}

function runRecord(input: {
    parsed: z.infer<typeof SupportRunInputSchema>;
    appConfig: AppConfig;
    appName: string;
    workflowKey: string;
    storeUrl?: string | undefined;
    storeDomain?: string | undefined;
    threadId: string;
}): NewSupportRun {
    return {
        threadId: input.threadId,
        appKey: input.appConfig.key,
        workflowKey: input.workflowKey,
        appName: input.appName,
        issue: input.parsed.issue,
        status: 'running',
        input: {
            appKey: input.parsed.appKey,
            workflowKey: input.parsed.workflowKey,
            issue: input.parsed.issue,
            mode: input.parsed.mode,
            maxHypotheses: input.parsed.maxHypotheses,
            repoName: input.parsed.repoName,
            repoNames: input.parsed.repoNames,
            storeUrl: input.storeUrl,
            storeDomain: input.storeDomain,
        },
        metadata: input.parsed.metadata,
        ...(input.storeUrl ? { storeUrl: input.storeUrl } : {}),
        ...(input.storeDomain ? { storeDomain: input.storeDomain } : {}),
    };
}

function stepRecord(runId: string, step: SupportGraphStep): NewSupportRunStep {
    return {
        runId,
        stepKey: step.stepKey,
        graph: step.graph,
        status: step.status,
        input: asJsonMap(step.input),
        metadata: {
            ...(step.metadata ?? {}),
            ...(step.reason ? { reason: step.reason } : {}),
        },
        startedAt: new Date(step.startedAt),
        finishedAt: new Date(step.finishedAt),
        ...(step.output !== undefined ? { output: asJsonMap(step.output) } : {}),
        ...(step.error ? { error: step.error } : {}),
    };
}

async function persistOutputMemories(input: {
    memories: ReturnType<typeof makeMemoryRepo>;
    runId: string;
    namespace: string;
    output: SupportGraphOutput;
}): Promise<void> {
    await input.memories.upsert({
        namespace: input.namespace,
        key: `run.${input.runId}.summary`,
        kind: 'summary',
        content: input.output.summary,
        value: {
            status: input.output.status,
            missingContext: input.output.missingContext,
            evidence: input.output.evidence,
        },
        confidence: 'medium',
        sourceRunId: input.runId,
        sourceStepId: null,
        expiresAt: null,
    });

    if (input.output.hypothesis?.caseType) {
        await input.memories.upsert({
            namespace: input.namespace,
            key: 'last.case_type',
            kind: 'context',
            content: `Last classified support case type: ${input.output.hypothesis.caseType}`,
            value: {
                caseType: input.output.hypothesis.caseType,
                issue: input.output.issue,
            },
            confidence: 'medium',
            sourceRunId: input.runId,
            sourceStepId: null,
            expiresAt: null,
        });
    }
}

export const makeMemorySvc = (repo = makeMemoryRepo()) => ({
    add: (input: MemoryInput) => repo.add(cleanMemory(input)),
    save: (input: MemoryInput) => repo.upsert(cleanMemory(input)),
    list: (filters: Partial<z.infer<typeof MemoryListQuerySchema>> = {}) =>
        repo.list({
            namespace: filters.namespace ? normalizeMemoryNamespace(filters.namespace) : undefined,
            kind: filters.kind,
            query: filters.query,
            includeExpired: filters.includeExpired,
            limit: filters.limit,
        } satisfies MemoryListFilters),
    byId: repo.byId,
    set: (id: string, patch: z.infer<typeof MemoryPatchSchema>) =>
        repo.set(id, cleanMemoryPatch(patch)),
    del: repo.del,
});

export const makeSupportRuntimeSvc = (
    runs = makeSupportRunRepo(),
    steps = makeSupportRunStepRepo(),
    memories = makeMemoryRepo(),
    apps = makeAppConfigRepo(),
    workflows = makeWorkflowConfigRepo(),
) => ({
    listRuns: (filters: SupportRunListFilters = {}) => runs.list(filters),
    byId: runs.byId,
    listSteps: steps.listByRun,

    run: async (input: SupportRunInput) => {
        const parsed = SupportRunInputSchema.parse(input);
        const [appConfig, workflow] = await Promise.all([
            apps.byKey(parsed.appKey),
            workflows.byKey(parsed.workflowKey),
        ]);

        if (!appConfig || !appConfig.enabled) {
            throw new ConfigReferenceError(`App config not found or disabled: ${parsed.appKey}`);
        }

        if (!workflow || !workflow.enabled) {
            throw new ConfigReferenceError(
                `Workflow config not found or disabled: ${parsed.workflowKey}`,
            );
        }

        const storeUrl = parsed.storeUrl ?? appConfig.defaultStoreUrl ?? undefined;
        const storeDomain =
            parsed.storeDomain?.toLowerCase() ?? domainFromUrl(storeUrl) ?? undefined;
        const threadId = parsed.threadId ?? `support-${appConfig.key}-${randomUUID()}`;
        const namespace = supportNamespace(appConfig.key, storeDomain);
        const graphInput = SupportGraphInputSchema.parse({
            app: appConfig.name,
            appKey: appConfig.key,
            issue: parsed.issue,
            storeUrl,
            storeDomain,
            threadId,
            mode: parsed.mode,
            maxHypotheses: parsed.maxHypotheses,
            graphOrder: graphOrderFromConfig(workflow.graphOrder),
            routingPolicy: workflow.routingPolicy,
            repos: appConfig.repos,
            repoName: parsed.repoName,
            repoNames: parsed.repoNames,
            dbSources: resolveDbSources(appConfig.dbSources),
            memories: await loadRunMemories(memories, appConfig.key, storeDomain),
            metadata: {
                ...parsed.metadata,
                workflowId: workflow.id,
                defaultAgentId: workflow.defaultAgentId,
            },
        });

        const run = await runs.add(
            runRecord({
                parsed,
                appConfig,
                appName: appConfig.name,
                workflowKey: workflow.key,
                storeUrl,
                storeDomain,
                threadId,
            }),
        );

        try {
            const output = await invokeSupportGraph(graphInput);
            await Promise.all(output.steps.map((step) => steps.add(stepRecord(run.id, step))));
            await persistOutputMemories({
                memories,
                runId: run.id,
                namespace,
                output,
            });

            const updated = await runs.set(run.id, {
                status: output.status as SupportRunStatus,
                output: asJsonMap(output),
                updatedAt: new Date(),
            });
            if (!updated) throw new Error(`Support run disappeared before update: ${run.id}`);
            return updated;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await runs.set(run.id, {
                status: 'failed',
                error: message,
                updatedAt: new Date(),
            });
            throw error;
        }
    },
});

export const memorySvc = makeMemorySvc();
export const supportRuntimeSvc = makeSupportRuntimeSvc();
