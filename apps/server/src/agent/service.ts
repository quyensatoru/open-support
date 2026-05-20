import { invokeAgentGraph } from '../graph/graph.js';
import type { AgentRun, AgentRunRequest } from '../http/contracts.js';
import { runStore } from '../runs/store.js';

async function execute(input: AgentRunRequest): Promise<AgentRun> {
    const queued = runStore.create(input);
    runStore.transition(queued.id, 'running');

    try {
        const output = await invokeAgentGraph(input);
        return runStore.transition(queued.id, 'completed', { output });
    } catch (error) {
        return runStore.transition(queued.id, 'failed', {
            error: error instanceof Error ? error.message : 'Unknown agent error',
        });
    }
}

export const runAgent = Object.assign(execute, {
    store: runStore,
});
