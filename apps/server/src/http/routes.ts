import type { FastifyInstance } from 'fastify';
import { checkDbConnection, isDbConfigured } from '../config/postgres.js';
import { registerMcpPlaceholder } from '../mcp/server.js';
import { registerConfigRoutes } from './routes/config/index.js';
import { registerSupportRoutes } from './routes/support.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
    app.get('/health', async () => {
        const dbConfigured = isDbConfigured();
        const dbOk = await checkDbConnection();

        return {
            name: 'mida-agent',
            status: 'ok',
            db: {
                configured: dbConfigured,
                status: dbConfigured ? (dbOk ? 'ok' : 'unavailable') : 'not_configured',
            },
            mcpStatus: 'placeholder',
            timestamp: new Date().toISOString(),
        };
    });

    await registerConfigRoutes(app);
    await registerSupportRoutes(app);
    await registerMcpPlaceholder(app);
}
