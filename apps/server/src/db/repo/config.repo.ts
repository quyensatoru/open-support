import { asc, eq } from 'drizzle-orm';

import { db, type Db } from '../../config/postgres.js';
import {
    appConfigs,
    skillConfigs,
    toolConfigs,
    workflowConfigs,
    type AppConfig,
    type NewAppConfig,
    type NewSkillConfig,
    type NewToolConfig,
    type NewWorkflowConfig,
    type SkillConfig,
    type ToolConfig,
    type WorkflowConfig,
} from '../schema/index.js';

export type AppConfigPatch = Partial<Omit<NewAppConfig, 'id' | 'createdAt'>>;
export type WorkflowConfigPatch = Partial<Omit<NewWorkflowConfig, 'id' | 'createdAt'>>;
export type ToolConfigPatch = Partial<Omit<NewToolConfig, 'id' | 'createdAt'>>;
export type SkillConfigPatch = Partial<Omit<NewSkillConfig, 'id' | 'createdAt'>>;

function take<T>(row: T | undefined, label: string): T {
    if (!row) {
        throw new Error(`${label} write returned no row`);
    }
    return row;
}

export const makeAppConfigRepo = (conn: Db = db) => ({
    add: async (data: NewAppConfig): Promise<AppConfig> => {
        const [row] = await conn.insert(appConfigs).values(data).returning();
        return take(row, 'App config');
    },

    list: (enabled?: boolean): Promise<AppConfig[]> => {
        const query = conn.select().from(appConfigs).orderBy(asc(appConfigs.name));
        return enabled === undefined ? query : query.where(eq(appConfigs.enabled, enabled));
    },

    byId: async (id: string): Promise<AppConfig | null> => {
        const [row] = await conn.select().from(appConfigs).where(eq(appConfigs.id, id)).limit(1);
        return row ?? null;
    },

    byKey: async (key: string): Promise<AppConfig | null> => {
        const [row] = await conn.select().from(appConfigs).where(eq(appConfigs.key, key)).limit(1);
        return row ?? null;
    },

    set: async (id: string, patch: AppConfigPatch): Promise<AppConfig | null> => {
        const [row] = await conn
            .update(appConfigs)
            .set(patch)
            .where(eq(appConfigs.id, id))
            .returning();
        return row ?? null;
    },

    upsert: async (data: NewAppConfig): Promise<AppConfig> => {
        const [row] = await conn
            .insert(appConfigs)
            .values(data)
            .onConflictDoUpdate({
                target: appConfigs.key,
                set: {
                    name: data.name,
                    shopifyAppHandle: data.shopifyAppHandle,
                    defaultStoreUrl: data.defaultStoreUrl,
                    repos: data.repos,
                    dbSources: data.dbSources,
                    metadata: data.metadata,
                    enabled: data.enabled,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return take(row, 'App config');
    },

    del: async (id: string): Promise<boolean> => {
        const rows = await conn
            .delete(appConfigs)
            .where(eq(appConfigs.id, id))
            .returning({ id: appConfigs.id });
        return rows.length > 0;
    },
});

export const makeWorkflowConfigRepo = (conn: Db = db) => ({
    add: async (data: NewWorkflowConfig): Promise<WorkflowConfig> => {
        const [row] = await conn.insert(workflowConfigs).values(data).returning();
        return take(row, 'Workflow config');
    },

    list: (enabled?: boolean): Promise<WorkflowConfig[]> => {
        const query = conn.select().from(workflowConfigs).orderBy(asc(workflowConfigs.name));
        return enabled === undefined ? query : query.where(eq(workflowConfigs.enabled, enabled));
    },

    byId: async (id: string): Promise<WorkflowConfig | null> => {
        const [row] = await conn
            .select()
            .from(workflowConfigs)
            .where(eq(workflowConfigs.id, id))
            .limit(1);
        return row ?? null;
    },

    byKey: async (key: string): Promise<WorkflowConfig | null> => {
        const [row] = await conn
            .select()
            .from(workflowConfigs)
            .where(eq(workflowConfigs.key, key))
            .limit(1);
        return row ?? null;
    },

    set: async (id: string, patch: WorkflowConfigPatch): Promise<WorkflowConfig | null> => {
        const [row] = await conn
            .update(workflowConfigs)
            .set(patch)
            .where(eq(workflowConfigs.id, id))
            .returning();
        return row ?? null;
    },

    upsert: async (data: NewWorkflowConfig): Promise<WorkflowConfig> => {
        const [row] = await conn
            .insert(workflowConfigs)
            .values(data)
            .onConflictDoUpdate({
                target: workflowConfigs.key,
                set: {
                    name: data.name,
                    entryGraph: data.entryGraph,
                    graphOrder: data.graphOrder,
                    routingPolicy: data.routingPolicy,
                    defaultAgentId: data.defaultAgentId,
                    opts: data.opts,
                    enabled: data.enabled,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return take(row, 'Workflow config');
    },

    del: async (id: string): Promise<boolean> => {
        const rows = await conn
            .delete(workflowConfigs)
            .where(eq(workflowConfigs.id, id))
            .returning({ id: workflowConfigs.id });
        return rows.length > 0;
    },
});

export const makeToolConfigRepo = (conn: Db = db) => ({
    add: async (data: NewToolConfig): Promise<ToolConfig> => {
        const [row] = await conn.insert(toolConfigs).values(data).returning();
        return take(row, 'Tool config');
    },

    list: (enabled?: boolean): Promise<ToolConfig[]> => {
        const query = conn.select().from(toolConfigs).orderBy(asc(toolConfigs.name));
        return enabled === undefined ? query : query.where(eq(toolConfigs.enabled, enabled));
    },

    byId: async (id: string): Promise<ToolConfig | null> => {
        const [row] = await conn.select().from(toolConfigs).where(eq(toolConfigs.id, id)).limit(1);
        return row ?? null;
    },

    byKey: async (key: string): Promise<ToolConfig | null> => {
        const [row] = await conn
            .select()
            .from(toolConfigs)
            .where(eq(toolConfigs.key, key))
            .limit(1);
        return row ?? null;
    },

    set: async (id: string, patch: ToolConfigPatch): Promise<ToolConfig | null> => {
        const [row] = await conn
            .update(toolConfigs)
            .set(patch)
            .where(eq(toolConfigs.id, id))
            .returning();
        return row ?? null;
    },

    upsert: async (data: NewToolConfig): Promise<ToolConfig> => {
        const [row] = await conn
            .insert(toolConfigs)
            .values(data)
            .onConflictDoUpdate({
                target: toolConfigs.key,
                set: {
                    name: data.name,
                    source: data.source,
                    description: data.description,
                    config: data.config,
                    enabled: data.enabled,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return take(row, 'Tool config');
    },

    del: async (id: string): Promise<boolean> => {
        const rows = await conn
            .delete(toolConfigs)
            .where(eq(toolConfigs.id, id))
            .returning({ id: toolConfigs.id });
        return rows.length > 0;
    },
});

export const makeSkillConfigRepo = (conn: Db = db) => ({
    add: async (data: NewSkillConfig): Promise<SkillConfig> => {
        const [row] = await conn.insert(skillConfigs).values(data).returning();
        return take(row, 'Skill config');
    },

    list: (enabled?: boolean): Promise<SkillConfig[]> => {
        const query = conn.select().from(skillConfigs).orderBy(asc(skillConfigs.name));
        return enabled === undefined ? query : query.where(eq(skillConfigs.enabled, enabled));
    },

    byId: async (id: string): Promise<SkillConfig | null> => {
        const [row] = await conn
            .select()
            .from(skillConfigs)
            .where(eq(skillConfigs.id, id))
            .limit(1);
        return row ?? null;
    },

    byKey: async (key: string): Promise<SkillConfig | null> => {
        const [row] = await conn
            .select()
            .from(skillConfigs)
            .where(eq(skillConfigs.key, key))
            .limit(1);
        return row ?? null;
    },

    set: async (id: string, patch: SkillConfigPatch): Promise<SkillConfig | null> => {
        const [row] = await conn
            .update(skillConfigs)
            .set(patch)
            .where(eq(skillConfigs.id, id))
            .returning();
        return row ?? null;
    },

    upsert: async (data: NewSkillConfig): Promise<SkillConfig> => {
        const [row] = await conn
            .insert(skillConfigs)
            .values(data)
            .onConflictDoUpdate({
                target: skillConfigs.key,
                set: {
                    name: data.name,
                    description: data.description,
                    instructions: data.instructions,
                    toolKeys: data.toolKeys,
                    config: data.config,
                    enabled: data.enabled,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return take(row, 'Skill config');
    },

    del: async (id: string): Promise<boolean> => {
        const rows = await conn
            .delete(skillConfigs)
            .where(eq(skillConfigs.id, id))
            .returning({ id: skillConfigs.id });
        return rows.length > 0;
    },
});

export const appConfigRepo = makeAppConfigRepo();
export const workflowConfigRepo = makeWorkflowConfigRepo();
export const toolConfigRepo = makeToolConfigRepo();
export const skillConfigRepo = makeSkillConfigRepo();
