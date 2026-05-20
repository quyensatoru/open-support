import { describe, expect, it } from 'vitest';

import type { SkillDefinition, ToolDefinition } from '../../apps/server/src/http/contracts.ts';
import { assertSkillManifests, listSkills } from '../../apps/server/src/skills/registry.ts';

describe('skill registry', () => {
    it('lists valid scaffold skill definitions', () => {
        expect(listSkills().map((skill) => skill.id)).toContain('agent.operator');
    });

    it('rejects skills that reference unknown tools', () => {
        const skills: SkillDefinition[] = [
            {
                id: 'bad.skill',
                name: 'Bad skill',
                description: 'Invalid manifest',
                instructions: 'Use a missing tool.',
                toolIds: ['missing.tool'],
                enabled: true,
            },
        ];
        const tools: ToolDefinition[] = [
            {
                id: 'known.tool',
                name: 'Known',
                description: 'Known tool',
                enabled: true,
                source: 'local',
            },
        ];

        expect(() => assertSkillManifests(skills, tools)).toThrow('unknown tool id');
    });
});
