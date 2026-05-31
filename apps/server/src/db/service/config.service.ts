import { z } from 'zod';

import { listSkills } from '../../skills/registry.js';
import { listTools } from '../../tools/registry.js';
import {
    makeAgentRepo,
    makeAppConfigRepo,
    makeSkillConfigRepo,
    makeToolConfigRepo,
    makeWorkflowConfigRepo,
    type AppConfigPatch,
    type SkillConfigPatch,
    type ToolConfigPatch,
    type WorkflowConfigPatch,
} from '../repo/index.js';
import type {
    NewAppConfig,
    NewSkillConfig,
    NewToolConfig,
    NewWorkflowConfig,
} from '../schema/index.js';

const JsonMapSchema = z.record(z.string(), z.unknown());

export class ConfigNotFoundError extends Error {
    constructor(resource: string, id: string) {
        super(`${resource} not found: ${id}`);
        this.name = 'ConfigNotFoundError';
    }
}

export class ConfigReferenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigReferenceError';
    }
}

const RepoConfigSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    url: z.string().trim().min(1),
    branch: z.string().trim().min(1).max(120).optional(),
});

const DbSourceConfigSchema = z.object({
    key: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(40),
    secretRef: z.string().trim().min(1).max(240).optional(),
    config: JsonMapSchema.optional(),
});

export const AppConfigInputSchema = z.object({
    key: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    shopifyAppHandle: z.string().trim().min(1).max(120).nullable().optional(),
    defaultStoreUrl: z.string().trim().min(1).nullable().optional(),
    repos: z.array(RepoConfigSchema).default([]),
    dbSources: z.array(DbSourceConfigSchema).default([]),
    metadata: JsonMapSchema.default({}),
    enabled: z.boolean().default(true),
});

export const WorkflowConfigInputSchema = z.object({
    key: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    entryGraph: z.string().trim().min(1).max(120),
    graphOrder: z.array(z.string().trim().min(1).max(120)).default([]),
    routingPolicy: z.string().trim().min(1).max(64).default('evidence-driven'),
    defaultAgentId: z.string().uuid().nullable().optional(),
    opts: JsonMapSchema.default({}),
    enabled: z.boolean().default(true),
});

export const ToolConfigInputSchema = z.object({
    key: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    source: z.string().trim().min(1).max(64),
    description: z.string().default(''),
    config: JsonMapSchema.default({}),
    enabled: z.boolean().default(true),
});

export const SkillConfigInputSchema = z.object({
    key: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    description: z.string().default(''),
    instructions: z.string().default(''),
    toolKeys: z.array(z.string().trim().min(1).max(120)).default([]),
    config: JsonMapSchema.default({}),
    enabled: z.boolean().default(true),
});

export type AppConfigInput = z.input<typeof AppConfigInputSchema>;
export type WorkflowConfigInput = z.input<typeof WorkflowConfigInputSchema>;
export type ToolConfigInput = z.input<typeof ToolConfigInputSchema>;
export type SkillConfigInput = z.input<typeof SkillConfigInputSchema>;

function cleanApp(input: AppConfigInput): NewAppConfig {
    const data = AppConfigInputSchema.parse(input);
    return {
        key: data.key,
        name: data.name,
        shopifyAppHandle: data.shopifyAppHandle ?? null,
        defaultStoreUrl: data.defaultStoreUrl ?? null,
        repos: data.repos.map((repo) => ({
            url: repo.url,
            ...(repo.name ? { name: repo.name } : {}),
            ...(repo.branch ? { branch: repo.branch } : {}),
        })),
        dbSources: data.dbSources.map((source) => ({
            key: source.key,
            type: source.type,
            ...(source.secretRef ? { secretRef: source.secretRef } : {}),
            ...(source.config ? { config: source.config } : {}),
        })),
        metadata: data.metadata,
        enabled: data.enabled,
    };
}

function cleanWorkflow(input: WorkflowConfigInput): NewWorkflowConfig {
    const data = WorkflowConfigInputSchema.parse(input);
    return {
        key: data.key,
        name: data.name,
        entryGraph: data.entryGraph,
        graphOrder: data.graphOrder,
        routingPolicy: data.routingPolicy,
        defaultAgentId: data.defaultAgentId ?? null,
        opts: data.opts,
        enabled: data.enabled,
    };
}

function cleanTool(input: ToolConfigInput): NewToolConfig {
    return ToolConfigInputSchema.parse(input);
}

