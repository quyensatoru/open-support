import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { checkDbConnection, isDbConfigured } from '../../../config/postgres.js';
import { ConfigReferenceError } from '../../../db/service/index.js';

export const IdParamsSchema = z.object({
    id: z.string().uuid(),
});

export const EnabledQuerySchema = z.object({
    enabled: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export async function assertDbAvailable(reply: FastifyReply): Promise<boolean> {
    if (!isDbConfigured()) {
        reply.code(503).send({
            error: 'DB not configured',
            statusCode: 503,
        });
        return false;
    }

    if (await checkDbConnection()) return true;

    reply.code(503).send({
        error: 'DB unavailable',
        statusCode: 503,
    });
    return false;
}

export function parseIdParams(params: unknown): string {
    return IdParamsSchema.parse(params).id;
}

export function parseEnabledQuery(query: unknown): boolean | undefined {
    return EnabledQuerySchema.parse(query).enabled;
}

export function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export function handleConfigError(error: unknown, reply: FastifyReply): void {
    if (error instanceof ConfigReferenceError) {
        reply.code(400).send({ error: error.message, statusCode: 400 });
        return;
    }

    if (isUniqueViolation(error)) {
        reply.code(409).send({ error: 'Config key already exists', statusCode: 409 });
        return;
    }

    const message = error instanceof Error ? error.message : String(error);
    reply.code(400).send({ error: message, statusCode: 400 });
}

export async function sendMaybeFound<T>(
    reply: FastifyReply,
    resource: Promise<T | null>,
    map: (value: T) => unknown = (value) => value,
): Promise<unknown> {
    const value = await resource;
    if (!value) {
        return reply.code(404).send({ error: 'Config not found', statusCode: 404 });
    }

    return map(value);
}

export function nonEmptyPatch<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
    return schema.partial().refine((value) => Object.keys(value).length > 0, {
        message: 'Patch body must include at least one field.',
    });
}
