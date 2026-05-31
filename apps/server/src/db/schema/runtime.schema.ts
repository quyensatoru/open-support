import {
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

import type { JsonMap } from './llm.schema.js';

export type SupportRunStatus =
    | 'queued'
    | 'running'
    | 'interrupted'
    | 'partial'
    | 'completed'
    | 'failed';
export type SupportStepStatus = 'running' | 'completed' | 'skipped' | 'interrupted' | 'failed';
export type MemoryConfidence = 'low' | 'medium' | 'high';

export const supportRuns = pgTable(
    'support_runs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        threadId: varchar('thread_id', { length: 160 }).notNull(),
        appKey: varchar('app_key', { length: 64 }).notNull(),
        workflowKey: varchar('workflow_key', { length: 64 }).notNull(),
        appName: varchar('app_name', { length: 120 }).notNull(),
        storeUrl: text('store_url'),
        storeDomain: varchar('store_domain', { length: 255 }),
        issue: text('issue').notNull(),
        status: varchar('status', { length: 32 }).$type<SupportRunStatus>().notNull(),
        input: jsonb('input').$type<JsonMap>().notNull().default({}),
        output: jsonb('output').$type<JsonMap>(),
        error: text('error'),
        metadata: jsonb('metadata').$type<JsonMap>().notNull().default({}),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        index('support_runs_thread_id_idx').on(table.threadId),
        index('support_runs_app_key_idx').on(table.appKey),
        index('support_runs_workflow_key_idx').on(table.workflowKey),
        index('support_runs_status_idx').on(table.status),
        index('support_runs_created_at_idx').on(table.createdAt),
    ],
);

export const supportRunSteps = pgTable(
    'support_run_steps',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        runId: uuid('run_id')
            .notNull()
            .references(() => supportRuns.id, { onDelete: 'cascade' }),
        stepKey: varchar('step_key', { length: 120 }).notNull(),
        graph: varchar('graph', { length: 120 }).notNull(),
        status: varchar('status', { length: 32 }).$type<SupportStepStatus>().notNull(),
        input: jsonb('input').$type<JsonMap>().notNull().default({}),
        output: jsonb('output').$type<JsonMap>(),
        error: text('error'),
        metadata: jsonb('metadata').$type<JsonMap>().notNull().default({}),
        startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
        finishedAt: timestamp('finished_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        index('support_run_steps_run_id_idx').on(table.runId),
        index('support_run_steps_graph_idx').on(table.graph),
        index('support_run_steps_status_idx').on(table.status),
    ],
);

export const memories = pgTable(
    'memories',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        namespace: varchar('namespace', { length: 240 }).notNull(),
        key: varchar('key', { length: 160 }).notNull(),
        kind: varchar('kind', { length: 40 }).notNull(),
        content: text('content').notNull(),
        value: jsonb('value').$type<JsonMap>().notNull().default({}),
        confidence: varchar('confidence', { length: 16 }).$type<MemoryConfidence>().notNull(),
        sourceRunId: uuid('source_run_id').references(() => supportRuns.id, {
            onDelete: 'set null',
        }),
        sourceStepId: uuid('source_step_id').references(() => supportRunSteps.id, {
            onDelete: 'set null',
        }),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        uniqueIndex('memories_namespace_key_idx').on(table.namespace, table.key),
        index('memories_namespace_idx').on(table.namespace),
        index('memories_kind_idx').on(table.kind),
        index('memories_source_run_idx').on(table.sourceRunId),
        index('memories_expires_at_idx').on(table.expiresAt),
    ],
);

export type SupportRun = typeof supportRuns.$inferSelect;
export type NewSupportRun = typeof supportRuns.$inferInsert;
export type SupportRunStep = typeof supportRunSteps.$inferSelect;
export type NewSupportRunStep = typeof supportRunSteps.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
