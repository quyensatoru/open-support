import { randomUUID } from 'node:crypto';

import type { QueryResultRow } from 'pg';

import { requirePostgresPool } from '../../postgres/client.js';
import type { QueryExecutor } from '../../postgres/client.js';
import {
    CreateLlmConfigSchema,
    LlmConfigEntitySchema,
    UpdateLlmConfigSchema,
    type CreateLlmConfigInput,
    type LlmConfigEntity,
    type UpdateLlmConfigInput,
} from '../entities/llm-config.entity.js';

const LLM_CONFIG_COLUMNS = `
    id,
    name,
    provider,
    model,
    api_key_secret_ref,
    base_url,
    temperature,
    max_tokens,
    enabled,
    metadata,
    created_at,
    updated_at
`;

type LlmConfigRow = QueryResultRow & {
    id: string;
    name: string;
    provider: string;
    model: string;
    api_key_secret_ref: string | null;
    base_url: string | null;
    temperature: number | string | null;
    max_tokens: number | null;
    enabled: boolean;
    metadata: unknown;
    created_at: Date | string;
    updated_at: Date | string;
};

function toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}

function toNullableNumber(value: number | string | null): number | null {
    return value === null ? null : Number(value);
}

function toLlmConfigEntity(row: LlmConfigRow): LlmConfigEntity {
    return LlmConfigEntitySchema.parse({
        id: row.id,
        name: row.name,
        provider: row.provider,
        model: row.model,
        apiKeySecretRef: row.api_key_secret_ref,
        baseUrl: row.base_url,
        temperature: toNullableNumber(row.temperature),
        maxTokens: row.max_tokens,
        enabled: row.enabled,
        metadata: row.metadata ?? {},
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
    });
}

export class LlmConfigRepository {
    constructor(private readonly db: QueryExecutor = requirePostgresPool()) {}

    async list(): Promise<LlmConfigEntity[]> {
        const result = await this.db.query<LlmConfigRow>(
            `SELECT ${LLM_CONFIG_COLUMNS} FROM llm_configs ORDER BY name ASC`,
        );
        return result.rows.map(toLlmConfigEntity);
    }

    async listEnabled(): Promise<LlmConfigEntity[]> {
        const result = await this.db.query<LlmConfigRow>(
            `SELECT ${LLM_CONFIG_COLUMNS} FROM llm_configs WHERE enabled = true ORDER BY name ASC`,
        );
        return result.rows.map(toLlmConfigEntity);
    }

    async findById(id: string): Promise<LlmConfigEntity | null> {
        const result = await this.db.query<LlmConfigRow>(
            `SELECT ${LLM_CONFIG_COLUMNS} FROM llm_configs WHERE id = $1`,
            [id],
        );
        const row = result.rows[0];
        return row ? toLlmConfigEntity(row) : null;
    }

    async findByName(name: string): Promise<LlmConfigEntity | null> {
        const result = await this.db.query<LlmConfigRow>(
            `SELECT ${LLM_CONFIG_COLUMNS} FROM llm_configs WHERE name = $1`,
            [name],
        );
        const row = result.rows[0];
        return row ? toLlmConfigEntity(row) : null;
    }

    async create(input: CreateLlmConfigInput): Promise<LlmConfigEntity> {
        const data = CreateLlmConfigSchema.parse(input);
        const result = await this.db.query<LlmConfigRow>(
            `
INSERT INTO llm_configs (
    id,
    name,
    provider,
    model,
    api_key_secret_ref,
    base_url,
    temperature,
    max_tokens,
    enabled,
    metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING ${LLM_CONFIG_COLUMNS}
`,
            [
                randomUUID(),
                data.name,
                data.provider,
                data.model,
                data.apiKeySecretRef,
                data.baseUrl,
                data.temperature,
                data.maxTokens,
                data.enabled,
                data.metadata,
            ],
        );

        const row = result.rows[0];
        if (!row) {
            throw new Error('Failed to create LLM config');
        }

        return toLlmConfigEntity(row);
    }

    async update(id: string, input: UpdateLlmConfigInput): Promise<LlmConfigEntity | null> {
        const data = UpdateLlmConfigSchema.parse(input);
        const fields: string[] = [];
        const values: unknown[] = [];
        const addField = (column: string, value: unknown) => {
            values.push(value);
            fields.push(`${column} = $${values.length}`);
        };

        if (data.name !== undefined) addField('name', data.name);
        if (data.provider !== undefined) addField('provider', data.provider);
        if (data.model !== undefined) addField('model', data.model);
        if (data.apiKeySecretRef !== undefined) {
            addField('api_key_secret_ref', data.apiKeySecretRef);
        }
        if (data.baseUrl !== undefined) addField('base_url', data.baseUrl);
        if (data.temperature !== undefined) addField('temperature', data.temperature);
        if (data.maxTokens !== undefined) addField('max_tokens', data.maxTokens);
        if (data.enabled !== undefined) addField('enabled', data.enabled);
        if (data.metadata !== undefined) addField('metadata', data.metadata);

        if (fields.length === 0) {
            return this.findById(id);
        }

        values.push(id);
        const result = await this.db.query<LlmConfigRow>(
            `
UPDATE llm_configs
SET ${fields.join(', ')}
WHERE id = $${values.length}
RETURNING ${LLM_CONFIG_COLUMNS}
`,
            values,
        );
        const row = result.rows[0];
        return row ? toLlmConfigEntity(row) : null;
    }

    async deleteById(id: string): Promise<boolean> {
        const result = await this.db.query('DELETE FROM llm_configs WHERE id = $1', [id]);
        return result.rowCount === 1;
    }
}

export function createLlmConfigRepository(
    db: QueryExecutor = requirePostgresPool(),
): LlmConfigRepository {
    return new LlmConfigRepository(db);
}
