import { tool } from '@langchain/core/tools';

import {
    DatabaseGetSchemaInputSchema,
    type DatabaseSchemaResult,
} from '../../../../graph/database/database.type.js';
import { DBRegistry } from '../index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickTargetSchema(schema: unknown, target: string): unknown {
    if (!isRecord(schema)) return undefined;

    if (target in schema) {
        return schema[target];
    }

    const byType = schema.byType;
    if (isRecord(byType) && target in byType) {
        return byType[target];
    }

    return undefined;
}

export const databaseGetCollectionSchema = tool(
    async (input): Promise<DatabaseSchemaResult> => {
        const parsed = DatabaseGetSchemaInputSchema.parse(input);
        const availableSources = DBRegistry.getSources();
        const sourceTypes = DBRegistry.getSourceTypes();
        const warnings: string[] = [];
        const schemas: Record<string, unknown> = {};

        if (!availableSources.length) {
            return {
                ok: false,
                availableSources,
                sourceTypes,
                schemas,
                warnings: ['No database sources are connected. Pass sources to the database graph or initialize DBRegistry first.'],
            };
        }

        if (parsed.source) {
            try {
                schemas[parsed.source] = await DBRegistry.getSchema(parsed.source);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                warnings.push(message);
            }
        } else {
            const allSchemas = await DBRegistry.getAllSchemas();
            for (const [source, schema] of Object.entries(allSchemas)) {
                schemas[source] = schema;
            }
        }

        let selectedSchema: unknown;
        if (parsed.source && parsed.source in schemas) {
            selectedSchema = schemas[parsed.source];
        }

        if (parsed.target && selectedSchema !== undefined) {
            const targetSchema = pickTargetSchema(selectedSchema, parsed.target);
            if (targetSchema === undefined) {
                warnings.push(`Target "${parsed.target}" was not found in source "${parsed.source}".`);
            } else {
                selectedSchema = targetSchema;
            }
        }

        const result: DatabaseSchemaResult = {
            ok: Object.keys(schemas).length > 0 && warnings.length === 0,
            availableSources,
            sourceTypes,
            schemas,
            warnings,
        };

        if (selectedSchema !== undefined) result.schema = selectedSchema;
        if (parsed.source) result.source = parsed.source;
        if (parsed.target) result.target = parsed.target;
        if (parsed.targetKind) result.targetKind = parsed.targetKind;

        return result;
    },
    {
        name: 'database_get_collection_schema',
        description:
            'Return schema metadata for connected database sources, or a focused collection/table/Redis type schema.',
        schema: DatabaseGetSchemaInputSchema,
    },
);
