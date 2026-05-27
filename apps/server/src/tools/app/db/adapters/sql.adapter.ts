import knex, { type Knex } from "knex"
import { DBAdapter } from "./base.adapter.js"
import type {
    SQLConfig, SQLClient, SQLQueryParams,
    SQLSchema, TableSchema, QueryResult,
    DBConfig, QueryParams, DBSchema,
} from "../types.js"

const DIALECT_SQL: Partial<Record<SQLClient, string>> = {
    pg: `
    SELECT
      t.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    LEFT JOIN (
      SELECT ku.table_name, ku.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku
        ON tc.constraint_name = ku.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
    ) pk ON pk.table_name = c.table_name AND pk.column_name = c.column_name
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name, c.ordinal_position
  `,
    mysql2: `
    SELECT
      TABLE_NAME    AS table_name,
      COLUMN_NAME   AS column_name,
      DATA_TYPE     AS data_type,
      IS_NULLABLE   AS is_nullable,
      COLUMN_DEFAULT AS column_default,
      IF(COLUMN_KEY = 'PRI', true, false) AS is_primary_key
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `,
    mssql: `
    SELECT
      t.name   AS table_name,
      c.name   AS column_name,
      tp.name  AS data_type,
      c.is_nullable,
      CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key
    FROM sys.tables t
    JOIN sys.columns c ON t.object_id = c.object_id
    JOIN sys.types tp ON c.user_type_id = tp.user_type_id
    LEFT JOIN (
      SELECT ic.object_id, ic.column_id
      FROM sys.index_columns ic
      JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      WHERE i.is_primary_key = 1
    ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
    ORDER BY t.name, c.column_id
  `,
}

interface SchemaRow {
    table_name: string
    column_name: string
    data_type: string
    is_nullable: string | boolean
    column_default: string | null
    is_primary_key: boolean | number
}

interface PragmaRow {
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
}

export class SQLAdapter extends DBAdapter {
    #db!: Knex
    #config!: SQLConfig

    override async connect(config: DBConfig): Promise<void> {
        this.#config = config as SQLConfig
        const client = this.#resolveClient()

        const connection: string | Record<string, unknown> =
            this.#config.dsn ?? this.#config.connection ?? ""

        this.#db = knex({ client, connection, pool: { min: 1, max: 5 } })
        await this.#db.raw("SELECT 1")
    }

    override async query(params: QueryParams): Promise<QueryResult> {
        const { sql, bindings = [], limit = 20 } = params as SQLQueryParams

        if (!/^\s*SELECT/i.test(sql.trim())) {
            throw new Error("Only SELECT queries allowed")
        }

        const finalSQL = this.#applyLimit(sql, limit)

        // Cast bindings as Value[] which knex accepts
        const result = await this.#db.raw(finalSQL, bindings as Knex.Value[])
        const rows = (result.rows ?? result[0] ?? result) as QueryResult
        return rows
    }

    override async introspect(): Promise<DBSchema> {
        const client = this.#resolveClient()
        if (client === "sqlite3") return this.#introspectSQLite()

        const dialectSQL = DIALECT_SQL[client]
        if (!dialectSQL) throw new Error(`Introspect not supported for client: ${client}`)

        const rows = (await this.query({ sql: dialectSQL, limit: 10_000 })) as unknown as SchemaRow[]
        return this.#buildSchema(rows)
    }

    async #introspectSQLite(): Promise<SQLSchema> {
        const tables = (await this.query({
            sql: `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
            limit: 1_000,
        })) as unknown as Array<{ name: string }>

        const schema: SQLSchema = {}

        for (const { name } of tables) {
            const cols = await this.#db.raw(`PRAGMA table_info("${name}")`) as PragmaRow[]
            schema[name] = {} as TableSchema

            for (const col of cols) {
                const table = schema[name]!
                table[col.name] = {
                    type: col.type,
                    nullable: col.notnull === 0,
                    default: col.dflt_value,
                    is_primary_key: col.pk === 1,
                }
            }
        }

        return schema
    }

    #buildSchema(rows: SchemaRow[]): SQLSchema {
        return rows.reduce<SQLSchema>((schema, row) => {
            const { table_name: table } = row
            const allowed = this.#config.allowedTables
            if (allowed && !allowed.includes(table)) return schema

            schema[table] ??= {}
            schema[table]![row.column_name] = {
                type: row.data_type,
                nullable: row.is_nullable === "YES" || row.is_nullable === true,
                default: row.column_default ?? null,
                is_primary_key: row.is_primary_key === true || row.is_primary_key === 1,
            }
            return schema
        }, {})
    }

    #applyLimit(sql: string, limit: number): string {
        const safeLimit = Math.min(limit, 100)

        if (/\b(LIMIT\s+\d+|TOP\s*\(|FETCH\s+NEXT\s+\d+\s+ROWS)\b/i.test(sql)) {
            return sql
        }

        if (this.#resolveClient() === "mssql") {
            return sql.replace(/^\s*SELECT\s+(DISTINCT\s+)?/i, (match) => {
                return `${match}TOP (${safeLimit}) `
            })
        }

        return `${sql} LIMIT ${safeLimit}`
    }

    #resolveClient(): SQLClient {
        if (this.#config.client) return this.#config.client
        const map: Record<string, SQLClient> = {
            postgres: "pg",
            mysql: "mysql2",
            sqlite: "sqlite3",
            mssql: "mssql",
        }
        return map[this.#config.type] ?? "pg"
    }

    override async healthCheck(): Promise<boolean> {
        try { await this.#db.raw("SELECT 1"); return true }
        catch { return false }
    }

    override async disconnect(): Promise<void> {
        await this.#db?.destroy()
    }
}
