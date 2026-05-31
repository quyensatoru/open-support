import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../db/schema/index.js';
import { env } from '../env.js';

const poolConfig = {
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
    ...(env.DATABASE_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
};

export type Db = NodePgDatabase<typeof schema>;

export const pool = new Pool(poolConfig);
export const db: Db = drizzle(pool, { schema });

export function isDbConfigured(): boolean {
    return Boolean(env.DATABASE_URL.trim());
}

export async function checkDbConnection(): Promise<boolean> {
    if (!isDbConfigured()) return false;

    try {
        await pool.query('SELECT 1');
        return true;
    } catch {
        return false;
    }
}
