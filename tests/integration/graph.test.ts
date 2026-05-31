import { describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/server/src/llm/support.llm.ts', () => ({
    LlmSupportReasoning: async () => {
        throw new Error('mocked offline support model');
    },
    supportReasoningModelName: () => 'mock-support-model',
}));

import { invokeAgentGraph } from '../../apps/server/src/graph/graph.ts';

describe('agent graph', () => {
    it('delegates to the support orchestrator without requiring OpenAI credentials', async () => {
        const result = await invokeAgentGraph({ message: 'ping' });

        expect(result.issue).toBe('ping');
        expect(result.appKey).toBe('default-shopify-app');
        expect(result.steps.map((step) => step.graph)).toContain('hypothesisGraph');
        expect(result.missingContext).toContain(
            'storeUrl or storeDomain for browser/runtime verification',
        );
    });
});
