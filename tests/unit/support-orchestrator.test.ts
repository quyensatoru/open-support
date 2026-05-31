import { describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/server/src/llm/support.llm.ts', () => ({
    LlmSupportReasoning: async () => {
        throw new Error('mocked offline support model');
    },
    supportReasoningModelName: () => 'mock-support-model',
}));

import { invokeSupportGraph } from '../../apps/server/src/graph/support/support.graph.ts';

describe('support orchestrator graph', () => {
    it('chains hypothesis planning and skips executor graphs when config is missing', async () => {
        const output = await invokeSupportGraph({
            app: 'Generic Shopify App',
            appKey: 'generic',
            issue: 'Merchant reports no data in the embedded dashboard',
            memories: [
                {
                    namespace: 'support.generic',
                    key: 'known.surface',
                    kind: 'context',
                    content: 'The issue is usually reported from the embedded admin surface.',
                    confidence: 'medium',
                    value: {},
                },
            ],
        });

        expect(output.status).toBe('partial');
        expect(output.memoriesUsed).toHaveLength(1);
        expect(output.steps[0]?.graph).toBe('hypothesisGraph');
        expect(output.steps.map((step) => step.status)).toContain('skipped');
        expect(output.missingContext).toContain('Missing repo config or repo name hint for code diagnosis.');
    });
});
