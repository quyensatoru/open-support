import { tool } from '@langchain/core/tools';

import {
    DatabaseExecuteChecksInputSchema,
    type DatabaseCheck,
    type DatabaseExecuteChecksResult,
    type DatabaseSingleCheckResult,
} from '../../../../graph/database/database.type.js';
import { DBRegistry } from '../index.js';
import type { QueryParams } from '../types.js';

function queryParamsFor(check: DatabaseCheck, sampleLimit: number): QueryParams {
    const query = check.query;

    if (query.engine === 'sql') {
        const params: Record<string, unknown> = {
            sql: query.sql,
            limit: query.limit ?? sampleLimit,
        };
        if (query.bindings) params.bindings = query.bindings;
        return params as unknown as QueryParams;
    }

    if (query.engine === 'mongodb') {
        const params: Record<string, unknown> = {
            collection: query.collection,
            limit: query.limit ?? sampleLimit,
        };

        if (query.aggregate?.length) {
            params.aggregate = query.aggregate;
        } else {
            params.filter = query.filter ?? {};
            if (query.projection) params.projection = query.projection;
            if (query.sort) params.sort = query.sort;
        }

        return params as unknown as QueryParams;
    }

    const params: Record<string, unknown> = {
        operation: query.operation,
        key: query.key,
    };

    if (query.keys) params.keys = query.keys;
    if (query.field !== undefined) params.field = query.field;
    if (query.start !== undefined) params.start = query.start;
    if (query.end !== undefined) params.end = query.end;
    if (query.withScores !== undefined) params.withScores = query.withScores;
    if (query.pattern !== undefined) params.pattern = query.pattern;
    if (query.count !== undefined) params.count = query.count;
    if (query.type !== undefined) params.type = query.type;

    return params as unknown as QueryParams;
}

async function executeOne(
    check: DatabaseCheck,
    sampleLimit: number,
): Promise<DatabaseSingleCheckResult> {
    try {
        const rows = await DBRegistry.dispatch(check.source, queryParamsFor(check, sampleLimit));
        const sample = rows.slice(0, sampleLimit);

        return {
            id: check.id,
            source: check.source,
            targetKind: check.targetKind,
            target: check.target,
            reason: check.reason,
            ok: true,
            exists: rows.length > 0,
            rowCount: rows.length,
            sample,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return {
            id: check.id,
            source: check.source,
            targetKind: check.targetKind,
            target: check.target,
            reason: check.reason,
            ok: false,
            exists: false,
            rowCount: 0,
            sample: [],
            error: message,
        };
    }
}

export const databaseExecuteChecks = tool(
    async (input): Promise<DatabaseExecuteChecksResult> => {
        const parsed = DatabaseExecuteChecksInputSchema.parse(input);
        const sampleLimit = parsed.sampleLimit ?? 10;

        if (!parsed.checks.length) {
            return {
                ok: false,
                results: [],
                warnings: ['No database checks were provided.'],
            };
        }

        const results = await Promise.all(
            parsed.checks.map((check) => executeOne(check, sampleLimit)),
        );

        return {
            ok: results.every((result) => result.ok),
            results,
            warnings: [],
        };
    },
    {
        name: 'database_execute_checks',
        description:
            'Execute read-only database checks against connected sources and return whether data exists.',
        schema: DatabaseExecuteChecksInputSchema,
    },
);
