import { createAgentConfigRepository } from '../repositories/agent-config.repository.js';
import { createLlmConfigRepository } from '../repositories/llm-config.repository.js';
import { AgentConfigService } from './agent-config.service.js';
import { LlmConfigService } from './llm-config.service.js';

export type ConfigServices = {
    agentConfigs: AgentConfigService;
    llmConfigs: LlmConfigService;
};

export function createConfigServices(): ConfigServices {
    const llmConfigRepository = createLlmConfigRepository();
    const agentConfigRepository = createAgentConfigRepository();

    return {
        agentConfigs: new AgentConfigService({
            agentConfigRepository,
            llmConfigRepository,
        }),
        llmConfigs: new LlmConfigService(llmConfigRepository),
    };
}
