import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { registerMcpPlaceholder } from '../mcp/server.js';
import { listSkills } from '../skills/registry.js';
import { listTools } from '../tools/registry.js';

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
    await registerMcpPlaceholder(app);
}
