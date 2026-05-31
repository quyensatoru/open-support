import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../apps/server/src/env.ts';

describe('env', () => {
    it('loads defaults without requiring secrets', () => {
        const env = loadEnv({});

        expect(env.PORT).toBe(7332);
        expect(env.HOST).toBe('127.0.0.1');
        expect(env.ADMIN_PORT).toBe(7333);
        expect(env.OPENAI_API_KEY).toBe('');
        expect(env.OPENAI_MODEL).toBe('gpt-4.1-mini');
        expect(env.SUPPORT_OPENAI_MODEL).toBe('');
        expect(env.DATABASE_URL).toBe('');
        expect(env.DATABASE_SSL).toBe(false);
        expect(env.DATABASE_POOL_MAX).toBe(10);
        expect(env.DATABASE_CONNECTION_TIMEOUT_MS).toBe(5000);
        expect(env.DATABASE_IDLE_TIMEOUT_MS).toBe(30000);
        expect(env.DATABASE_MIGRATE_ON_START).toBe(false);
        expect(env.LANGSMITH_TRACING).toBe(false);
        expect(env.PLAYWRIGHT_HEADLESS).toBe(true);
    });

    it('parses boolean and numeric env values', () => {
        const env = loadEnv({
            PORT: '7444',
            ADMIN_PORT: '7445',
            DATABASE_SSL: 'true',
            DATABASE_POOL_MAX: '20',
            DATABASE_CONNECTION_TIMEOUT_MS: '3000',
            DATABASE_IDLE_TIMEOUT_MS: '45000',
            DATABASE_MIGRATE_ON_START: 'true',
            LANGSMITH_TRACING: 'true',
            PLAYWRIGHT_HEADLESS: 'false',
        });

        expect(env.PORT).toBe(7444);
        expect(env.ADMIN_PORT).toBe(7445);
        expect(env.DATABASE_SSL).toBe(true);
        expect(env.DATABASE_POOL_MAX).toBe(20);
        expect(env.DATABASE_CONNECTION_TIMEOUT_MS).toBe(3000);
        expect(env.DATABASE_IDLE_TIMEOUT_MS).toBe(45000);
        expect(env.DATABASE_MIGRATE_ON_START).toBe(true);
        expect(env.LANGSMITH_TRACING).toBe(true);
        expect(env.PLAYWRIGHT_HEADLESS).toBe(false);
    });
});
