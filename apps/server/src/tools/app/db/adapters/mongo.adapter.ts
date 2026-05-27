import { MongoClient, type Db } from "mongodb"
import { DBAdapter } from "./base.adapter.js"
import type {
    MongoDBConfig, MongoQueryParams, MongoAggregateParams,
    MongoSchema, MongoCollectionSchema, MongoFieldSchema,
    QueryResult, DBConfig, QueryParams, DBSchema,
} from "../types.js"

export class MongoDBAdapter extends DBAdapter {
    #client!: MongoClient
    #db!: Db
    #sampleSize!: number

    override async connect(config: DBConfig): Promise<void> {
        const cfg = config as MongoDBConfig
        this.#client = new MongoClient(cfg.uri, { serverSelectionTimeoutMS: 5_000 })
        await this.#client.connect()
        this.#db = this.#client.db(cfg.db)
        this.#sampleSize = cfg.sampleSize ?? 5
    }

    override async query(params: QueryParams): Promise<QueryResult> {
        const p = params as MongoQueryParams
        if (!p.collection) throw new Error('"collection" is required')

        const col = this.#db.collection(p.collection)

        // Aggregate pipeline
        if ("aggregate" in p && p.aggregate) {
            const pipeline = [...p.aggregate] as Record<string, unknown>[]

            const lastStage = pipeline.at(-1)
            if (!lastStage || !("$limit" in lastStage)) {
                pipeline.push({ $limit: Math.min(p.limit ?? 20, 100) })
            }

            return col.aggregate(pipeline).toArray() as Promise<QueryResult>
        }

        // Simple find
        const { filter = {}, projection = {}, sort, limit = 20 } = p as Exclude<MongoQueryParams, MongoAggregateParams>

        return col
            .find(filter, { projection })
            .sort(sort ?? {})
            .limit(Math.min(limit, 100))
            .toArray() as Promise<QueryResult>
    }

    override async introspect(): Promise<DBSchema> {
        const collections = await this.#db.listCollections().toArray()
        const schema: MongoSchema = {}

        await Promise.all(
            collections.map(async ({ name, type }) => {
                if (type !== "collection") return

                const samples = await this.#db
                    .collection(name)
                    .aggregate([{ $sample: { size: this.#sampleSize } }])
                    .toArray()

                if (!samples.length) {
                    schema[name] = { note: "empty collection" } as MongoCollectionSchema
                    return
                }

                // Merge fields across sample docs to cover sparse schemas
                const merged: Record<string, MongoFieldSchema> = {}
                for (const doc of samples) {
                    this.#extractFields(doc as Record<string, unknown>, merged)
                }

                const count = await this.#db.collection(name).estimatedDocumentCount()
                schema[name] = { ...merged, __meta: { count } }
            })
        )

        return schema
    }

    // Recursively extract field names + types from a document
    #extractFields(
        obj: Record<string, unknown>,
        result: Record<string, MongoFieldSchema>,
        prefix = "",
    ): void {
        for (const [key, val] of Object.entries(obj)) {
            if (key === "_id") {
                result["_id"] = { type: "ObjectId", is_primary_key: true }
                continue
            }

            const fullKey = prefix ? `${prefix}.${key}` : key

            if (val instanceof Date) {
                result[fullKey] = { type: "date" }
            } else if (Array.isArray(val)) {
                result[fullKey] = { type: "array" }
                const first = val[0]
                if (first && typeof first === "object") {
                    result[`${fullKey}[]`] = { type: "array<object>" }
                    this.#extractFields(first as Record<string, unknown>, result, `${fullKey}[]`)
                }
            } else if (val !== null && typeof val === "object") {
                result[fullKey] = { type: "object" }
                this.#extractFields(val as Record<string, unknown>, result, fullKey)
            } else {
                result[fullKey] = { type: val === null ? "null" : typeof val }
            }
        }
    }

    override async healthCheck(): Promise<boolean> {
        try {
            await this.#db.command({ ping: 1 })
            return true
        } catch { return false }
    }

    override async disconnect(): Promise<void> {
        await this.#client?.close()
    }
}