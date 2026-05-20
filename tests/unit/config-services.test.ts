import { describe, expect, it, vi } from 'vitest';

import {
    AgentConfigService,
    ConfigNotFoundError,
    ConfigReferenceError,
    LlmConfigService,
    type AgentConfigRepositoryPort,
    type LlmConfigLookupPort,
    type LlmConfigRepositoryPort,
} from '../../apps/server/src/storage/configs/services/index.ts';
import type {
    AgentConfigEntity,
    LlmConfigEntity,
} from '../../apps/server/src/storage/configs/entities/index.ts';

const llmConfigId = '00000000-0000-4000-8000-000000000001';
const agentConfigId = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-01-01T00:00:00.000Z');

const llmConfig: LlmConfigEntity = {
    id: llmConfigId,
    name: 'default-openai',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    apiKeySecretRef: null,
    baseUrl: null,
    temperature: null,
    maxTokens: null,
    enabled: true,
    metadata: {},
    createdAt: now,
    updatedAt: now,
};

const agentConfig: AgentConfigEntity = {
    id: agentConfigId,
    name: 'default-agent',
    description: null,
    llmConfigId,
    systemPrompt: '',
    toolIds: [],
    skillIds: [],
    enabled: true,
    metadata: {},
    createdAt: now,
    updatedAt: now,
};

function createLlmRepositoryMock(
    overrides: Partial<LlmConfigRepositoryPort> = {},
): LlmConfigRepositoryPort {
    return {
        create: vi.fn(async () => llmConfig),
        deleteById: vi.fn(async () => true),
        findById: vi.fn(async () => llmConfig),
        findByName: vi.fn(async () => llmConfig),
        list: vi.fn(async () => [llmConfig]),
        listEnabled: vi.fn(async () => [llmConfig]),
        update: vi.fn(async () => llmConfig),
        ...overrides,
    };
}

function createAgentRepositoryMock(
    overrides: Partial<AgentConfigRepositoryPort> = {},
): AgentConfigRepositoryPort {
    return {
        create: vi.fn(async () => agentConfig),
        deleteById: vi.fn(async () => true),
        findById: vi.fn(async () => agentConfig),
        findByName: vi.fn(async () => agentConfig),
        list: vi.fn(async () => [agentConfig]),
        listEnabled: vi.fn(async () => [agentConfig]),
        update: vi.fn(async () => agentConfig),
        ...overrides,
    };
}

describe('config services', () => {
    it('lists enabled LLM configs through the enabled repository query', async () => {
        const repository = createLlmRepositoryMock();
        const service = new LlmConfigService(repository);

        const configs = await service.list({ enabledOnly: true });

        expect(configs).toEqual([llmConfig]);
        expect(repository.listEnabled).toHaveBeenCalledOnce();
        expect(repository.list).not.toHaveBeenCalled();
    });

    it('throws a domain not-found error when an LLM config update misses', async () => {
        const repository = createLlmRepositoryMock({
            update: vi.fn(async () => null),
        });
        const service = new LlmConfigService(repository);

        await expect(service.update(llmConfigId, { model: 'gpt-4.1' })).rejects.toBeInstanceOf(
            ConfigNotFoundError,
        );
    });

    it('validates referenced LLM config before creating an agent config', async () => {
        const agentRepository = createAgentRepositoryMock();
        const llmRepository: LlmConfigLookupPort = {
            findById: vi.fn(async () => llmConfig),
        };
        const service = new AgentConfigService({
            agentConfigRepository: agentRepository,
            llmConfigRepository: llmRepository,
        });

        await service.create({ name: 'default-agent', llmConfigId });

        expect(llmRepository.findById).toHaveBeenCalledWith(llmConfigId);
        expect(agentRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                llmConfigId,
                name: 'default-agent',
            }),
        );
    });

    it('rejects an agent config with a missing LLM config reference', async () => {
        const agentRepository = createAgentRepositoryMock();
        const llmRepository: LlmConfigLookupPort = {
            findById: vi.fn(async () => null),
        };
        const service = new AgentConfigService({
            agentConfigRepository: agentRepository,
            llmConfigRepository: llmRepository,
        });

        await expect(service.update(agentConfigId, { llmConfigId })).rejects.toBeInstanceOf(
            ConfigReferenceError,
        );
        expect(agentRepository.update).not.toHaveBeenCalled();
    });
});
