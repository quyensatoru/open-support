import { z } from 'zod';

import { CodeRepoReferenceSchema } from '../code/code.type.js';
import { AppDatabaseConfigSchema } from '../database/database.type.js';
import { HypothesisGraphOutputSchema } from '../planning/hypothesis.type.js';

const JsonMapSchema = z.record(z.string(), z.unknown());

export const SupportGraphNameSchema = z.enum([
    'hypothesisGraph',
    'browserDiagnoseGraph',
    'codeGraph',
    'databaseGraph',
]);

export const SupportExecutorGraphNameSchema = z.enum([
    'browserDiagnoseGraph',
    'codeGraph',
    'databaseGraph',
]);

export const SupportRunModeSchema = z.enum(['diagnose', 'search', 'fix']);
export const SupportGraphStatusSchema = z.enum([
    'completed',
    'interrupted',
    'partial',
    'failed',
]);
export const SupportStepStatusSchema = z.enum([
    'running',
    'completed',
    'skipped',
    'interrupted',
    'failed',
]);

export const SupportMemorySnapshotSchema = z.object({
    id: z.string().optional(),
    namespace: z.string().trim().min(1),
    key: z.string().trim().min(1),
    kind: z.string().trim().min(1),
    content: z.string().trim().min(1),
    confidence: z.enum(['low', 'medium', 'high']).default('medium'),
    value: JsonMapSchema.default({}),
});

export const SupportGraphInputSchema = z.object({
    app: z.string().trim().min(1),
    appKey: z.string().trim().min(1).optional(),
    issue: z.string().trim().min(1),
    storeUrl: z.string().trim().min(1).optional(),
    storeDomain: z.string().trim().min(1).optional(),
    threadId: z.string().trim().min(1).optional(),
    mode: SupportRunModeSchema.default('diagnose'),
    maxHypotheses: z.number().int().positive().max(6).default(4),
    graphOrder: z.array(SupportGraphNameSchema).default([
        'hypothesisGraph',
        'browserDiagnoseGraph',
        'codeGraph',
        'databaseGraph',
    ]),
    routingPolicy: z.string().trim().min(1).default('evidence-driven'),
    repos: z.array(CodeRepoReferenceSchema).default([]),
    repoName: z.string().trim().min(1).optional(),
    repoNames: z.array(z.string().trim().min(1)).default([]),
    dbSources: AppDatabaseConfigSchema.optional(),
    memories: z.array(SupportMemorySnapshotSchema).default([]),
    metadata: JsonMapSchema.default({}),
});

export const SupportGraphStepSchema = z.object({
    stepKey: z.string().trim().min(1),
    graph: SupportGraphNameSchema,
    status: SupportStepStatusSchema,
    reason: z.string().optional(),
    input: JsonMapSchema.default({}),
    output: z.unknown().optional(),
    error: z.string().optional(),
    startedAt: z.string(),
    finishedAt: z.string(),
    metadata: JsonMapSchema.default({}),
});

export const SupportEvidenceSchema = z.object({
    graph: SupportGraphNameSchema,
    status: SupportStepStatusSchema,
    summary: z.string().optional(),
    reason: z.string().optional(),
});

export const SupportGraphOutputSchema = z.object({
    app: z.string(),
    appKey: z.string().optional(),
    issue: z.string(),
    storeUrl: z.string().optional(),
    storeDomain: z.string().optional(),
    threadId: z.string().optional(),
    mode: SupportRunModeSchema,
    status: SupportGraphStatusSchema,
    summary: z.string(),
    hypothesis: HypothesisGraphOutputSchema.optional(),
    steps: z.array(SupportGraphStepSchema),
    evidence: z.array(SupportEvidenceSchema),
    memoriesUsed: z.array(SupportMemorySnapshotSchema),
    missingContext: z.array(z.string()),
    errors: z.array(z.string()),
});

export type SupportGraphName = z.infer<typeof SupportGraphNameSchema>;
export type SupportExecutorGraphName = z.infer<typeof SupportExecutorGraphNameSchema>;
export type SupportRunMode = z.infer<typeof SupportRunModeSchema>;
export type SupportGraphStatus = z.infer<typeof SupportGraphStatusSchema>;
export type SupportStepStatus = z.infer<typeof SupportStepStatusSchema>;
export type SupportMemorySnapshot = z.infer<typeof SupportMemorySnapshotSchema>;
export type SupportGraphInput = z.input<typeof SupportGraphInputSchema>;
export type ParsedSupportGraphInput = z.infer<typeof SupportGraphInputSchema>;
export type SupportGraphStep = z.infer<typeof SupportGraphStepSchema>;
export type SupportEvidence = z.infer<typeof SupportEvidenceSchema>;
export type SupportGraphOutput = z.infer<typeof SupportGraphOutputSchema>;
