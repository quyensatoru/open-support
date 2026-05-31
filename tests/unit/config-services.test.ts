import { describe, expect, it, vi } from 'vitest';

import {
    ConfigReferenceError,
    makeAppConfigSvc,
    makeWorkflowConfigSvc,
} from '../../apps/server/src/db/service/config.service.ts';
import { makeLlmSvc } from '../../apps/server/src/db/service/llm.service.ts';
import { makeMemorySvc } from '../../apps/server/src/db/service/runtime.service.ts';

describe('config services', () => {
    it('stores LLM secret references instead of requiring raw API keys', async () => {
        const repo = {
            upsert: vi.fn(async (data) => data),
            add: vi.fn(),
            list: vi.fn(),
            byId: vi.fn(),
            byKey: vi.fn(),
            find: vi.fn(),
            set: vi.fn(),
            del: vi.fn(),
        };
        const service = makeLlmSvc(repo as never);

        await service.save({
            key: 'openai',
            name: 'OpenAI',
            provider: 'openai',
            model: 'gpt-4.1-mini',
            apiKeyRef: 'env:OPENAI_API_KEY',
        });

        expect(repo.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                apiKey: 'env:OPENAI_API_KEY',
            }),
        );
    });

    it('cleans optional undefined fields before storing app configs', async () => {
        const repo = {
            add: vi.fn(async (data) => data),
            upsert: vi.fn(),
            list: vi.fn(),
            byId: vi.fn(),
            byKey: vi.fn(),
            set: vi.fn(),
            del: vi.fn(),
        };
        const service = makeAppConfigSvc(repo as never);

        await service.add({
            key: 'mida',
            name: 'MIDA',
            repos: [{ url: 'https://gitlab.example.com/mida/app.git' }],
            dbSources: [{ key: 'main', type: 'postgres' }],
        });

        expect(repo.add).toHaveBeenCalledWith(
            expect.objectContaining({
                repos: [{ url: 'https://gitlab.example.com/mida/app.git' }],
                dbSources: [{ key: 'main', type: 'postgres' }],
            }),
        );
    });

    it('rejects workflow configs that reference a missing default agent', async () => {
        const repo = {
            add: vi.fn(),
            upsert: vi.fn(),
            list: vi.fn(),
            byId: vi.fn(),
            byKey: vi.fn(),
            set: vi.fn(),
            del: vi.fn(),
        };
        const agents = {
            byId: vi.fn(async () => null),
        };
        const service = makeWorkflowConfigSvc(repo as never, agents as never);

        await expect(
            service.add({
                key: 'support-default',
                name: 'Support Default',
                entryGraph: 'supportGraph',
                defaultAgentId: '00000000-0000-4000-8000-000000000001',
            }),
        ).rejects.toBeInstanceOf(ConfigReferenceError);
        expect(repo.add).not.toHaveBeenCalled();
    });

    it('normalizes memory namespace and generated keys before storing memory', async () => {
        const repo = {
            add: vi.fn(),
            upsert: vi.fn(async (data) => data),
            list: vi.fn(),
            byId: vi.fn(),
            set: vi.fn(),
            del: vi.fn(),
        };
        const service = makeMemorySvc(repo as never);

        await service.save({
            namespace: ['support', 'mida'],
            content: 'Merchant prefers concise Vietnamese responses.',
        });

        expect(repo.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                namespace: 'support.mida',
                key: 'merchant-prefers-concise-vietnamese-responses',
                kind: 'fact',
                confidence: 'medium',
            }),
        );
    });
});
