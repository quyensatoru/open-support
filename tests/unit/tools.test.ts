import { describe, expect, it } from 'vitest';

import { assertUniqueToolIds, listTools } from '../../apps/server/src/tools/registry.ts';
import type { ToolDefinition } from '../../apps/server/src/http/contracts.ts';

describe('tool registry', () => {
    it('lists scaffold tool definitions', () => {
        const tools = listTools();

        expect(tools.map((tool) => tool.id)).toContain('time.now');
        expect(tools.map((tool) => tool.source)).toContain('mcp-placeholder');
    });

    it('rejects duplicate tool ids', () => {
        const tools: ToolDefinition[] = [
            {
                id: 'duplicate',
                name: 'One',
                description: 'First tool',
                enabled: true,
                source: 'local',
            },
            {
                id: 'duplicate',
                name: 'Two',
                description: 'Second tool',
                enabled: true,
                source: 'local',
            },
        ];

        expect(() => assertUniqueToolIds(tools)).toThrow('Duplicate tool id');
    });
});
