import { describe, expect, it } from 'vitest';

import {
    AppConfigInputSchema,
    SkillConfigInputSchema,
    ToolConfigInputSchema,
    WorkflowConfigInputSchema,
} from '../../apps/server/src/db/service/config.service.ts';
import {
    MemoryInputSchema,
    normalizeMemoryNamespace,
    SupportRunInputSchema,
} from '../../apps/server/src/db/service/runtime.service.ts';

describe('config input schemas', () => {
    it('normalizes app config defaults', () => {
        const parsed = AppConfigInputSchema.parse({
            key: 'mida',
            name: 'MIDA',
        });

        expect(parsed.repos).toEqual([]);
        expect(parsed.dbSources).toEqual([]);
        expect(parsed.metadata).toEqual({});
        expect(parsed.enabled).toBe(true);
    });

    it('normalizes workflow config defaults', () => {
        const parsed = WorkflowConfigInputSchema.parse({
            key: 'support-default',
            name: 'Support Default',
            entryGraph: 'supportGraph',
        });

        expect(parsed.graphOrder).toEqual([]);
        expect(parsed.routingPolicy).toBe('evidence-driven');
        expect(parsed.opts).toEqual({});
        expect(parsed.enabled).toBe(true);
    });

    it('normalizes tool and skill config defaults', () => {
        expect(
            ToolConfigInputSchema.parse({
                key: 'code.grep',
                name: 'Code grep',
                source: 'local',
            }),
        ).toMatchObject({
            config: {},
            description: '',
            enabled: true,
        });

        expect(
            SkillConfigInputSchema.parse({
                key: 'agent.operator',
                name: 'Agent operator',
            }),
        ).toMatchObject({
            config: {},
            description: '',
            instructions: '',
            toolKeys: [],
            enabled: true,
        });
    });

    it('normalizes support run and memory defaults', () => {
        const run = SupportRunInputSchema.parse({
            issue: 'Merchant reports the app is blank',
        });
        const memory = MemoryInputSchema.parse({
            namespace: ['support', 'mida'],
            content: 'Merchant prefers concise Vietnamese responses.',
        });

        expect(run.appKey).toBe('default-shopify-app');
        expect(run.workflowKey).toBe('support-default');
        expect(run.mode).toBe('diagnose');
        expect(run.repoNames).toEqual([]);
        expect(memory.kind).toBe('fact');
        expect(memory.confidence).toBe('medium');
        expect(normalizeMemoryNamespace(memory.namespace)).toBe('support.mida');
    });
});
