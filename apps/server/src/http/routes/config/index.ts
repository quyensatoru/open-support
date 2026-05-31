import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
    agentSvc,
    AgentInputSchema,
    appConfigSvc,
    AppConfigInputSchema,
    llmSvc,
    LlmInputSchema,
    skillConfigSvc,
    SkillConfigInputSchema,
    toolConfigSvc,
    ToolConfigInputSchema,
    workflowConfigSvc,
    WorkflowConfigInputSchema,
} from '../../../db/service/index.js';
import type { AgentPatch, LlmPatch } from '../../../db/repo/index.js';
import type {
    AppConfig,
    Llm,
    SkillConfig,
    ToolConfig,
    WorkflowConfig,
} from '../../../db/schema/index.js';
import {
    assertDbAvailable,
    handleConfigError,
    nonEmptyPatch,
    parseEnabledQuery,
    parseIdParams,
    sendMaybeFound,
} from './common.js';

const JsonMapSchema = z.record(z.string(), z.unknown());

const NullableStringSchema = z.string().trim().min(1).nullable();

const LlmPatchSchema = nonEmptyPatch(
    z.object({
        key: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(120),
        provider: z.string().trim().min(1).max(40),
        model: z.string().trim().min(1).max(120),
        baseUrl: z.string().trim().url().nullable(),
        apiKeyRef: z.string().trim().min(1).max(240).nullable(),
        temp: z.number().min(0).max(2),
        topP: z.number().min(0).max(1).nullable(),
        maxTokens: z.number().int().positive().nullable(),
        opts: JsonMapSchema,
        enabled: z.boolean(),
    }),
);

const AgentPatchSchema = nonEmptyPatch(
    z.object({
        key: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(120),
        desc: NullableStringSchema,
        llmId: z.string().uuid().nullable(),
        prompt: z.string(),
        tools: z.array(z.string().trim().min(1)),
        skills: z.array(z.string().trim().min(1)),
        opts: JsonMapSchema,
        enabled: z.boolean(),
        isDefault: z.boolean(),
    }),
);

const AppConfigPatchSchema = nonEmptyPatch(AppConfigInputSchema.omit({ key: true }));
const WorkflowConfigPatchSchema = nonEmptyPatch(WorkflowConfigInputSchema.omit({ key: true }));
const ToolConfigPatchSchema = nonEmptyPatch(ToolConfigInputSchema.omit({ key: true }));
const SkillConfigPatchSchema = nonEmptyPatch(SkillConfigInputSchema.omit({ key: true }));

function redactedSecretRef(value: string | null): string | null {
    if (!value) return null;
    if (/^(env|secret):/i.test(value)) return value;
    return 'redacted';
}

function isSensitiveKey(key: string): boolean {
    return /(api[_-]?key|token|secret|password|dsn|uri|url)$/i.test(key);
}

function redactConfigValue(value: unknown, key = ''): unknown {
    if (isSensitiveKey(key) && typeof value === 'string') return 'redacted';
    if (Array.isArray(value)) return value.map((item) => redactConfigValue(item));
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
            entryKey,
            redactConfigValue(entryValue, entryKey),
        ]),
    );
}

function compactPatch<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function llmView(row: Llm) {
    const { apiKey: apiKeyRef, ...rest } = row;
    return {
        ...rest,
        apiKeyRef: redactedSecretRef(apiKeyRef),
        apiKeyConfigured: Boolean(apiKeyRef),
    };
}

function appConfigView(row: AppConfig) {
    return {
        ...row,
        dbSources: row.dbSources.map((source) => ({
            key: source.key,
            type: source.type,
            ...(source.secretRef ? { secretRef: redactedSecretRef(source.secretRef) } : {}),
            ...(source.config ? { config: redactConfigValue(source.config) } : {}),
        })),
        metadata: redactConfigValue(row.metadata),
    };
}

function workflowConfigView(row: WorkflowConfig) {
    return {
        ...row,
        opts: redactConfigValue(row.opts),
    };
}

function toolConfigView(row: ToolConfig) {
    return {
        ...row,
        config: redactConfigValue(row.config),
    };
}

function skillConfigView(row: SkillConfig) {
    return {
        ...row,
        config: redactConfigValue(row.config),
    };
}

function llmPatch(input: z.infer<typeof LlmPatchSchema>): LlmPatch {
    const { apiKeyRef, baseUrl, topP, maxTokens, ...rest } = input;
    return compactPatch({
        ...rest,
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(apiKeyRef !== undefined ? { apiKey: apiKeyRef } : {}),
        ...(topP !== undefined ? { topP } : {}),
        ...(maxTokens !== undefined ? { maxTokens } : {}),
    }) as LlmPatch;
}

async function created<T>(reply: FastifyReply, result: Promise<T>, map?: (value: T) => unknown) {
    const value = await result;
    return reply.code(201).send(map ? map(value) : value);
}

