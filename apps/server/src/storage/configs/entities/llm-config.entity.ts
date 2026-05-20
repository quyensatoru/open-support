import { z } from 'zod';

import { MetadataSchema } from './shared.js';

export const LlmProviderSchema = z.enum(['openai']);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const LlmConfigEntitySchema = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1),
    provider: LlmProviderSchema,
    model: z.string().trim().min(1),
    apiKeySecretRef: z.string().trim().min(1).nullable(),
    baseUrl: z.string().trim().min(1).nullable(),
    temperature: z.number().min(0).max(2).nullable(),
    maxTokens: z.number().int().positive().nullable(),
    enabled: z.boolean(),
    metadata: MetadataSchema,
    createdAt: z.date(),
    updatedAt: z.date(),
});
export type LlmConfigEntity = z.infer<typeof LlmConfigEntitySchema>;

export const CreateLlmConfigSchema = z.object({
    name: z.string().trim().min(1),
    provider: LlmProviderSchema.default('openai'),
    model: z.string().trim().min(1),
    apiKeySecretRef: z.string().trim().min(1).nullable().default(null),
    baseUrl: z.string().trim().min(1).nullable().default(null),
    temperature: z.number().min(0).max(2).nullable().default(null),
    maxTokens: z.number().int().positive().nullable().default(null),
    enabled: z.boolean().default(true),
    metadata: MetadataSchema.default({}),
});
export type CreateLlmConfigInput = z.input<typeof CreateLlmConfigSchema>;

export const UpdateLlmConfigSchema = z.object({
    name: z.string().trim().min(1).optional(),
    provider: LlmProviderSchema.optional(),
    model: z.string().trim().min(1).optional(),
    apiKeySecretRef: z.string().trim().min(1).nullable().optional(),
    baseUrl: z.string().trim().min(1).nullable().optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
    maxTokens: z.number().int().positive().nullable().optional(),
    enabled: z.boolean().optional(),
    metadata: MetadataSchema.optional(),
});
export type UpdateLlmConfigInput = z.input<typeof UpdateLlmConfigSchema>;
