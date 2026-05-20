import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '../../apps/server/src/http/server.ts';
import { runStore } from '../../apps/server/src/runs/store.ts';

describe('agent server routes', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        runStore.reset();
        app = await buildServer();
    });

    afterEach(async () => {
        await app.close();
        runStore.reset();
    });

    it('serves health, tools, skills, and settings', async () => {
        const health = await app.inject({ method: 'GET', url: '/health' });
        const tools = await app.inject({ method: 'GET', url: '/v1/tools' });
        const skills = await app.inject({ method: 'GET', url: '/v1/skills' });
        const settings = await app.inject({ method: 'GET', url: '/v1/settings' });

        expect(health.statusCode).toBe(200);
        expect(tools.statusCode).toBe(200);
        expect(skills.statusCode).toBe(200);
        expect(settings.statusCode).toBe(200);
        expect(health.json()).toMatchObject({ status: 'ok', mcpStatus: 'placeholder' });
    });

    it('creates and reads an agent run', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/v1/agent/runs',
            payload: { message: 'run scaffold check' },
        });
        expect(created.statusCode).toBe(201);

        const createdBody = created.json();
        expect(createdBody.status).toBe('completed');
        expect(createdBody.input.message).toBe('run scaffold check');

        const listed = await app.inject({ method: 'GET', url: '/v1/agent/runs' });
        expect(listed.statusCode).toBe(200);
        expect(listed.json()).toHaveLength(1);

        const fetched = await app.inject({
            method: 'GET',
            url: `/v1/agent/runs/${createdBody.id}`,
        });
        expect(fetched.statusCode).toBe(200);
        expect(fetched.json().id).toBe(createdBody.id);
    });

    it('keeps MCP endpoint as an explicit placeholder', async () => {
        const response = await app.inject({ method: 'POST', url: '/mcp', payload: {} });

        expect(response.statusCode).toBe(501);
        expect(response.json()).toMatchObject({ status: 'not_implemented' });
    });
});
