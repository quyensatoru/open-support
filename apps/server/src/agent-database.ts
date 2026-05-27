import { invokeDatabaseGraph } from './graph/database/database.graph.js';
import {
    AppDatabaseConfigSchema,
    DatabaseGraphInputSchema,
    type AppDatabaseConfig,
    type DatabaseGraphInput,
} from './graph/database/database.type.js';
import { DBRegistry } from './tools/app/db/index.js';
import {
    getDatabaseLLMTokenUsageTotals,
    resetDatabaseLLMTokenUsageTotals,
} from './tools/app/db/tools/llm-token-usage.js';
import { env } from './env.js';
import { logger } from './observability/logger.js';

function numberFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }

    return value;
}

function inferSqlSourceType(url: string): 'postgres' | 'mysql' | 'sqlite' | 'mssql' {
    if (/^mysql(2)?:/i.test(url)) return 'mysql';
    if (/^sqlite:/i.test(url)) return 'sqlite';
    if (/^mssql:/i.test(url) || /^sqlserver:/i.test(url)) return 'mssql';
    return 'postgres';
}

function parseTargetKind(raw: string): NonNullable<DatabaseGraphInput['targetKind']> {
    if (raw === 'collection' || raw === 'table' || raw === 'redisType' || raw === 'source') {
        return raw;
    }

    throw new Error(
        'DATABASE_TEST_TARGET_KIND must be one of: collection, table, redisType, source',
    );
}

type RawDatabaseConfig = Record<string, unknown>;

function parseJsonEnv(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch (error) {
        const withoutTrailingCommas = raw.replace(/,\s*([}\]])/g, '$1');
        try {
            return JSON.parse(withoutTrailingCommas);
        } catch {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`APP_DB_CONFIG_JSON is not valid JSON: ${message}`);
        }
    }
}

function dbNameFromMongoUri(uri: string): string | undefined {
    try {
        const url = new URL(uri);
        const dbName = url.pathname.replace(/^\//, '').trim();
        return dbName || undefined;
    } catch {
        return undefined;
    }
}

function normalizeRawSources(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;

    return Object.fromEntries(
        Object.entries(raw as Record<string, RawDatabaseConfig>).map(([source, config]) => {
            if (config.type !== 'mongodb' || typeof config.uri !== 'string' || config.db) {
                return [source, config];
            }

            const db = dbNameFromMongoUri(config.uri);
            if (!db) return [source, config];

            return [
                source,
                {
                    ...config,
                    db,
                },
            ];
        }),
    );
}

function parseSources(): AppDatabaseConfig {
    const rawConfig = process.env.APP_DB_CONFIG_JSON;
    if (rawConfig?.trim()) {
        return AppDatabaseConfigSchema.parse(normalizeRawSources(parseJsonEnv(rawConfig)));
    }

    if (!env.DATABASE_URL.trim()) {
        throw new Error(
            'Missing database config. Set DATABASE_URL or APP_DB_CONFIG_JSON before running this test.',
        );
    }

    const sourceType = inferSqlSourceType(env.DATABASE_URL);

    return {
        main: {
            type: sourceType,
            dsn: env.DATABASE_URL,
        },
    };
}

function buildInput(): DatabaseGraphInput {
    const input: DatabaseGraphInput = {
        app: process.env.DATABASE_TEST_APP ?? 'mida record',
        issue:
            process.env.DATABASE_TEST_ISSUE ??
            'check cho t xem store domain dev-quyen-blocker-plus.myshopify.com có bao nhiêu record trong tháng vừa qua không',
        sources: parseSources(),
        maxChecks: numberFromEnv('DATABASE_TEST_MAX_CHECKS', 5),
        sampleLimit: numberFromEnv('DATABASE_TEST_SAMPLE_LIMIT', 5),
    };

    if (process.env.DATABASE_TEST_SOURCE) {
        input.source = process.env.DATABASE_TEST_SOURCE;
    }

    if (process.env.DATABASE_TEST_TARGET) {
        input.target = process.env.DATABASE_TEST_TARGET;
    }

    if (process.env.DATABASE_TEST_TARGET_KIND) {
        input.targetKind = parseTargetKind(process.env.DATABASE_TEST_TARGET_KIND);
    }

    return DatabaseGraphInputSchema.parse(input);
}

resetDatabaseLLMTokenUsageTotals();

try {
    const result = await invokeDatabaseGraph(buildInput());
    console.dir(result.summary, { depth: null });
} finally {
    const tokenUsage = getDatabaseLLMTokenUsageTotals();
    if (tokenUsage.calls > 0) {
        logger.info({ tokenUsage }, 'database.llm total token usage');
    }

    await DBRegistry.disconnectAll();
}
