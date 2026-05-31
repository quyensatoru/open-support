export type ConfigResource = 'llms' | 'agents' | 'apps' | 'workflows' | 'tools' | 'skills';

export type HealthResponse = {
    name: string;
    status: string;
    db: {
        configured: boolean;
        status: 'ok' | 'unavailable' | 'not_configured';
    };
    mcpStatus: string;
    timestamp: string;
};

export type SupportRunStatus =
    | 'queued'
    | 'running'
    | 'interrupted'
    | 'partial'
    | 'completed'
    | 'failed';

export type SupportRunRequest = {
    appKey?: string;
    workflowKey?: string;
    issue: string;
    storeUrl?: string;
    storeDomain?: string;
    threadId?: string;
    mode?: 'diagnose' | 'search' | 'fix';
    maxHypotheses?: number;
    repoName?: string;
    repoNames?: string[];
    metadata?: Record<string, unknown>;
};

export type SupportRun = {
    id: string;
    threadId: string;
    appKey: string;
    workflowKey: string;
    appName: string;
    storeUrl?: string | null;
    storeDomain?: string | null;
    issue: string;
    status: SupportRunStatus;
    input: Record<string, unknown>;
    output?: Record<string, unknown> | null;
    error?: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type SupportRunStep = {
    id: string;
    runId: string;
    stepKey: string;
    graph: string;
    status: 'running' | 'completed' | 'skipped' | 'interrupted' | 'failed';
    input: Record<string, unknown>;
    output?: Record<string, unknown> | null;
    error?: string | null;
    metadata: Record<string, unknown>;
    startedAt: string;
    finishedAt?: string | null;
    createdAt: string;
    updatedAt: string;
};

export type Memory = {
    id: string;
    namespace: string;
    key: string;
    kind: string;
    content: string;
    value: Record<string, unknown>;
    confidence: 'low' | 'medium' | 'high';
    sourceRunId?: string | null;
    sourceStepId?: string | null;
    expiresAt?: string | null;
    createdAt: string;
    updatedAt: string;
};

export type MemoryInput = {
    namespace: string | string[];
    key?: string;
    kind?: string;
    content: string;
    value?: Record<string, unknown>;
    confidence?: 'low' | 'medium' | 'high';
    sourceRunId?: string | null;
    sourceStepId?: string | null;
    expiresAt?: string | null;
};

function withQuery(path: string, query?: Record<string, string | number | boolean | undefined>) {
    if (!query) return path;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) params.set(key, String(value));
    }
    const suffix = params.toString();
    return suffix ? `${path}?${suffix}` : path;
}

export class MidaAgentClient {
    constructor(private readonly baseUrl: string) {}

    async health(): Promise<HealthResponse> {
        return this.get('/health');
    }

    async listConfigs<T = unknown>(resource: ConfigResource): Promise<T[]> {
        return this.get(`/v1/config/${resource}`);
    }

    async getConfig<T = unknown>(resource: ConfigResource, id: string): Promise<T> {
        return this.get(`/v1/config/${resource}/${id}`);
    }

    async createConfig<T = unknown>(resource: ConfigResource, input: unknown): Promise<T> {
        return this.post(`/v1/config/${resource}`, input);
    }

    async updateConfig<T = unknown>(
        resource: ConfigResource,
        id: string,
        patch: unknown,
    ): Promise<T> {
        return this.patch(`/v1/config/${resource}/${id}`, patch);
    }

    async deleteConfig(resource: ConfigResource, id: string): Promise<{ deleted: boolean }> {
        return this.delete(`/v1/config/${resource}/${id}`);
    }

    async listSupportRuns(query?: {
        appKey?: string;
        threadId?: string;
        status?: SupportRunStatus;
        limit?: number;
    }): Promise<SupportRun[]> {
        return this.get(withQuery('/v1/support/runs', query));
    }

    async createSupportRun(input: SupportRunRequest): Promise<SupportRun> {
        return this.post('/v1/support/runs', input);
    }

    async getSupportRun(id: string): Promise<SupportRun> {
        return this.get(`/v1/support/runs/${id}`);
    }

    async listSupportRunSteps(id: string): Promise<SupportRunStep[]> {
        return this.get(`/v1/support/runs/${id}/steps`);
    }

    async listMemories(query?: {
        namespace?: string;
        kind?: string;
        query?: string;
        includeExpired?: boolean;
        limit?: number;
    }): Promise<Memory[]> {
        return this.get(withQuery('/v1/memory', query));
    }

    async createMemory(input: MemoryInput): Promise<Memory> {
        return this.post('/v1/memory', input);
    }

    async updateMemory(id: string, patch: Partial<MemoryInput>): Promise<Memory> {
        return this.patch(`/v1/memory/${id}`, patch);
    }

    async deleteMemory(id: string): Promise<{ deleted: boolean }> {
        return this.delete(`/v1/memory/${id}`);
    }

    private async get<T>(path: string): Promise<T> {
        const response = await fetch(new URL(path, this.baseUrl));
        return this.handleResponse<T>(response);
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        const response = await fetch(new URL(path, this.baseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        return this.handleResponse<T>(response);
    }

    private async patch<T>(path: string, body: unknown): Promise<T> {
        const response = await fetch(new URL(path, this.baseUrl), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        return this.handleResponse<T>(response);
    }

    private async delete<T>(path: string): Promise<T> {
        const response = await fetch(new URL(path, this.baseUrl), {
            method: 'DELETE',
        });
        return this.handleResponse<T>(response);
    }

    private async handleResponse<T>(response: Response): Promise<T> {
        if (!response.ok) {
            throw new Error(`MIDA Agent request failed: ${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<T>;
    }
}
