// ── DB Config types ───────────────────────────────────────────

export type SQLClient = "pg" | "mysql2" | "sqlite3" | "mssql"

export interface SQLConfig {
    type: "postgres" | "mysql" | "sqlite" | "mssql"
    client?: SQLClient
    dsn?: string
    connection?: Record<string, unknown>
    allowedTables?: string[]
}

export interface MongoDBConfig {
    type: "mongodb"
    uri: string
    db: string
    readOnly?: boolean
    sampleSize?: number
}

export interface RedisConfig {
    type: "redis"
    url: string
    keyPrefix?: string
}

export type DBConfig = SQLConfig | MongoDBConfig | RedisConfig
export type AppDBConfig = Record<string, DBConfig>

// ── Query param types ─────────────────────────────────────────

export interface SQLQueryParams {
    sql: string
    bindings?: unknown[]
    limit?: number
}

export interface MongoFindParams {
    collection: string
    filter?: Record<string, unknown>
    projection?: Record<string, unknown>
    sort?: Record<string, 1 | -1>
    limit?: number
    aggregate?: never
}

export interface MongoAggregateParams {
    collection: string
    aggregate: Record<string, unknown>[]
    limit?: number
    filter?: never
}

export type MongoQueryParams = MongoFindParams | MongoAggregateParams

export type RedisOperation =
    | "get" | "mget" | "hgetall" | "hget"
    | "lrange" | "smembers" | "zrange"
    | "scan" | "type" | "ttl"

export interface RedisQueryParams {
    operation: RedisOperation
    key: string
    keys?: string[]       // mget
    field?: string         // hget
    start?: number         // lrange, zrange
    end?: number         // lrange, zrange
    withScores?: boolean        // zrange
    pattern?: string         // scan
    count?: number         // scan
    type?: string         // scan TYPE filter
}

export type QueryParams = SQLQueryParams | MongoQueryParams | RedisQueryParams

// ── Schema types ─────────────────────────────────────────────

export interface ColumnSchema {
    type: string
    nullable?: boolean
    default?: string | null
    is_primary_key?: boolean
}

export type TableSchema = Record<string, ColumnSchema>
export type SQLSchema = Record<string, TableSchema>

export interface MongoFieldSchema {
    type: string
    is_primary_key?: boolean
}

export interface MongoCollectionMeta {
    __meta?: { count: number }
    note?: string
}

export interface MongoCollectionSchema extends MongoCollectionMeta {
    [field: string]: MongoFieldSchema | MongoCollectionMeta["__meta"] | string | undefined
}
export type MongoSchema = Record<string, MongoCollectionSchema>

export interface RedisTypeData {
    count: number
    sampleKeys: string[]
    sampleData: Record<string, unknown>
}

export interface RedisSchema {
    keyPrefix: string
    totalScanned: number
    byType: Record<string, RedisTypeData>
    operations: string[]
    note?: string
}

export type DBSchema = SQLSchema | MongoSchema | RedisSchema
export type AllSchemas = Record<string, DBSchema | { error: string }>

// ── Result types ──────────────────────────────────────────────

export type QueryResult = Record<string, unknown>[]

// ── Agent types ───────────────────────────────────────────────

export interface RunAgentOptions {
    verbose?: boolean
}
