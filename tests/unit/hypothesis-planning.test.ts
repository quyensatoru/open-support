import { describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/server/src/llm/support.llm.ts', () => ({
    LlmSupportReasoning: async () => {
        throw new Error('mocked offline hypothesis model');
    },
    supportReasoningModelName: () => 'mock-support-model',
}));

import {
    buildCandidateGraphCalls,
    classifyHypothesisCase,
    invokeHypothesisGraph,
    normalizeHypothesisInput,
} from '../../apps/server/src/graph/planning/hypothesis.graph.ts';
import type { HypothesisPlan } from '../../apps/server/src/graph/planning/hypothesis.type.ts';
import { hypothesisPlanningTool } from '../../apps/server/src/tools/planning/hypothesis.tool.ts';

describe('hypothesis planning', () => {
    it('normalizes and classifies an issue without running diagnosis graphs', () => {
        const input = {
            app: 'Generic Shopify App',
            issue: 'Merchant sees no data on the dashboard for example.myshopify.com',
        };
        const normalized = normalizeHypothesisInput(input);
        const caseType = classifyHypothesisCase(normalized.issue);
        const candidates = buildCandidateGraphCalls(input, normalized, caseType);

        expect(normalized.storeDomain).toBe('example.myshopify.com');
        expect(caseType).toBe('data_missing');
        expect(candidates.calls.map((call) => call.graph)).toEqual([
            'browserDiagnoseGraph',
            'codeGraph',
            'databaseGraph',
        ]);
    });

    it('fallback tool returns concise hypotheses with graph recommendations', async () => {
        const plan = (await hypothesisPlanningTool.invoke({
            app: 'Neutral Shopify App',
            issue: 'Merchant reports the embedded admin page is blank',
            caseType: 'embedded_admin_ui',
            knownFacts: [
                {
                    id: 'input.issue',
                    content: 'Merchant reports the embedded admin page is blank',
                },
            ],
            candidateGraphCalls: [
                {
                    graph: 'browserDiagnoseGraph',
                    priority: 'high',
                    reason: 'Check admin/runtime browser behavior.',
                    inputHints: { app: 'Neutral Shopify App', url: 'missing store URL/domain' },
                    expectedSignals: ['console errors'],
                },
                {
                    graph: 'codeGraph',
                    priority: 'high',
                    reason: 'Find implementation owner.',
                    inputHints: { app: 'Neutral Shopify App', issue: 'blank page' },
                    expectedSignals: ['owning files'],
                },
            ],
            missingContext: ['storeUrl or storeDomain for browser/runtime verification'],
            maxHypotheses: 3,
        })) as HypothesisPlan;

        expect(plan.hypotheses).toHaveLength(3);
        expect(plan.hypotheses[0]?.confidence).not.toBe('high');
        expect(plan.hypotheses.every((item) => item.recommendedGraphs.length > 0)).toBe(true);
        expect(JSON.stringify(plan).toLowerCase()).not.toContain('mida');
        expect(JSON.stringify(plan).toLowerCase()).not.toContain('heatmap');
    });

    it('graph can run offline and only produces graph call recommendations', async () => {
        const output = await invokeHypothesisGraph({
            app: 'Generic Shopify App',
            issue: 'Merchant reports the app is not working after installation',
            maxHypotheses: 4,
        });

        expect(output.plan.hypotheses.length).toBeGreaterThan(0);
        expect(output.plan.nextGraphCalls.map((call) => call.graph)).toContain('codeGraph');
        expect(output.plan.missingContext).toContain(
            'storeUrl or storeDomain for browser/runtime verification',
        );
        expect(output.errors).toEqual([]);
    });
});
