import type { FastifyInstance } from 'fastify';

import { listMcpCapabilities } from './registry.js';
import type { McpPlaceholderStatus } from './types.js';

export async function registerMcpPlaceholder(app: FastifyInstance): Promise<void> {
    app.all('/mcp', async (_request, reply) => {
        const payload: McpPlaceholderStatus & { capabilities: string[] } = {
            status: 'not_implemented',
            message:
                'MIDA Agent MCP server is a placeholder. Future versions will expose agent runs and tools here.',
            capabilities: listMcpCapabilities(),
        };

        return reply.code(501).send(payload);
    });
}
