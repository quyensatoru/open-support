import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { createChatModel } from '../agent/model.js';
import type { AgentRunRequest } from '../http/contracts.js';
import { listSkills } from '../skills/registry.js';
import { listTools } from '../tools/registry.js';

type AgentGraphOutput = {
    message: string;
    model: string;
    toolCount: number;
    skillCount: number;
    echo: string;
};

const AgentState = Annotation.Root({
    input: Annotation<AgentRunRequest>(),
    output: Annotation<AgentGraphOutput | undefined>(),
});

async function agentNode(state: typeof AgentState.State) {
    const model = createChatModel();
    const tools = listTools().filter((tool) => tool.enabled);
    const skills = listSkills().filter((skill) => skill.enabled);

    return {
        output: {
            message: model
                ? 'Agent graph initialized with OpenAI adapter.'
                : 'Agent graph initialized without an OpenAI key; returning scaffold response.',
            model: model?.model ?? 'not-configured',
            toolCount: tools.length,
            skillCount: skills.length,
            echo: state.input.message,
        },
    };
}

const workflow = new StateGraph(AgentState)
    .addNode('agent', agentNode)
    .addEdge(START, 'agent')
    .addEdge('agent', END);

export const graph = workflow.compile();

export async function invokeAgentGraph(input: AgentRunRequest): Promise<AgentGraphOutput> {
    const result = await graph.invoke({ input });
    if (!result.output) {
        throw new Error('Agent graph returned no output');
    }
    return result.output;
}
