import type {
    CreateLlmConfigInput,
    LlmConfigEntity,
    UpdateLlmConfigInput,
} from '../entities/llm-config.entity.js';
import { createLlmConfigRepository } from '../repositories/llm-config.repository.js';
import type { LlmConfigRepository } from '../repositories/llm-config.repository.js';
import { ConfigNotFoundError } from './errors.js';

export type ListConfigOptions = {
    enabledOnly?: boolean;
};

export type LlmConfigRepositoryPort = Pick<
    LlmConfigRepository,
    'create' | 'deleteById' | 'findById' | 'findByName' | 'list' | 'listEnabled' | 'update'
>;

export class LlmConfigService {
    constructor(
        private readonly llmConfigRepository: LlmConfigRepositoryPort = createLlmConfigRepository(),
    ) {}

    async list(options: ListConfigOptions = {}): Promise<LlmConfigEntity[]> {
        return options.enabledOnly
            ? this.llmConfigRepository.listEnabled()
            : this.llmConfigRepository.list();
    }

    async getById(id: string): Promise<LlmConfigEntity> {
        const config = await this.llmConfigRepository.findById(id);
        if (!config) {
            throw new ConfigNotFoundError('llm_config', id);
        }

        return config;
    }

    async getByName(name: string): Promise<LlmConfigEntity> {
        const config = await this.llmConfigRepository.findByName(name);
        if (!config) {
            throw new ConfigNotFoundError('llm_config', name);
        }

        return config;
    }

    async create(input: CreateLlmConfigInput): Promise<LlmConfigEntity> {
        return this.llmConfigRepository.create(input);
    }

    async update(id: string, input: UpdateLlmConfigInput): Promise<LlmConfigEntity> {
        const config = await this.llmConfigRepository.update(id, input);
        if (!config) {
            throw new ConfigNotFoundError('llm_config', id);
        }

        return config;
    }

    async delete(id: string): Promise<void> {
        const deleted = await this.llmConfigRepository.deleteById(id);
        if (!deleted) {
            throw new ConfigNotFoundError('llm_config', id);
        }
    }
}

export function createLlmConfigService(
    llmConfigRepository: LlmConfigRepositoryPort = createLlmConfigRepository(),
): LlmConfigService {
    return new LlmConfigService(llmConfigRepository);
}
