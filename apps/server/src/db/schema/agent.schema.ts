import { relations, sql } from 'drizzle-orm';
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

import { llms } from './llm.schema.js';

type JsonMap = Record<string, unknown>;

export const agents = pgTable(
    'agents',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        key: varchar('key', { length: 64 }).notNull(),
        name: varchar('name', { length: 120 }).notNull(),
        desc: text('desc'),
        llmId: uuid('llm_id').references(() => llms.id, { onDelete: 'set null' }),
        prompt: text('prompt').notNull().default(''),
        tools: jsonb('tools').$type<string[]>().notNull().default([]),
        skills: jsonb('skills').$type<string[]>().notNull().default([]),
        opts: jsonb('opts').$type<JsonMap>().notNull().default({}),
        enabled: boolean('enabled').notNull().default(true),
        isDefault: boolean('is_default').notNull().default(false),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        uniqueIndex('agents_key_idx').on(table.key),
        uniqueIndex('agents_one_default_idx')
            .on(table.isDefault)
            .where(sql`${table.isDefault} = true`),
        index('agents_llm_id_idx').on(table.llmId),
        index('agents_enabled_idx').on(table.enabled),
    ],
);

export const agentLinks = relations(agents, ({ one }) => ({
    llm: one(llms, {
        fields: [agents.llmId],
        references: [llms.id],
    }),
}));

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
