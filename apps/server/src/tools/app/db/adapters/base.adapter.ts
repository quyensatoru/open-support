import type { DBConfig, QueryParams, QueryResult, DBSchema } from "../types.js"

export abstract class DBAdapter {
    abstract connect(config: DBConfig): Promise<void>
    abstract query(params: QueryParams): Promise<QueryResult>
    abstract introspect(): Promise<DBSchema>

    async healthCheck(): Promise<boolean> { return false }
    async disconnect(): Promise<void> { }
}