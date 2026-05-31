import {
    boolean,
    index,
    integer,
    jsonb,
    pgTable,
    real,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

export type JsonMap = Record<string, unknown>;

export const llms = pgTable(
    'llms',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        key: varchar('key', { length: 64 }).notNull(),
        name: varchar('name', { length: 120 }).notNull(),
        provider: varchar('provider', { length: 40 }).notNull(),
        model: varchar('model', { length: 120 }).notNull(),
        baseUrl: text('base_url'),
        apiKey: varchar('api_key', { length: 240 }),
        temp: real('temp').notNull().default(0),
        topP: real('top_p'),
        maxTokens: integer('max_tokens'),
        opts: jsonb('opts').$type<JsonMap>().notNull().default({}),
        enabled: boolean('enabled').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (table) => [
        uniqueIndex('llms_key_idx').on(table.key),
        index('llms_provider_idx').on(table.provider),
        index('llms_enabled_idx').on(table.enabled),
    ],
);

export type Llm = typeof llms.$inferSelect;
export type NewLlm = typeof llms.$inferInsert;
