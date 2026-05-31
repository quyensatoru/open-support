import { and, desc, eq, gt, ilike, isNull, or, type SQL } from 'drizzle-orm';

import { db, type Db } from '../../config/postgres.js';
import {
    memories,
    supportRuns,
    supportRunSteps,
    type Memory,
    type NewMemory,
    type NewSupportRun,
    type NewSupportRunStep,
    type SupportRun,
    type SupportRunStep,
    type SupportRunStatus,
} from '../schema/index.js';

export type SupportRunPatch = Partial<Omit<NewSupportRun, 'id' | 'createdAt'>>;
export type SupportRunStepPatch = Partial<Omit<NewSupportRunStep, 'id' | 'createdAt'>>;
export type MemoryPatch = Partial<Omit<NewMemory, 'id' | 'createdAt'>>;

export type SupportRunListFilters = {
    appKey?: string | undefined;
    threadId?: string | undefined;
    status?: SupportRunStatus | undefined;
    limit?: number | undefined;
};

export type MemoryListFilters = {
    namespace?: string | undefined;
    kind?: string | undefined;
    query?: string | undefined;
    includeExpired?: boolean | undefined;
    limit?: number | undefined;
};

function take<T>(row: T | undefined, label: string): T {
    if (!row) {
        throw new Error(`${label} write returned no row`);
    }
    return row;
}

function optionalWhere(conditions: Array<SQL | undefined>): SQL | undefined {
    const compact = conditions.filter((condition): condition is SQL => Boolean(condition));
    if (compact.length === 0) return undefined;
    if (compact.length === 1) return compact[0];
    return and(...compact);
}

export const makeSupportRunRepo = (conn: Db = db) => ({
    add: async (data: NewSupportRun): Promise<SupportRun> => {
        const [row] = await conn.insert(supportRuns).values(data).returning();
        return take(row, 'Support run');
    },

    list: (filters: SupportRunListFilters = {}): Promise<SupportRun[]> => {
        const where = optionalWhere([
            filters.appKey ? eq(supportRuns.appKey, filters.appKey) : undefined,
            filters.threadId ? eq(supportRuns.threadId, filters.threadId) : undefined,
            filters.status ? eq(supportRuns.status, filters.status) : undefined,
        ]);
        const limit = filters.limit ?? 50;

        const query = conn.select().from(supportRuns);
        if (where) {
            return query.where(where).orderBy(desc(supportRuns.createdAt)).limit(limit);
        }
        return query.orderBy(desc(supportRuns.createdAt)).limit(limit);
    },

    byId: async (id: string): Promise<SupportRun | null> => {
        const [row] = await conn.select().from(supportRuns).where(eq(supportRuns.id, id)).limit(1);
        return row ?? null;
    },

    set: async (id: string, patch: SupportRunPatch): Promise<SupportRun | null> => {
        const [row] = await conn
            .update(supportRuns)
            .set(patch)
            .where(eq(supportRuns.id, id))
            .returning();
        return row ?? null;
    },
});

export const makeSupportRunStepRepo = (conn: Db = db) => ({
    add: async (data: NewSupportRunStep): Promise<SupportRunStep> => {
        const [row] = await conn.insert(supportRunSteps).values(data).returning();
        return take(row, 'Support run step');
    },

    listByRun: (runId: string): Promise<SupportRunStep[]> =>
        conn
            .select()
            .from(supportRunSteps)
            .where(eq(supportRunSteps.runId, runId))
            .orderBy(supportRunSteps.startedAt),

    byId: async (id: string): Promise<SupportRunStep | null> => {
        const [row] = await conn
            .select()
            .from(supportRunSteps)
            .where(eq(supportRunSteps.id, id))
            .limit(1);
        return row ?? null;
    },

    set: async (id: string, patch: SupportRunStepPatch): Promise<SupportRunStep | null> => {
        const [row] = await conn
            .update(supportRunSteps)
            .set(patch)
            .where(eq(supportRunSteps.id, id))
            .returning();
        return row ?? null;
    },
});

export const makeMemoryRepo = (conn: Db = db) => ({
    add: async (data: NewMemory): Promise<Memory> => {
        const [row] = await conn.insert(memories).values(data).returning();
        return take(row, 'Memory');
    },

    upsert: async (data: NewMemory): Promise<Memory> => {
        const [row] = await conn
            .insert(memories)
            .values(data)
            .onConflictDoUpdate({
                target: [memories.namespace, memories.key],
                set: {
                    kind: data.kind,
                    content: data.content,
                    value: data.value,
                    confidence: data.confidence,
                    sourceRunId: data.sourceRunId,
                    sourceStepId: data.sourceStepId,
                    expiresAt: data.expiresAt,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return take(row, 'Memory');
    },

    list: (filters: MemoryListFilters = {}): Promise<Memory[]> => {
        const where = optionalWhere([
            filters.namespace ? eq(memories.namespace, filters.namespace) : undefined,
            filters.kind ? eq(memories.kind, filters.kind) : undefined,
            filters.query ? ilike(memories.content, `%${filters.query}%`) : undefined,
            filters.includeExpired
                ? undefined
                : or(isNull(memories.expiresAt), gt(memories.expiresAt, new Date())),
        ]);
        const limit = filters.limit ?? 50;

        const query = conn.select().from(memories);
        if (where) return query.where(where).orderBy(desc(memories.updatedAt)).limit(limit);
        return query.orderBy(desc(memories.updatedAt)).limit(limit);
    },

    byId: async (id: string): Promise<Memory | null> => {
        const [row] = await conn.select().from(memories).where(eq(memories.id, id)).limit(1);
        return row ?? null;
    },

    set: async (id: string, patch: MemoryPatch): Promise<Memory | null> => {
        const [row] = await conn
            .update(memories)
            .set(patch)
            .where(eq(memories.id, id))
            .returning();
        return row ?? null;
    },

    del: async (id: string): Promise<boolean> => {
        const rows = await conn.delete(memories).where(eq(memories.id, id)).returning({
            id: memories.id,
        });
        return rows.length > 0;
    },
});

export const supportRunRepo = makeSupportRunRepo();
export const supportRunStepRepo = makeSupportRunStepRepo();
export const memoryRepo = makeMemoryRepo();
