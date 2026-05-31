import { asc, eq } from 'drizzle-orm';

import { db, type Db } from '../../config/postgres.js';
import { agents, llms, type Agent, type NewAgent } from '../schema/index.js';

export type AgentPatch = Partial<Omit<NewAgent, 'id' | 'createdAt'>>;
export type AgentView = Agent & { llm: typeof llms.$inferSelect | null };

const take = (row: Agent | undefined): Agent => {
    if (!row) {
        throw new Error('Agent write returned no row');
    }
    return row;
};

export const makeAgentRepo = (conn: Db = db) => ({
    add: async (data: NewAgent): Promise<Agent> => {
        const [row] = await conn.insert(agents).values(data).returning();
        return take(row);
    },

    list: (enabled?: boolean): Promise<Agent[]> => {
        const query = conn.select().from(agents).orderBy(asc(agents.name));
        return enabled === undefined ? query : query.where(eq(agents.enabled, enabled));
    },

    listView: async (enabled?: boolean): Promise<AgentView[]> => {
        const query = conn
            .select({ agent: agents, llm: llms })
            .from(agents)
            .leftJoin(llms, eq(agents.llmId, llms.id))
            .orderBy(asc(agents.name));
        const rows =
            enabled === undefined ? await query : await query.where(eq(agents.enabled, enabled));
        return rows.map((row) => ({ ...row.agent, llm: row.llm }));
    },

    byId: async (id: string): Promise<Agent | null> => {
        const [row] = await conn.select().from(agents).where(eq(agents.id, id)).limit(1);
        return row ?? null;
    },

    byKey: async (key: string): Promise<Agent | null> => {
        const [row] = await conn.select().from(agents).where(eq(agents.key, key)).limit(1);
        return row ?? null;
    },

    viewByKey: async (key: string): Promise<AgentView | null> => {
        const [row] = await conn
            .select({ agent: agents, llm: llms })
            .from(agents)
            .leftJoin(llms, eq(agents.llmId, llms.id))
            .where(eq(agents.key, key))
            .limit(1);
        return row ? { ...row.agent, llm: row.llm } : null;
    },

    default: async (): Promise<AgentView | null> => {
        const [row] = await conn
            .select({ agent: agents, llm: llms })
            .from(agents)
            .leftJoin(llms, eq(agents.llmId, llms.id))
            .where(eq(agents.isDefault, true))
            .limit(1);
        return row ? { ...row.agent, llm: row.llm } : null;
    },

    set: async (id: string, patch: AgentPatch): Promise<Agent | null> => {
        const [row] = await conn.update(agents).set(patch).where(eq(agents.id, id)).returning();
        return row ?? null;
    },

    clearDefault: async (): Promise<void> => {
        await conn
            .update(agents)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(eq(agents.isDefault, true));
    },

    upsert: async (data: NewAgent): Promise<Agent> => {
        const [row] = await conn
            .insert(agents)
            .values(data)
            .onConflictDoUpdate({
                target: agents.key,
                set: {
                    name: data.name,
                    desc: data.desc,
                    llmId: data.llmId,
                    prompt: data.prompt,
                    tools: data.tools,
                    skills: data.skills,
                    opts: data.opts,
                    enabled: data.enabled,
                    isDefault: data.isDefault,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return take(row);
    },

    del: async (id: string): Promise<boolean> => {
        const rows = await conn
            .delete(agents)
            .where(eq(agents.id, id))
            .returning({ id: agents.id });
        return rows.length > 0;
    },
});

export const agentRepo = makeAgentRepo();
