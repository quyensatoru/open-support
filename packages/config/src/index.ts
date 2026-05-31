import { z } from 'zod';

export const DEFAULT_AGENT_PORT = 7332;
export const DEFAULT_ADMIN_PORT = 7333;
export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-oss-120b:free';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro';
export const DEFAULT_POSTGRES_POOL_MAX = 10;
export const DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS = 5_000;
export const DEFAULT_POSTGRES_IDLE_TIMEOUT_MS = 30_000;
export const DEFAULT_WORKSPACE = 'workspace';

export const ENV_KEYS = {
    port: 'PORT',
    host: 'HOST',
    adminPort: 'ADMIN_PORT',
    adminOrigin: 'ADMIN_ORIGIN',
    openAiApiKey: 'OPENAI_API_KEY',
    openAiModel: 'OPENAI_MODEL',
    supportOpenAiModel: 'SUPPORT_OPENAI_MODEL',
    openRouterApiKey: 'OPENROUTER_API_KEY',
    openRouterModel: 'OPENROUTER_MODEL',
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

type EnvInput = Record<string, boolean | number | string | undefined>;

const numberFromEnv = (fallback: number) =>
    z.preprocess((value) => {
        if (value === undefined || value === '') return fallback;
        if (typeof value === 'number') return value;
        return Number(value);
    }, z.number().int().positive());

const booleanFromEnv = (fallback: boolean) =>
    z.preprocess((value) => {
        if (value === undefined || value === '') return fallback;
        if (typeof value === 'boolean') return value;
        return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
    }, z.boolean());

export const EnvSchema = z.object({
    PORT: numberFromEnv(DEFAULT_AGENT_PORT),
    HOST: z.string().default('127.0.0.1'),
    ADMIN_PORT: numberFromEnv(DEFAULT_ADMIN_PORT),
    ADMIN_ORIGIN: z.string().default(`http://localhost:${DEFAULT_ADMIN_PORT}`),
    OPENAI_API_KEY: z.string().default(''),
    OPENAI_MODEL: z.string().default(DEFAULT_OPENAI_MODEL),
    SUPPORT_OPENAI_MODEL: z.string().default(''),
    DATABASE_URL: z.string().default(''),
    DATABASE_SSL: booleanFromEnv(false),
    DATABASE_POOL_MAX: numberFromEnv(DEFAULT_POSTGRES_POOL_MAX),
    DATABASE_CONNECTION_TIMEOUT_MS: numberFromEnv(DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS),
    DATABASE_IDLE_TIMEOUT_MS: numberFromEnv(DEFAULT_POSTGRES_IDLE_TIMEOUT_MS),
    DATABASE_MIGRATE_ON_START: booleanFromEnv(false),
    LANGSMITH_TRACING: booleanFromEnv(false),
    PLAYWRIGHT_HEADLESS: booleanFromEnv(true),
    GITLAB_TOKEN: z.string().default(''),
    GITLAB_USERNAME: z.string().default(''),
    GITLAB_HOST: z.string().default(''),
    OPENROUTER_API_KEY: z.string().default(''),
    OPENROUTER_MODEL: z.string().default(DEFAULT_OPENROUTER_MODEL),
    DEEPSEEK_API_KEY: z.string().default(''),
    DEEPSEEK_MODEL: z.string().default(DEFAULT_DEEPSEEK_MODEL),
    WORKSPACE: z.string().default(DEFAULT_WORKSPACE),
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export type PostgresConfig = {
    url: string;
    ssl: boolean;
    poolMax: number;
    connectionTimeoutMs: number;
    idleTimeoutMs: number;
    migrateOnStart: boolean;
};

export function loadEnv(input: EnvInput): Env {
    return EnvSchema.parse(input);
}

export function getPostgresConfig(env: Env): PostgresConfig {
    return {
        url: env.DATABASE_URL.trim(),
        ssl: env.DATABASE_SSL,
        poolMax: env.DATABASE_POOL_MAX,
        connectionTimeoutMs: env.DATABASE_CONNECTION_TIMEOUT_MS,
        idleTimeoutMs: env.DATABASE_IDLE_TIMEOUT_MS,
        migrateOnStart: env.DATABASE_MIGRATE_ON_START,
    };
}
