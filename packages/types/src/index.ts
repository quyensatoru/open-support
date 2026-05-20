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
