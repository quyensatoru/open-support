import type { Pool } from 'pg';

import { requirePostgresPool } from './client.js';
import { postgresMigrations } from './migrations/index.js';

const MIGRATIONS_TABLE = 'schema_migrations';

export async function runPostgresMigrations(pool: Pool = requirePostgresPool()): Promise<string[]> {
    const client = await pool.connect();
    const appliedNow: string[] = [];

    try {
        await client.query(`
CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);
`);

        const appliedResult = await client.query<{ id: string }>(
            `SELECT id FROM ${MIGRATIONS_TABLE}`,
        );
        const applied = new Set(appliedResult.rows.map((row) => row.id));

        for (const migration of postgresMigrations) {
            if (applied.has(migration.id)) {
                continue;
            }

            await client.query('BEGIN');
            try {
                await client.query(migration.sql);
                await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1)`, [
                    migration.id,
                ]);
                await client.query('COMMIT');
                appliedNow.push(migration.id);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }
    } finally {
        client.release();
    }

    return appliedNow;
}
