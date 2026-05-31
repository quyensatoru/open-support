import { z } from 'zod';

import { env } from '../../env.js';
import { makeLlmRepo, type LlmPatch } from '../repo/index.js';
import type { NewLlm } from '../schema/index.js';

const JsonMapSchema = z.record(z.string(), z.unknown());

export const LlmInputSchema = z.object({
    key: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    provider: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(120),
    baseUrl: z.string().trim().url().optional(),
    apiKey: z.string().trim().min(1).max(240).nullable().optional(),
    apiKeyRef: z.string().trim().min(1).max(240).nullable().optional(),
    temp: z.number().min(0).max(2).default(0),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().int().positive().optional(),
    opts: JsonMapSchema.default({}),
    enabled: z.boolean().default(true),
});

export type LlmInput = z.input<typeof LlmInputSchema>;

const clean = (input: LlmInput): NewLlm => {
    const data = LlmInputSchema.parse(input);
    const { apiKey, apiKeyRef, ...rest } = data;
    return {
        ...rest,
        baseUrl: data.baseUrl ?? null,
        apiKey: apiKeyRef ?? apiKey ?? null,
        topP: data.topP ?? null,
        maxTokens: data.maxTokens ?? null,
    };
};

export const makeLlmSvc = (repo = makeLlmRepo()) => ({
    add: (input: LlmInput) => repo.add(clean(input)),
    save: (input: LlmInput) => repo.upsert(clean(input)),
    list: repo.list,
    byId: repo.byId,
    byKey: repo.byKey,
    find: repo.find,
    set: (id: string, patch: LlmPatch) => repo.set(id, { ...patch, updatedAt: new Date() }),
    del: repo.del,

    seedEnv: () =>
        repo.upsert(
            clean({
                key: 'openai',
                name: 'OpenAI',
                provider: 'openai',
                model: env.OPENAI_MODEL,
                apiKeyRef: env.OPENAI_API_KEY ? 'env:OPENAI_API_KEY' : null,
                temp: 0,
                enabled: Boolean(env.OPENAI_API_KEY),
            }),
        ),
});

export const llmSvc = makeLlmSvc();
