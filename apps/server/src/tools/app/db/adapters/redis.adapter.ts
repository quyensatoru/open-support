import { Redis } from "ioredis"
import { DBAdapter } from "./base.adapter.js"
import type {
    RedisConfig, RedisQueryParams, RedisOperation,
    RedisSchema, RedisTypeData,
    QueryResult, DBConfig, QueryParams, DBSchema,
} from "../types.js"

// ── Op handler type ───────────────────────────────────────────

type OpHandler = (client: Redis, params: RedisQueryParams) => Promise<QueryResult>

// ── Read-only operation map ───────────────────────────────────

const OPS: Record<RedisOperation, OpHandler> = {

    get: async (client, { key }) => {
        const val = await client.get(key)
        return [{ key, value: tryParseJSON(val), type: "string" }]
    },

    mget: async (client, { key, keys = [] }) => {
        const allKeys = [key, ...keys].filter(Boolean)
        const vals = await client.mget(...allKeys)
        return allKeys.map((k, i) => ({ key: k, value: tryParseJSON(vals[i] ?? null) }))
    },

    hgetall: async (client, { key }) => {
        const val = await client.hgetall(key)
        return [{ key, fields: val }]
    },

    hget: async (client, { key, field = "" }) => {
        const val = await client.hget(key, field)
        return [{ key, field, value: tryParseJSON(val) }]
    },

    lrange: async (client, { key, start = 0, end = 19 }) => {
        const vals = await client.lrange(key, start, end)
        const total = await client.llen(key)
        return [{ key, values: vals.map(tryParseJSON), total }]
    },

    smembers: async (client, { key }) => {
        const vals = await client.smembers(key)
        return [{ key, members: vals }]
    },

    zrange: async (client, { key, start = 0, end = 19, withScores = true }) => {
        if (withScores) {
            const raw = await client.zrange(key, start, end, "WITHSCORES")
            const members = []
            for (let i = 0; i < raw.length; i += 2) {
                members.push({ member: raw[i], score: parseFloat(raw[i + 1] ?? "0") })
            }
            return [{ key, members }]
        }
        const raw = await client.zrange(key, start, end)
        return [{ key, members: raw }]
    },

    scan: async (client, { pattern = "*", count = 20, type: keyType }) => {
        const keys: string[] = []
        let cursor = "0"
        const limit = Math.min(count, 200)

        do {
            let result: [string, string[]]
            if (keyType) {
                result = await (client as Redis).call(
                    "SCAN", cursor, "MATCH", pattern, "COUNT", "50", "TYPE", keyType
                ) as [string, string[]]
            } else {
                result = await client.scan(cursor, "MATCH", pattern, "COUNT", 50)
            }
            const [next, batch] = result
            keys.push(...batch)
            cursor = next
        } while (cursor !== "0" && keys.length < limit)

        return keys.slice(0, limit).map(k => ({ key: k }))
    },

    type: async (client, { key }) => {
        const t = await client.type(key)
        return [{ key, type: t }]
    },

    ttl: async (client, { key }) => {
        const t = await client.ttl(key)
        return [{ key, ttl_seconds: t }]
    },
}

export class RedisAdapter extends DBAdapter {
    #client!: Redis
    #keyPrefix!: string

    override async connect(config: DBConfig): Promise<void> {
        const cfg = config as RedisConfig
        this.#keyPrefix = cfg.keyPrefix ?? ""
        this.#client = new Redis(cfg.url, { lazyConnect: true })
        await this.#client.connect()
    }

    override async query(params: QueryParams): Promise<QueryResult> {
        const p = params as RedisQueryParams
        const fn = OPS[p.operation]

        if (!fn) {
            throw new Error(
                `Unknown operation "${p.operation}". Available: ${Object.keys(OPS).join(", ")}`
            )
        }

        // Apply prefix
        const prefixed: RedisQueryParams = {
            ...p,
            key: this.#keyPrefix + p.key,
        }
        if (p.keys) {
            prefixed.keys = p.keys.map(k => this.#keyPrefix + k)
        }

        return fn(this.#client, prefixed)
    }

    override async introspect(): Promise<DBSchema> {
        const pattern = `${this.#keyPrefix}*`
        const sample: string[] = []
        let cursor = "0"

        do {
            const [next, keys] = await this.#client.scan(cursor, "MATCH", pattern, "COUNT", 50)
            sample.push(...keys)
            cursor = next
        } while (cursor !== "0" && sample.length < 100)

        if (!sample.length) {
            return {
                keyPrefix: this.#keyPrefix,
                totalScanned: 0,
                byType: {},
                operations: Object.keys(OPS),
                note: "No keys found",
            } satisfies RedisSchema
        }

        // Group keys by Redis type
        const typeGroups: Record<string, string[]> = {}
        await Promise.all(
            sample.slice(0, 50).map(async (key) => {
                const t = await this.#client.type(key)
                typeGroups[t] ??= []
                typeGroups[t]!.push(key)
            })
        )

        // Sample 1 key per type to show structure
        const byType: Record<string, RedisTypeData> = {}
        for (const [redisType, keys] of Object.entries(typeGroups)) {
            const sampleKey = keys[0]!
            byType[redisType] = {
                count: keys.length,
                sampleKeys: keys.slice(0, 5),
                sampleData: await this.#sampleByType(redisType, sampleKey),
            }
        }

        return {
            keyPrefix: this.#keyPrefix,
            totalScanned: sample.length,
            byType,
            operations: Object.keys(OPS),
        } satisfies RedisSchema
    }

    async #sampleByType(type: string, key: string): Promise<Record<string, unknown>> {
        try {
            switch (type) {
                case "string": return { value: tryParseJSON(await this.#client.get(key)) }
                case "hash": return { fields: await this.#client.hgetall(key) }
                case "list": return { first5: (await this.#client.lrange(key, 0, 4)).map(tryParseJSON) }
                case "set": return { sample: await this.#client.srandmember(key, 5) }
                case "zset": {
                    const raw = await this.#client.zrange(key, 0, 4, "WITHSCORES")
                    const members = []
                    for (let i = 0; i < raw.length; i += 2) {
                        members.push({ member: raw[i], score: parseFloat(raw[i + 1] ?? "0") })
                    }
                    return { top5: members }
                }
                default: return {}
            }
        } catch { return {} }
    }

    override async healthCheck(): Promise<boolean> {
        try {
            await this.#client.ping()
            return true
        } catch { return false }
    }

    override async disconnect(): Promise<void> {
        await this.#client?.quit()
    }
}

function tryParseJSON(val: string | null | undefined): unknown {
    if (val === null || val === undefined) return null
    try { return JSON.parse(val) } catch { return val }
}
