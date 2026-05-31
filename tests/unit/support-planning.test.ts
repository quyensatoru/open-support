import { describe, expect, it } from 'vitest';

import { listSkills } from '../../apps/server/src/skills/registry.ts';
import { listTools } from '../../apps/server/src/tools/registry.ts';

describe('static runtime manifests', () => {
    it('keeps static tool and skill manifests valid for config seeding', () => {
        const tools = listTools();
        const skills = listSkills();
        const toolIds = new Set(tools.map((tool) => tool.id));

        expect(tools.length).toBeGreaterThan(0);
        expect(skills.length).toBeGreaterThan(0);
        expect(
            skills.flatMap((skill) => skill.toolIds).every((toolId) => toolIds.has(toolId)),
        ).toBe(true);
    });
});
