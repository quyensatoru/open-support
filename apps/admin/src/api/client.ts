import type { HealthResponse } from './types';

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
};
