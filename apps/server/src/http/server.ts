import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { env } from '../env.js';
import { registerRoutes } from './routes.js';

function getStatusCode(error: unknown): number {
    if (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
    ) {
        return error.statusCode;
    }

    return 500;
}

export async function buildServer(): Promise<FastifyInstance> {
    const app = Fastify({
        logger: false,
    });

    app.addHook('onRequest', async (request, reply) => {
        reply.header('access-control-allow-origin', env.ADMIN_ORIGIN);
        reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
        reply.header('access-control-allow-headers', 'content-type,authorization');

        if (request.method === 'OPTIONS') {
            return reply.code(204).send();
        }
    });

    app.setErrorHandler((error, _request, reply) => {
        const statusCode = getStatusCode(error);
        const message = error instanceof Error ? error.message : 'Unknown error';

        reply.code(statusCode).send({
            error: statusCode >= 500 ? 'Internal Server Error' : message,
            statusCode,
        });
    });

    await registerRoutes(app);
    return app;
}
