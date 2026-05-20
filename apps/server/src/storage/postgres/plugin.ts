import type { FastifyInstance } from 'fastify';

import { env } from '../../env.js';
import { logger } from '../../observability/logger.js';
import { closePostgresPool, getPostgresPool } from './client.js';
import { runPostgresMigrations } from './migrator.js';

export async function registerDatabase(app: FastifyInstance): Promise<void> {
    const pool = getPostgresPool();
    if (!pool) {
        logger.debug('Postgres is disabled because DATABASE_URL is empty');
        return;
    }

    app.addHook('onClose', async () => {
        await closePostgresPool();
    });

    if (env.DATABASE_MIGRATE_ON_START) {
        const appliedMigrations = await runPostgresMigrations(pool);
        logger.info({ appliedMigrations }, 'Postgres migrations checked');
    }
}
