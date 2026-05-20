import pg from 'pg';
import type { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';

import type { Env } from '../../env.js';
import { env } from '../../env.js';

const { Pool: PgPool } = pg;

export type QueryExecutor = {
    query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[],
    ): Promise<QueryResult<T>>;
};

let postgresPool: Pool | null | undefined;

export function createPostgresPool(config: Env = env): Pool | null {
    const connectionString = config.DATABASE_URL.trim();
    if (!connectionString) {
        return null;
    }

    const poolConfig: PoolConfig = {
        connectionString,
        max: config.DATABASE_POOL_MAX,
        connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS,
        idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
    };

    if (config.DATABASE_SSL) {
        poolConfig.ssl = { rejectUnauthorized: false };
    }

    return new PgPool(poolConfig);
}

export function getPostgresPool(config: Env = env): Pool | null {
    if (postgresPool !== undefined) {
        return postgresPool;
    }

    postgresPool = createPostgresPool(config);
    return postgresPool;
}

export function requirePostgresPool(): Pool {
    const pool = getPostgresPool();
    if (!pool) {
        throw new Error('DATABASE_URL is not configured');
    }

    return pool;
}

export async function closePostgresPool(): Promise<void> {
    if (!postgresPool) {
        postgresPool = null;
        return;
    }

    const pool = postgresPool;
    postgresPool = null;
    await pool.end();
}

export async function pingPostgres(db: QueryExecutor = requirePostgresPool()): Promise<void> {
    await db.query('SELECT 1');
}
