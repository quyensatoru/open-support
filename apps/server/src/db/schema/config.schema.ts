import {
    boolean,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

import { agents } from './agent.schema.js';
import type { JsonMap } from './llm.schema.js';

export type RepoConfig = {
    name?: string;
    url: string;
    branch?: string;
};

export type DbSourceConfig = {
    key: string;
    type: string;
    secretRef?: string;
    config?: JsonMap;
};

export const appConfigs = pgTable(
    'app_configs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        key: varchar('key', { length: 64 }).notNull(),
        name: varchar('name', { length: 120 }).notNull(),
        shopifyAppHandle: varchar('shopify_app_handle', { length: 120 }),
        defaultStoreUrl: text('default_store_url'),
        repos: jsonb('repos').$type<RepoConfig[]>().notNull().default([]),
        dbSources: jsonb('db_sources').$type<DbSourceConfig[]>().notNull().default([]),
        metadata: jsonb('metadata').$type<JsonMap>().notNull().default({}),
        enabled: boolean('enabled').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        uniqueIndex('app_configs_key_idx').on(table.key),
        index('app_configs_enabled_idx').on(table.enabled),
    ],
);

export const workflowConfigs = pgTable(
    'workflow_configs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        key: varchar('key', { length: 64 }).notNull(),
        name: varchar('name', { length: 120 }).notNull(),
        entryGraph: varchar('entry_graph', { length: 120 }).notNull(),
        graphOrder: jsonb('graph_order').$type<string[]>().notNull().default([]),
        routingPolicy: varchar('routing_policy', { length: 64 })
            .notNull()
            .default('evidence-driven'),
        defaultAgentId: uuid('default_agent_id').references(() => agents.id, {
            onDelete: 'set null',
        }),
        opts: jsonb('opts').$type<JsonMap>().notNull().default({}),
        enabled: boolean('enabled').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        uniqueIndex('workflow_configs_key_idx').on(table.key),
        index('workflow_configs_default_agent_idx').on(table.defaultAgentId),
        index('workflow_configs_enabled_idx').on(table.enabled),
    ],
);

export const toolConfigs = pgTable(
    'tool_configs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        key: varchar('key', { length: 120 }).notNull(),
        name: varchar('name', { length: 120 }).notNull(),
        source: varchar('source', { length: 64 }).notNull(),
        description: text('description').notNull().default(''),
        config: jsonb('config').$type<JsonMap>().notNull().default({}),
        enabled: boolean('enabled').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        uniqueIndex('tool_configs_key_idx').on(table.key),
        index('tool_configs_source_idx').on(table.source),
        index('tool_configs_enabled_idx').on(table.enabled),
    ],
);

export const skillConfigs = pgTable(
    'skill_configs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        key: varchar('key', { length: 120 }).notNull(),
        name: varchar('name', { length: 120 }).notNull(),
        description: text('description').notNull().default(''),
        instructions: text('instructions').notNull().default(''),
        toolKeys: jsonb('tool_keys').$type<string[]>().notNull().default([]),
        config: jsonb('config').$type<JsonMap>().notNull().default({}),
        enabled: boolean('enabled').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        uniqueIndex('skill_configs_key_idx').on(table.key),
        index('skill_configs_enabled_idx').on(table.enabled),
    ],
);

export type AppConfig = typeof appConfigs.$inferSelect;
export type NewAppConfig = typeof appConfigs.$inferInsert;
export type WorkflowConfig = typeof workflowConfigs.$inferSelect;
export type NewWorkflowConfig = typeof workflowConfigs.$inferInsert;
export type ToolConfig = typeof toolConfigs.$inferSelect;
export type NewToolConfig = typeof toolConfigs.$inferInsert;
export type SkillConfig = typeof skillConfigs.$inferSelect;
export type NewSkillConfig = typeof skillConfigs.$inferInsert;
