import type { AppDBConfig, DBConfig, QueryParams, QueryResult, AllSchemas } from "./types.js"
import type { DBAdapter } from "./adapters/base.adapter.js"

type AdapterClass = new () => DBAdapter

export class DBRegistry {
    static readonly #adapters = new Map<string, AdapterClass>()
    static readonly #instances = new Map<string, DBAdapter>()
    static readonly #sourceTypes = new Map<string, DBConfig["type"]>()

    static register(type: string, AdapterClass: AdapterClass): typeof DBRegistry {
        this.#adapters.set(type, AdapterClass)
        return this
    }

    static async initFromConfig(config: AppDBConfig): Promise<void> {
        const errors: string[] = []

        for (const [sourceName, cfg] of Object.entries(config)) {
            const AdapterClass = this.#adapters.get(cfg.type)

            if (!AdapterClass) {
                errors.push(
                    `[${sourceName}] Unknown type "${cfg.type}". Registered: ${[...this.#adapters.keys()].join(", ")}`
                )
                continue
            }

            try {
                const adapter = new AdapterClass()
                await adapter.connect(cfg as DBConfig)
                this.#instances.set(sourceName, adapter)
                this.#sourceTypes.set(sourceName, cfg.type)
                console.log(`✅ Connected: ${sourceName} (${cfg.type})`)
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                errors.push(`[${sourceName}] Connection failed: ${msg}`)
            }
        }

        if (errors.length) {
            throw new Error(`DB init errors:\n${errors.map(e => `  ${e}`).join("\n")}`)
        }
    }

    static async dispatch(source: string, params: QueryParams): Promise<QueryResult> {
        const adapter = this.#instances.get(source)
        if (!adapter) {
            const available = [...this.#instances.keys()].join(", ")
            throw new Error(`Unknown source "${source}". Available: ${available}`)
        }
        return adapter.query(params)
    }

    static async getAllSchemas(): Promise<AllSchemas> {
        const schemas: AllSchemas = {}

        await Promise.all(
            [...this.#instances.entries()].map(async ([name, adapter]) => {
                try {
                    schemas[name] = await adapter.introspect()
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    schemas[name] = { error: msg }
                }
            })
        )

        return schemas
    }

    static async getSchema(source: string): Promise<AllSchemas[string]> {
        const adapter = this.#instances.get(source)
        if (!adapter) {
            const available = [...this.#instances.keys()].join(", ")
            throw new Error(`Unknown source "${source}". Available: ${available}`)
        }

        return adapter.introspect()
    }

    static async healthCheckAll(): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {}

        await Promise.all(
            [...this.#instances.entries()].map(async ([name, adapter]) => {
                results[name] = await adapter.healthCheck().catch(() => false)
            })
        )

        return results
    }

    static async disconnectAll(): Promise<void> {
        await Promise.all(
            [...this.#instances.values()].map(a => a.disconnect().catch(() => { }))
        )
        this.#instances.clear()
        this.#sourceTypes.clear()
        console.log("All DB connections closed")
    }

    static getSources(): string[] {
        return [...this.#instances.keys()]
    }

    static getSourceTypes(): Record<string, DBConfig["type"]> {
        return Object.fromEntries(this.#sourceTypes.entries())
    }

    static getSourceType(source: string): DBConfig["type"] | undefined {
        return this.#sourceTypes.get(source)
    }
}