function cleanSkill(input: SkillConfigInput): NewSkillConfig {
    return SkillConfigInputSchema.parse(input);
}

async function ensureAgentReference(
    agents: ReturnType<typeof makeAgentRepo>,
    defaultAgentId: string | null | undefined,
): Promise<void> {
    if (!defaultAgentId) return;
    const agent = await agents.byId(defaultAgentId);
    if (!agent) {
        throw new ConfigReferenceError(`Agent not found: ${defaultAgentId}`);
    }
}

export const makeAppConfigSvc = (repo = makeAppConfigRepo()) => ({
    add: (input: AppConfigInput) => repo.add(cleanApp(input)),
    save: (input: AppConfigInput) => repo.upsert(cleanApp(input)),
    list: repo.list,
    byId: repo.byId,
    byKey: repo.byKey,
    set: (id: string, patch: AppConfigPatch) =>
        repo.set(id, { ...patch, updatedAt: new Date() } as AppConfigPatch),
    del: repo.del,
});

export const makeWorkflowConfigSvc = (
    repo = makeWorkflowConfigRepo(),
    agents = makeAgentRepo(),
) => ({
    add: async (input: WorkflowConfigInput) => {
        const data = cleanWorkflow(input);
        await ensureAgentReference(agents, data.defaultAgentId);
        return repo.add(data);
    },
    save: async (input: WorkflowConfigInput) => {
        const data = cleanWorkflow(input);
        await ensureAgentReference(agents, data.defaultAgentId);
        return repo.upsert(data);
    },
    list: repo.list,
    byId: repo.byId,
    byKey: repo.byKey,
    set: async (id: string, patch: WorkflowConfigPatch) => {
        await ensureAgentReference(agents, patch.defaultAgentId);
        return repo.set(id, { ...patch, updatedAt: new Date() } as WorkflowConfigPatch);
    },
    del: repo.del,
});

export const makeToolConfigSvc = (repo = makeToolConfigRepo()) => ({
    add: (input: ToolConfigInput) => repo.add(cleanTool(input)),
    save: (input: ToolConfigInput) => repo.upsert(cleanTool(input)),
    list: repo.list,
    byId: repo.byId,
    byKey: repo.byKey,
    set: (id: string, patch: ToolConfigPatch) =>
        repo.set(id, { ...patch, updatedAt: new Date() } as ToolConfigPatch),
    del: repo.del,
});

export const makeSkillConfigSvc = (repo = makeSkillConfigRepo()) => ({
    add: (input: SkillConfigInput) => repo.add(cleanSkill(input)),
    save: (input: SkillConfigInput) => repo.upsert(cleanSkill(input)),
    list: repo.list,
    byId: repo.byId,
    byKey: repo.byKey,
    set: (id: string, patch: SkillConfigPatch) =>
        repo.set(id, { ...patch, updatedAt: new Date() } as SkillConfigPatch),
    del: repo.del,
});

export const appConfigSvc = makeAppConfigSvc();
export const workflowConfigSvc = makeWorkflowConfigSvc();
export const toolConfigSvc = makeToolConfigSvc();
export const skillConfigSvc = makeSkillConfigSvc();

export async function seedConfigDefaults(input: { defaultAgentId?: string | null }): Promise<void> {
    await workflowConfigSvc.save({
        key: 'support-default',
        name: 'Default Support Workflow',
        entryGraph: 'supportGraph',
        graphOrder: ['hypothesisGraph', 'browserDiagnoseGraph', 'codeGraph', 'databaseGraph'],
        routingPolicy: 'evidence-driven',
        defaultAgentId: input.defaultAgentId ?? null,
        enabled: true,
    });

    await appConfigSvc.save({
        key: 'default-shopify-app',
        name: 'Default Shopify App',
        repos: [],
        dbSources: [],
        metadata: {},
        enabled: true,
    });

    await Promise.all(
        listTools().map((tool) =>
            toolConfigSvc.save({
                key: tool.id,
                name: tool.name,
                source: tool.source,
                description: tool.description,
                enabled: tool.enabled,
            }),
        ),
    );

    await Promise.all(
        listSkills().map((skill) =>
            skillConfigSvc.save({
                key: skill.id,
                name: skill.name,
                description: skill.description,
                instructions: skill.instructions,
                toolKeys: skill.toolIds,
                enabled: skill.enabled,
            }),
        ),
    );
}
