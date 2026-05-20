import dotenv from 'dotenv';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'test') {
    dotenv.config({ path: ['.env', '../../.env'], quiet: true });
}

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
    PORT: numberFromEnv(7332),
    HOST: z.string().default('127.0.0.1'),
    ADMIN_PORT: numberFromEnv(7333),
    ADMIN_ORIGIN: z.string().default('http://localhost:7333'),
    OPENAI_API_KEY: z.string().default(''),
    OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
    DATABASE_URL: z.string().default(''),
    DATABASE_SSL: booleanFromEnv(false),
    DATABASE_POOL_MAX: numberFromEnv(10),
    DATABASE_CONNECTION_TIMEOUT_MS: numberFromEnv(5_000),
    DATABASE_IDLE_TIMEOUT_MS: numberFromEnv(30_000),
    DATABASE_MIGRATE_ON_START: booleanFromEnv(false),
    LANGSMITH_TRACING: booleanFromEnv(false),
    PLAYWRIGHT_HEADLESS: booleanFromEnv(true),
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
    return EnvSchema.parse(input);
}

export const env = loadEnv();
