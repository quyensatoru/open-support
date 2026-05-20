import { z } from 'zod';

import { makeAgentRepo, makeLlmRepo, type AgentPatch } from '../repo/index.js';
import type { NewAgent } from '../schema/index.js';

const JsonMapSchema = z.record(z.string(), z.unknown());

export const AgentInputSchema = z.object({
    key: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    desc: z.string().trim().optional(),
    llmId: z.string().uuid().optional(),
    llmKey: z.string().trim().min(1).max(64).optional(),
    prompt: z.string().default(''),
    tools: z.array(z.string().trim().min(1)).default([]),
    skills: z.array(z.string().trim().min(1)).default([]),
    opts: JsonMapSchema.default({}),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
});

export type AgentInput = z.input<typeof AgentInputSchema>;

export const makeAgentSvc = (repo = makeAgentRepo(), llms = makeLlmRepo()) => {
    const clean = async (input: AgentInput): Promise<NewAgent> => {
        const data = AgentInputSchema.parse(input);
        const llm = data.llmKey ? await llms.byKey(data.llmKey) : null;
        if (data.llmKey && !llm) {
            throw new Error(`LLM not found: ${data.llmKey}`);
        }

        return {
            key: data.key,
            name: data.name,
            desc: data.desc ?? null,
            llmId: data.llmId ?? llm?.id ?? null,
            prompt: data.prompt,
            tools: data.tools,
            skills: data.skills,
            opts: data.opts,
            enabled: data.enabled,
            isDefault: data.isDefault,
        };
    };

    return {
        add: async (input: AgentInput) => {
            const data = await clean(input);
            if (data.isDefault) {
                await repo.clearDefault();
            }
            return repo.add(data);
        },
        save: async (input: AgentInput) => {
            const data = await clean(input);
            if (data.isDefault) {
                await repo.clearDefault();
            }
            return repo.upsert(data);
        },
        list: repo.list,
        listView: repo.listView,
        byId: repo.byId,
        byKey: repo.byKey,
        viewByKey: repo.viewByKey,
        default: repo.default,
        set: async (id: string, patch: AgentPatch) => {
            if (patch.isDefault) {
                await repo.clearDefault();
            }
            return repo.set(id, patch);
        },
        del: repo.del,

        seedDefault: async (llmKey = 'openai') => {
            const llm = await llms.byKey(llmKey);
            return repo.upsert(
                await clean({
                    key: 'default',
                    name: 'Default Agent',
                    llmId: llm?.id,
                    prompt: 'You are a concise support agent.',
                    isDefault: true,
                    enabled: true,
                }),
            );
        },
    };
};

export const agentSvc = makeAgentSvc();
