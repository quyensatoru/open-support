import type {
    AgentRun,
    AgentRunRequest,
    AgentSettings,
    HealthResponse,
    SkillDefinition,
    ToolDefinition,
} from './types';

const API_BASE_URL = import.meta.env.VITE_AGENT_API_URL ?? 'http://localhost:7332';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: { 'content-type': 'application/json' },
        ...init,
    });

    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
}

export const agentApi = {
    health: () => request<HealthResponse>('/health'),
    settings: () => request<AgentSettings>('/v1/settings'),
    tools: () => request<ToolDefinition[]>('/v1/tools'),
    skills: () => request<SkillDefinition[]>('/v1/skills'),
    runs: () => request<AgentRun[]>('/v1/agent/runs'),
    createRun: (input: AgentRunRequest) =>
        request<AgentRun>('/v1/agent/runs', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
};
