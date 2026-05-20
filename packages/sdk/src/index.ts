export type AgentRunRequest = {
    message: string;
    threadId?: string;
    metadata?: Record<string, unknown>;
};

export type AgentRun = {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    input: AgentRunRequest;
    output?: unknown;
    error?: string;
    createdAt: string;
    updatedAt: string;
};

export class MidaAgentClient {
    constructor(private readonly baseUrl: string) {}

    async health(): Promise<unknown> {
        return this.get('/health');
    }

    async createRun(input: AgentRunRequest): Promise<AgentRun> {
        return this.post('/v1/agent/runs', input);
    }

    async listRuns(): Promise<AgentRun[]> {
        return this.get('/v1/agent/runs');
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

    private async handleResponse<T>(response: Response): Promise<T> {
        if (!response.ok) {
            throw new Error(`MIDA Agent request failed: ${response.status} ${response.statusText}`);
        }
        return response.json() as Promise<T>;
    }
}
