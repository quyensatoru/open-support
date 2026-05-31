import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
    memorySvc,
    MemoryInputSchema,
    MemoryListQuerySchema,
    MemoryPatchSchema,
    supportRuntimeSvc,
    SupportRunInputSchema,
    SupportRunListQuerySchema,
} from '../../db/service/index.js';
import { ConfigReferenceError } from '../../db/service/config.service.js';
import {
    assertDbAvailable,
    isUniqueViolation,
    parseIdParams,
} from './config/common.js';

function handleRuntimeError(error: unknown, reply: FastifyReply): void {
    if (error instanceof ConfigReferenceError) {
        reply.code(400).send({ error: error.message, statusCode: 400 });
        return;
    }

    if (isUniqueViolation(error)) {
        reply.code(409).send({ error: 'Resource already exists', statusCode: 409 });
        return;
    }

    if (error instanceof z.ZodError) {
        reply.code(400).send({ error: error.message, statusCode: 400 });
        return;
    }

    const message = error instanceof Error ? error.message : String(error);
    reply.code(400).send({ error: message, statusCode: 400 });
}

async function sendMaybeFound<T>(
    reply: FastifyReply,
    resource: Promise<T | null>,
): Promise<unknown> {
    const value = await resource;
    if (!value) {
        return reply.code(404).send({ error: 'Resource not found', statusCode: 404 });
    }

    return value;
}

export async function registerSupportRoutes(app: FastifyInstance): Promise<void> {
    app.get('/v1/support/runs', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const query = SupportRunListQuerySchema.parse(request.query);
        return supportRuntimeSvc.listRuns(query);
    });

    app.post('/v1/support/runs', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;

        try {
            const input = SupportRunInputSchema.parse(request.body);
            const run = await supportRuntimeSvc.run(input);
            return reply.code(201).send(run);
        } catch (error) {
            handleRuntimeError(error, reply);
        }
    });

    app.get('/v1/support/runs/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return sendMaybeFound(reply, supportRuntimeSvc.byId(parseIdParams(request.params)));
    });

    app.get('/v1/support/runs/:id/steps', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const id = parseIdParams(request.params);
        const run = await supportRuntimeSvc.byId(id);
        if (!run) return reply.code(404).send({ error: 'Resource not found', statusCode: 404 });
        return supportRuntimeSvc.listSteps(id);
    });

    app.get('/v1/memory', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const query = MemoryListQuerySchema.parse(request.query);
        return memorySvc.list(query);
    });

    app.post('/v1/memory', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;

        try {
            const input = MemoryInputSchema.parse(request.body);
            return reply.code(201).send(await memorySvc.save(input));
        } catch (error) {
            handleRuntimeError(error, reply);
        }
    });

    app.get('/v1/memory/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        return sendMaybeFound(reply, memorySvc.byId(parseIdParams(request.params)));
    });

    app.patch('/v1/memory/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;

        try {
            const id = parseIdParams(request.params);
            const patch = MemoryPatchSchema.parse(request.body);
            return sendMaybeFound(reply, memorySvc.set(id, patch));
        } catch (error) {
            handleRuntimeError(error, reply);
        }
    });

    app.delete('/v1/memory/:id', async (request, reply) => {
        if (!(await assertDbAvailable(reply))) return;
        const deleted = await memorySvc.del(parseIdParams(request.params));
        if (!deleted) return reply.code(404).send({ error: 'Resource not found', statusCode: 404 });
        return { deleted };
    });
}
