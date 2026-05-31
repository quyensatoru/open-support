import { describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/server/src/llm/support.llm.ts', () => ({
    LlmSupportReasoning: async () => {
        throw new Error('mocked offline support model');
    },
    supportReasoningModelName: () => 'mock-support-model',
}));

import {
    classifySupportCase,
    invokeSupportGraph,
    normalizeSupportInput,
    routeSupportEvidence,
} from '../../apps/server/src/graph/planning/support.graph.ts';
import type { SupportAppProfile, SupportPlan } from '../../apps/server/src/graph/planning/support.type.ts';
import { supportPlanningTool } from '../../apps/server/src/tools/planning/support.tool.ts';

const unknownProfile: SupportAppProfile = {
    primaryCapability: 'unknown',
    capabilities: ['unknown'],
    rationale: 'Test profile is intentionally unknown.',
    evidenceRefs: [],
};

describe('support planning', () => {
    it('routes app-only issues without triggering browser, code, or database collectors', () => {
        const input = {
            app: 'Generic Shopify App',
            issue: 'Merchant says the embedded admin screen is blank after opening the app',
        };
        const normalized = normalizeSupportInput(input);
        const caseType = classifySupportCase(normalized.issue);
        const route = routeSupportEvidence(input, normalized, caseType);

        expect(caseType).toBe('embedded_admin_ui');
        expect(route.useBrowser).toBe(false);
        expect(route.useCode).toBe(false);
        expect(route.useDatabase).toBe(false);
        expect(route.useShopifyDocs).toBe(true);
        expect(route.missingInputs).toContain('storeUrl or storeDomain for browser reproduction');
    });

    it('fallback plan stays generic and asks for store context when no store is provided', async () => {
        const plan = (await supportPlanningTool.invoke({
            app: 'Neutral Shopify App',
            issue: 'Customer reports the app is not working after installation',
            caseType: 'installation_activation',
            appProfile: unknownProfile,
            evidence: [
                {
                    id: 'input.issue',
                    source: 'input',
                    title: 'Support issue input',
                    content: 'Customer reports the app is not working after installation',
                    refs: [],
                },
            ],
            missingInputs: ['storeUrl or storeDomain for browser reproduction'],
            errors: [],
        })) as SupportPlan;

        const planText = JSON.stringify(plan).toLowerCase();
        expect(planText).not.toContain('mida');
        expect(planText).not.toContain('heatmap');
        expect(planText).not.toContain('replay');
        expect(plan.confidence).toBe('low');
        expect(
            plan.steps.some((step) =>
                `${step.title} ${step.action}`.toLowerCase().includes('store url'),
            ),
        ).toBe(true);
    });

    it('support graph returns a low-confidence evidence plan without optional inputs', async () => {
        const output = await invokeSupportGraph({
            app: 'Generic Shopify App',
            issue: 'Merchant says the embedded admin screen is blank after opening the app',
        });

        expect(output.plan.confidence).toBe('low');
        expect(output.evidence.map((item) => item.source)).toContain('shopify_docs');
        expect(output.evidence.map((item) => item.source)).not.toContain('browser');
        expect(output.evidence.map((item) => item.source)).not.toContain('code');
        expect(output.evidence.map((item) => item.source)).not.toContain('database');
        expect(output.plan.unknowns).toContain('storeUrl or storeDomain for browser reproduction');
    });
});
