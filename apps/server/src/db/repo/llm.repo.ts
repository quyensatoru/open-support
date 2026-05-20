import { and, asc, eq } from 'drizzle-orm';

import { db, type Db } from '../../config/postgres.js';
import { llms, type Llm, type NewLlm } from '../schema/index.js';

export type LlmPatch = Partial<Omit<NewLlm, 'id' | 'createdAt' | 'updatedAt'>>;

const take = (row: Llm | undefined): Llm => {
    if (!row) {
        throw new Error('LLM write returned no row');
    }
    return row;
};

export const makeLlmRepo = (conn: Db = db) => ({
    add: async (data: NewLlm): Promise<Llm> => {
        const [row] = await conn.insert(llms).values(data).returning();
        return take(row);
    },

    list: (enabled?: boolean): Promise<Llm[]> => {
        const query = conn.select().from(llms).orderBy(asc(llms.name));
        return enabled === undefined ? query : query.where(eq(llms.enabled, enabled));
    },

    byId: async (id: string): Promise<Llm | null> => {
        const [row] = await conn.select().from(llms).where(eq(llms.id, id)).limit(1);
        return row ?? null;
    },

    byKey: async (key: string): Promise<Llm | null> => {
        const [row] = await conn.select().from(llms).where(eq(llms.key, key)).limit(1);
        return row ?? null;
    },

    find: async (provider: string): Promise<Llm | null> => {
        const [row] = await conn
            .select()
            .from(llms)
            .where(and(eq(llms.provider, provider), eq(llms.enabled, true)))
            .limit(1);
        return row ?? null;
    },

    set: async (id: string, patch: LlmPatch): Promise<Llm | null> => {
        const [row] = await conn.update(llms).set(patch).where(eq(llms.id, id)).returning();
        return row ?? null;
    },

    upsert: async (data: NewLlm): Promise<Llm> => {
        const [row] = await conn
            .insert(llms)
            .values(data)
            .onConflictDoUpdate({
                target: llms.key,
                set: {
                    name: data.name,
                    provider: data.provider,
                    model: data.model,
                    baseUrl: data.baseUrl,
                    apiKey: data.apiKey,
                    temp: data.temp,
                    topP: data.topP,
                    maxTokens: data.maxTokens,
                    opts: data.opts,
                    enabled: data.enabled,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return take(row);
    },

    del: async (id: string): Promise<boolean> => {
        const rows = await conn.delete(llms).where(eq(llms.id, id)).returning({ id: llms.id });
        return rows.length > 0;
    },
});

export const llmRepo = makeLlmRepo();
