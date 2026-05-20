import type { SkillDefinition, ToolDefinition } from '../http/contracts.js';
import { SkillDefinitionSchema } from '../http/contracts.js';
import { listTools } from '../tools/registry.js';

const SKILL_DEFINITIONS: SkillDefinition[] = [
    {
        id: 'agent.operator',
        name: 'Agent operator',
        description:
            'Default internal operations skill for running and inspecting agent workflows.',
        instructions:
            'Use available local tools only. Treat MCP as unavailable until the placeholder is replaced.',
        toolIds: ['time.now'],
        enabled: true,
    },
    {
        id: 'browser.automation',
        name: 'Browser web search',
        description: 'Reserved skill for future Playwright-driven web search and page inspection.',
        instructions: 'Use browser search only when the workflow needs live web context.',
        toolIds: ['browser.search_web'],
        enabled: false,
    },
];

export function assertSkillManifests(
    skills: SkillDefinition[],
    tools: ToolDefinition[] = listTools(),
): void {
    const toolIds = new Set(tools.map((toolDefinition) => toolDefinition.id));

    for (const skill of skills) {
        SkillDefinitionSchema.parse(skill);

        for (const toolId of skill.toolIds) {
            if (!toolIds.has(toolId)) {
                throw new Error(`Skill ${skill.id} references unknown tool id: ${toolId}`);
            }
        }
    }
}

export function listSkills(): SkillDefinition[] {
    assertSkillManifests(SKILL_DEFINITIONS);
    return SKILL_DEFINITIONS;
}
