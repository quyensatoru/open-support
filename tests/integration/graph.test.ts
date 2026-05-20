import { describe, expect, it } from 'vitest';

import { invokeAgentGraph } from '../../apps/server/src/graph/graph.ts';

describe('agent graph', () => {
    it('returns a scaffold response without requiring OpenAI credentials', async () => {
        const result = await invokeAgentGraph({ message: 'ping' });

        expect(result.echo).toBe('ping');
        expect(result.toolCount).toBeGreaterThan(0);
        expect(result.message).toContain('Agent graph initialized');
    });
});
