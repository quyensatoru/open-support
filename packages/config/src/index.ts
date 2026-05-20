export const DEFAULT_AGENT_PORT = 7332;
export const DEFAULT_ADMIN_PORT = 7333;
export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

export const ENV_KEYS = {
    port: 'PORT',
    host: 'HOST',
    adminPort: 'ADMIN_PORT',
    adminOrigin: 'ADMIN_ORIGIN',
    openAiApiKey: 'OPENAI_API_KEY',
    openAiModel: 'OPENAI_MODEL',
    databaseUrl: 'DATABASE_URL',
    databaseSsl: 'DATABASE_SSL',
    databasePoolMax: 'DATABASE_POOL_MAX',
    databaseConnectionTimeoutMs: 'DATABASE_CONNECTION_TIMEOUT_MS',
    databaseIdleTimeoutMs: 'DATABASE_IDLE_TIMEOUT_MS',
    databaseMigrateOnStart: 'DATABASE_MIGRATE_ON_START',
    langSmithTracing: 'LANGSMITH_TRACING',
    playwrightHeadless: 'PLAYWRIGHT_HEADLESS',
    logLevel: 'LOG_LEVEL',
} as const;
