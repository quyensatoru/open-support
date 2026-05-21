import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import type { ToolDefinition } from '../http/contracts.js';
import { getPlaywrightDefaults } from '../playwright/config.js';

export const currentTimeTool = tool(async () => new Date().toISOString(), {
    name: 'time.now',
    description: 'Return the current server time as an ISO timestamp.',
    schema: z.object({}),
});

const TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        id: 'time.now',
        name: 'Current time',
        description: 'Return current server time for agent planning and audit messages.',
        enabled: true,
        source: 'local',
    },
    {
        id: 'browser.search_web',
        name: 'Browser web search',
        description: `Playwright-powered web search tool; headless=${getPlaywrightDefaults().headless}.`,
        enabled: false,
        source: 'playwright',
    },
    {
        id: 'browser.detect',
        name: 'Browser detect',
        description: 'Collect DOM, network, script, console, and global browser signals for a website.',
        enabled: true,
        source: 'playwright',
    },
    {
        id: 'system.grep',
        name: 'Signal grep',
        description: 'Search browser signal logs by run id and keyword.',
        enabled: true,
        source: 'local',
    },
    {
        id: 'browser.diagnose',
        name: 'Browser diagnose',
        description: `Open a website with Playwright and return response diagnostics; headless=${getPlaywrightDefaults().headless}.`,
        enabled: true,
        source: 'playwright',
    },
    {
        id: 'mcp.server.placeholder',
        name: 'MCP server placeholder',
        description: 'Reserved for future external systems that call into MIDA Agent over MCP.',
        enabled: false,
        source: 'mcp-placeholder',
    },
];

export function assertUniqueToolIds(tools: ToolDefinition[]): void {
    const seen = new Set<string>();
    for (const item of tools) {
        if (seen.has(item.id)) {
            throw new Error(`Duplicate tool id: ${item.id}`);
        }
        seen.add(item.id);
    }
}

export function listTools(): ToolDefinition[] {
    assertUniqueToolIds(TOOL_DEFINITIONS);
    return TOOL_DEFINITIONS;
}
