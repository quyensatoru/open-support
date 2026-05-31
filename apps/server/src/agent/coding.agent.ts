import { createAgent, type ReactAgent } from 'langchain';

import { env } from '../env.js';
import { LlmOpenAI } from '../llm/openai.llm.js';
import { cloneRepos } from '../tools/app/codebase/clone.tool.js';
import { codeContext } from '../tools/app/codebase/context.tool.js';
import { codeGrep } from '../tools/app/codebase/grep.tool.js';
import { codeInsight } from '../tools/app/codebase/insight.tool.js';
import { codeThinking } from '../tools/app/codebase/thinking.tool.js';

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
