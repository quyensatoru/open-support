import { createAgent, type ReactAgent } from 'langchain';

import { env } from '../env.js';
import { LlmOpenAI } from '../llm/openai.llm.js';
import { cloneRepos } from '../tools/code/clone.tool.js';
import { codeContext } from '../tools/code/context.tool.js';
import { codeGrep } from '../tools/code/grep.tool.js';
import { codeInsight } from '../tools/code/insight.tool.js';
import { codeThinking } from '../tools/code/thinking.tool.js';

let agent: ReactAgent;

const tools = [cloneRepos, codeThinking, codeGrep, codeContext, codeInsight];

export const codingAgent = async (): Promise<ReactAgent> => {
    if (agent) return agent;

    await LlmOpenAI();

    agent = createAgent({
        model: env.OPENAI_MODEL,
        tools,
    });

    return agent;
};
