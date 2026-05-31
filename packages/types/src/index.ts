import { z } from 'zod';

export const AgentRunStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AgentRunRequestSchema = z.object({
    message: z.string().trim().min(1),
    threadId: z.string().trim().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;

export const AgentRunSchema = z.object({
    id: z.string(),
    status: AgentRunStatusSchema,
    input: AgentRunRequestSchema,
    output: z.unknown().optional(),
    error: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const ToolSourceSchema = z.enum(['local', 'playwright', 'mcp-placeholder']);
export type ToolSource = z.infer<typeof ToolSourceSchema>;

export const ToolDefinitionSchema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    enabled: z.boolean(),
    source: ToolSourceSchema,
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const SkillDefinitionSchema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    instructions: z.string().trim().min(1),
    toolIds: z.array(z.string().trim().min(1)),
    enabled: z.boolean(),
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const AgentSettingsSchema = z.object({
    model: z.string(),
    openAiConfigured: z.boolean(),
    langSmithTracing: z.boolean(),
    playwrightHeadless: z.boolean(),
    mcpStatus: z.literal('placeholder'),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

export const ConfigResourceSchema = z.enum([
    'llms',
    'agents',
    'apps',
    'workflows',
    'tools',
    'skills',
]);
export type ConfigResource = z.infer<typeof ConfigResourceSchema>;

export const SupportRunStatusSchema = z.enum([
    'queued',
    'running',
    'interrupted',
    'partial',
    'completed',
    'failed',
]);
export type SupportRunStatus = z.infer<typeof SupportRunStatusSchema>;

export const SupportRunRequestSchema = z.object({
    appKey: z.string().trim().min(1).default('default-shopify-app'),
    workflowKey: z.string().trim().min(1).default('support-default'),
    issue: z.string().trim().min(1),
    storeUrl: z.string().trim().min(1).optional(),
    storeDomain: z.string().trim().min(1).optional(),
    threadId: z.string().trim().min(1).optional(),
    mode: z.enum(['diagnose', 'search', 'fix']).default('diagnose'),
    maxHypotheses: z.number().int().positive().max(6).default(4),
    repoName: z.string().trim().min(1).optional(),
    repoNames: z.array(z.string().trim().min(1)).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SupportRunRequest = z.input<typeof SupportRunRequestSchema>;

export const SupportRunSchema = z.object({
    id: z.string(),
    threadId: z.string(),
    appKey: z.string(),
    workflowKey: z.string(),
    appName: z.string(),
    storeUrl: z.string().nullable().optional(),
    storeDomain: z.string().nullable().optional(),
    issue: z.string(),
    status: SupportRunStatusSchema,
    input: z.record(z.string(), z.unknown()),
    output: z.record(z.string(), z.unknown()).nullable().optional(),
    error: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type SupportRun = z.infer<typeof SupportRunSchema>;

export const SupportRunStepSchema = z.object({
    id: z.string(),
    runId: z.string(),
    stepKey: z.string(),
    graph: z.string(),
    status: z.enum(['running', 'completed', 'skipped', 'interrupted', 'failed']),
    input: z.record(z.string(), z.unknown()),
    output: z.record(z.string(), z.unknown()).nullable().optional(),
    error: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()),
    startedAt: z.string(),
    finishedAt: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type SupportRunStep = z.infer<typeof SupportRunStepSchema>;

export const MemorySchema = z.object({
    id: z.string(),
    namespace: z.string(),
    key: z.string(),
    kind: z.string(),
    content: z.string(),
    value: z.record(z.string(), z.unknown()),
    confidence: z.enum(['low', 'medium', 'high']),
    sourceRunId: z.string().nullable().optional(),
    sourceStepId: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const MemoryInputSchema = z.object({
    namespace: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]),
    key: z.string().trim().min(1).optional(),
    kind: z.string().trim().min(1).default('fact'),
    content: z.string().trim().min(1),
    value: z.record(z.string(), z.unknown()).default({}),
    confidence: z.enum(['low', 'medium', 'high']).default('medium'),
    sourceRunId: z.string().nullable().optional(),
    sourceStepId: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
});
export type MemoryInput = z.input<typeof MemoryInputSchema>;

export const HealthResponseSchema = z.object({
    name: z.string(),
    status: z.string(),
    db: z.object({
        configured: z.boolean(),
        status: z.enum(['ok', 'unavailable', 'not_configured']),
    }),
    mcpStatus: z.string(),
    timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
