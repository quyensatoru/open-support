import { env } from './env.js';
import { initConfig } from './config/index.js';
import { buildServer } from './http/server.js';
import { logger } from './observability/logger.js';

const server = await buildServer();

try {
    await initConfig(server);
    await server.listen({ host: env.HOST, port: env.PORT });
    logger.info({ host: env.HOST, port: env.PORT }, 'MIDA Agent server started');
} catch (error) {
    logger.error({ error }, 'Failed to start MIDA Agent server');
    process.exit(1);
}