export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
    app.get('/v1/config/llms', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const enabled = parseEnabledQuery(request.query);
        return (await llmSvc.list(enabled)).map(llmView);
    });

    app.post('/v1/config/llms', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            const input = LlmInputSchema.parse(request.body);
            return await created(reply, llmSvc.add(input), llmView);
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.get('/v1/config/llms/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return sendMaybeFound(reply, llmSvc.byId(parseIdParams(request.params)), llmView);
    });

    app.patch('/v1/config/llms/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            const id = parseIdParams(request.params);
            const patch = llmPatch(LlmPatchSchema.parse(request.body));
            return sendMaybeFound(reply, llmSvc.set(id, patch), llmView);
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.delete('/v1/config/llms/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const deleted = await llmSvc.del(parseIdParams(request.params));
        if (!deleted) return reply.code(404).send({ error: 'Config not found', statusCode: 404 });
        return { deleted };
    });

    app.get('/v1/config/agents', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return agentSvc.list(parseEnabledQuery(request.query));
    });

    app.post('/v1/config/agents', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            return await created(reply, agentSvc.add(AgentInputSchema.parse(request.body)));
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.get('/v1/config/agents/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return sendMaybeFound(reply, agentSvc.byId(parseIdParams(request.params)));
    });

    app.patch('/v1/config/agents/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            const id = parseIdParams(request.params);
            const patch = compactPatch(AgentPatchSchema.parse(request.body)) as AgentPatch;
            return sendMaybeFound(reply, agentSvc.set(id, patch));
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.delete('/v1/config/agents/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const deleted = await agentSvc.del(parseIdParams(request.params));
        if (!deleted) return reply.code(404).send({ error: 'Config not found', statusCode: 404 });
        return { deleted };
    });

    app.get('/v1/config/apps', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return (await appConfigSvc.list(parseEnabledQuery(request.query))).map(appConfigView);
    });

    app.post('/v1/config/apps', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            return await created(
                reply,
                appConfigSvc.add(AppConfigInputSchema.parse(request.body)),
                appConfigView,
            );
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.get('/v1/config/apps/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return sendMaybeFound(
            reply,
            appConfigSvc.byId(parseIdParams(request.params)),
            appConfigView,
        );
    });

    app.patch('/v1/config/apps/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            const id = parseIdParams(request.params);
            return sendMaybeFound(
                reply,
                appConfigSvc.set(id, compactPatch(AppConfigPatchSchema.parse(request.body))),
                appConfigView,
            );
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.delete('/v1/config/apps/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const deleted = await appConfigSvc.del(parseIdParams(request.params));
        if (!deleted) return reply.code(404).send({ error: 'Config not found', statusCode: 404 });
        return { deleted };
    });

    app.get('/v1/config/workflows', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return (await workflowConfigSvc.list(parseEnabledQuery(request.query))).map(
            workflowConfigView,
        );
    });

    app.post('/v1/config/workflows', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            return await created(
                reply,
                workflowConfigSvc.add(WorkflowConfigInputSchema.parse(request.body)),
                workflowConfigView,
            );
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.get('/v1/config/workflows/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return sendMaybeFound(
            reply,
            workflowConfigSvc.byId(parseIdParams(request.params)),
            workflowConfigView,
        );
    });

    app.patch('/v1/config/workflows/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            const id = parseIdParams(request.params);
            return sendMaybeFound(
                reply,
                workflowConfigSvc.set(
                    id,
                    compactPatch(WorkflowConfigPatchSchema.parse(request.body)),
                ),
                workflowConfigView,
            );
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.delete('/v1/config/workflows/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const deleted = await workflowConfigSvc.del(parseIdParams(request.params));
        if (!deleted) return reply.code(404).send({ error: 'Config not found', statusCode: 404 });
        return { deleted };
    });

    app.get('/v1/config/tools', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return (await toolConfigSvc.list(parseEnabledQuery(request.query))).map(toolConfigView);
    });

    app.post('/v1/config/tools', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            return await created(
                reply,
                toolConfigSvc.add(ToolConfigInputSchema.parse(request.body)),
                toolConfigView,
            );
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.get('/v1/config/tools/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return sendMaybeFound(
            reply,
            toolConfigSvc.byId(parseIdParams(request.params)),
            toolConfigView,
        );
    });

    app.patch('/v1/config/tools/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            const id = parseIdParams(request.params);
            return sendMaybeFound(
                reply,
                toolConfigSvc.set(id, compactPatch(ToolConfigPatchSchema.parse(request.body))),
                toolConfigView,
            );
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.delete('/v1/config/tools/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const deleted = await toolConfigSvc.del(parseIdParams(request.params));
        if (!deleted) return reply.code(404).send({ error: 'Config not found', statusCode: 404 });
        return { deleted };
    });

    app.get('/v1/config/skills', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return (await skillConfigSvc.list(parseEnabledQuery(request.query))).map(skillConfigView);
    });

    app.post('/v1/config/skills', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            return await created(
                reply,
                skillConfigSvc.add(SkillConfigInputSchema.parse(request.body)),
                skillConfigView,
            );
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.get('/v1/config/skills/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return sendMaybeFound(
            reply,
            skillConfigSvc.byId(parseIdParams(request.params)),
            skillConfigView,
        );
    });

    app.patch('/v1/config/skills/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        try {
            const id = parseIdParams(request.params);
            return sendMaybeFound(
                reply,
                skillConfigSvc.set(id, compactPatch(SkillConfigPatchSchema.parse(request.body))),
                skillConfigView,
            );
        } catch (error) {
            handleConfigError(error, reply);
        }
    });

    app.delete('/v1/config/skills/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const deleted = await skillConfigSvc.del(parseIdParams(request.params));
        if (!deleted) return reply.code(404).send({ error: 'Config not found', statusCode: 404 });
        return { deleted };
    });
}
