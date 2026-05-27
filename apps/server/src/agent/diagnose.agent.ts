import { LlmOpenAI } from '../llm/openai.llm.js';
import { browserTool } from '../tools/browser/index.js';
import { createAgent, ReactAgent } from 'langchain';
import { env } from '../env.js';

let agent: ReactAgent;

const tools = [browserTool];

export const diagnoseAgent = async (): Promise<ReactAgent> => {
    if (agent) return agent;

    await LlmOpenAI();

    agent = createAgent({
        model: env.OPENAI_MODEL,
        tools,
    });

    return agent;
};
