import { agentSvc } from './agent.service.js';
import { llmSvc } from './llm.service.js';

export const makeCfgSvc = (llms = llmSvc, agents = agentSvc) => ({
    llms,
    agents,

    seedBase: async () => {
        const llm = await llms.seedEnv();
        const agent = await agents.seedDefault(llm.key);
        return { llm, agent };
    },
});

export const cfgSvc = makeCfgSvc(llmSvc, agentSvc);
