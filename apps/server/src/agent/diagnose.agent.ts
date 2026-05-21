import { LlmOpenAI } from '../llm/openai.llm.js';
import { browserDiagnose } from '../tools/diagnose-brower.tool.js';
import { createAgent, ReactAgent } from 'langchain';
import { env } from '../env.js';

let agent: ReactAgent;

const tools = [browserDiagnose];

export const diagnoseAgent = async (): Promise<ReactAgent> => {
    if (agent) return agent;

    const llm = await LlmOpenAI();

    agent = createAgent({
        model: env.OPENAI_MODEL,
        tools,
    });

    return agent;
};
