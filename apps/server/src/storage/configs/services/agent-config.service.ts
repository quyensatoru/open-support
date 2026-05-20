import {
    CreateAgentConfigSchema,
    UpdateAgentConfigSchema,
    type AgentConfigEntity,
    type CreateAgentConfigInput,
    type UpdateAgentConfigInput,
} from '../entities/agent-config.entity.js';
import { createAgentConfigRepository } from '../repositories/agent-config.repository.js';
import type { AgentConfigRepository } from '../repositories/agent-config.repository.js';
import { createLlmConfigRepository } from '../repositories/llm-config.repository.js';
import type { LlmConfigRepository } from '../repositories/llm-config.repository.js';
import { ConfigNotFoundError, ConfigReferenceError } from './errors.js';
import type { ListConfigOptions } from './llm-config.service.js';

export type AgentConfigRepositoryPort = Pick<
    AgentConfigRepository,
    'create' | 'deleteById' | 'findById' | 'findByName' | 'list' | 'listEnabled' | 'update'
>;

export type LlmConfigLookupPort = Pick<LlmConfigRepository, 'findById'>;

export type AgentConfigServiceDependencies = {
    agentConfigRepository?: AgentConfigRepositoryPort;
    llmConfigRepository?: LlmConfigLookupPort;
};

export class AgentConfigService {
    private readonly agentConfigRepository: AgentConfigRepositoryPort;
    private readonly llmConfigRepository: LlmConfigLookupPort;

    constructor(dependencies: AgentConfigServiceDependencies = {}) {
        this.agentConfigRepository =
            dependencies.agentConfigRepository ?? createAgentConfigRepository();
        this.llmConfigRepository = dependencies.llmConfigRepository ?? createLlmConfigRepository();
    }

    async list(options: ListConfigOptions = {}): Promise<AgentConfigEntity[]> {
        return options.enabledOnly
            ? this.agentConfigRepository.listEnabled()
            : this.agentConfigRepository.list();
    }

    async getById(id: string): Promise<AgentConfigEntity> {
        const config = await this.agentConfigRepository.findById(id);
        if (!config) {
            throw new ConfigNotFoundError('agent_config', id);
        }

        return config;
    }

    async getByName(name: string): Promise<AgentConfigEntity> {
        const config = await this.agentConfigRepository.findByName(name);
        if (!config) {
            throw new ConfigNotFoundError('agent_config', name);
        }

        return config;
    }

    async create(input: CreateAgentConfigInput): Promise<AgentConfigEntity> {
        const data = CreateAgentConfigSchema.parse(input);
        await this.assertLlmConfigExists(data.llmConfigId);
        return this.agentConfigRepository.create(data);
    }

    async update(id: string, input: UpdateAgentConfigInput): Promise<AgentConfigEntity> {
        const data = UpdateAgentConfigSchema.parse(input);
        await this.assertLlmConfigExists(data.llmConfigId);

        const config = await this.agentConfigRepository.update(id, data);
        if (!config) {
            throw new ConfigNotFoundError('agent_config', id);
        }

        return config;
    }

    async delete(id: string): Promise<void> {
        const deleted = await this.agentConfigRepository.deleteById(id);
        if (!deleted) {
            throw new ConfigNotFoundError('agent_config', id);
        }
    }

    private async assertLlmConfigExists(llmConfigId: string | null | undefined): Promise<void> {
        if (!llmConfigId) {
            return;
        }

        const llmConfig = await this.llmConfigRepository.findById(llmConfigId);
        if (!llmConfig) {
            throw new ConfigReferenceError(`llm_config not found: ${llmConfigId}`);
        }
    }
}

export function createAgentConfigService(
    dependencies: AgentConfigServiceDependencies = {},
): AgentConfigService {
    return new AgentConfigService(dependencies);
}
