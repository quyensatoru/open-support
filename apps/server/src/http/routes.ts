import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { runAgent } from '../agent/service.js';
import { env } from '../env.js';
import { registerMcpPlaceholder } from '../mcp/server.js';
import { listSkills } from '../skills/registry.js';
import { listTools } from '../tools/registry.js';
import { AgentRunRequestSchema, RunIdParamsSchema } from './contracts.js';

function zodErrorPayload(error: ZodError) {
    return {
        error: 'Validation Error',
        issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
        })),
    };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
    app.get('/health', async () => ({
        name: 'mida-agent',
        status: 'ok',
        mcpStatus: 'placeholder',
        timestamp: new Date().toISOString(),
    }));

    app.get('/v1/settings', async () => ({
        model: env.OPENAI_MODEL,
        openAiConfigured: Boolean(env.OPENAI_API_KEY),
        langSmithTracing: env.LANGSMITH_TRACING,
        playwrightHeadless: env.PLAYWRIGHT_HEADLESS,
        mcpStatus: 'placeholder',
    }));

    app.get('/v1/tools', async () => listTools());
    app.get('/v1/skills', async () => listSkills());

    app.post('/v1/agent/runs', async (request, reply) => {
        const parsed = AgentRunRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send(zodErrorPayload(parsed.error));
        }

        const run = await runAgent(parsed.data);
        return reply.code(201).send(run);
    });

    app.get('/v1/agent/runs', async () => runAgent.store.list());

    app.get('/v1/agent/runs/:id', async (request, reply) => {
        const parsed = RunIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
            return reply.code(400).send(zodErrorPayload(parsed.error));
        }

        const run = runAgent.store.get(parsed.data.id);
        if (!run) {
            return reply.code(404).send({ error: 'Run not found' });
        }

        return run;
    });

    await registerMcpPlaceholder(app);
}
