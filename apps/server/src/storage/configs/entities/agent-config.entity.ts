import { z } from 'zod';

import { MetadataSchema } from './shared.js';

const IdListSchema = z.array(z.string().trim().min(1));

export const AgentConfigEntitySchema = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable(),
    llmConfigId: z.string().uuid().nullable(),
    systemPrompt: z.string(),
    toolIds: IdListSchema,
    skillIds: IdListSchema,
    enabled: z.boolean(),
    metadata: MetadataSchema,
    createdAt: z.date(),
    updatedAt: z.date(),
});
export type AgentConfigEntity = z.infer<typeof AgentConfigEntitySchema>;

export const CreateAgentConfigSchema = z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable().default(null),
    llmConfigId: z.string().uuid().nullable().default(null),
    systemPrompt: z.string().default(''),
    toolIds: IdListSchema.default([]),
    skillIds: IdListSchema.default([]),
    enabled: z.boolean().default(true),
    metadata: MetadataSchema.default({}),
});
export type CreateAgentConfigInput = z.input<typeof CreateAgentConfigSchema>;

export const UpdateAgentConfigSchema = z.object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).nullable().optional(),
    llmConfigId: z.string().uuid().nullable().optional(),
    systemPrompt: z.string().optional(),
    toolIds: IdListSchema.optional(),
    skillIds: IdListSchema.optional(),
    enabled: z.boolean().optional(),
    metadata: MetadataSchema.optional(),
});
export type UpdateAgentConfigInput = z.input<typeof UpdateAgentConfigSchema>;
