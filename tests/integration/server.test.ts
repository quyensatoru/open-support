import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '../../apps/server/src/http/server.ts';

describe('agent server routes', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = await buildServer();
    });

    afterEach(async () => {
        await app.close();
    });

    it('serves minimal health with database status', async () => {
        const response = await app.inject({ method: 'GET', url: '/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            name: 'mida-agent',
            status: 'ok',
            db: {
                configured: false,
                status: 'not_configured',
            },
            mcpStatus: 'placeholder',
        });
    });

    it('does not expose scaffold APIs anymore', async () => {
        const settings = await app.inject({ method: 'GET', url: '/v1/settings' });
        const tools = await app.inject({ method: 'GET', url: '/v1/tools' });
        const skills = await app.inject({ method: 'GET', url: '/v1/skills' });
        const runs = await app.inject({ method: 'GET', url: '/v1/agent/runs' });

        expect(settings.statusCode).toBe(404);
        expect(tools.statusCode).toBe(404);
        expect(skills.statusCode).toBe(404);
        expect(runs.statusCode).toBe(404);
    });

    it('returns 503 from config APIs when DATABASE_URL is absent', async () => {
        const config = await app.inject({ method: 'GET', url: '/v1/config/llms' });
        const supportRuns = await app.inject({ method: 'GET', url: '/v1/support/runs' });
        const memory = await app.inject({ method: 'GET', url: '/v1/memory' });

        expect(config.statusCode).toBe(503);
        expect(supportRuns.statusCode).toBe(503);
        expect(memory.statusCode).toBe(503);
        expect(config.json()).toMatchObject({
            error: 'DB not configured',
            statusCode: 503,
        });
    });

    it('keeps MCP endpoint as an explicit placeholder', async () => {
        const response = await app.inject({ method: 'POST', url: '/mcp', payload: {} });

        expect(response.statusCode).toBe(501);
        expect(response.json()).toMatchObject({ status: 'not_implemented' });
    });
});
