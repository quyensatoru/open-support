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

export type ToolDefinition = {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    source: 'local' | 'playwright' | 'mcp-placeholder';
};

export type SkillDefinition = {
    id: string;
    name: string;
    description: string;
    instructions: string;
    toolIds: string[];
    enabled: boolean;
};

export type AgentSettings = {
    model: string;
    openAiConfigured: boolean;
    langSmithTracing: boolean;
    playwrightHeadless: boolean;
    mcpStatus: 'placeholder';
};

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
