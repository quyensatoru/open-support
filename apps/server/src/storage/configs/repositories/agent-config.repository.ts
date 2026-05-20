import { randomUUID } from 'node:crypto';

import type { QueryResultRow } from 'pg';

import { requirePostgresPool } from '../../postgres/client.js';
import type { QueryExecutor } from '../../postgres/client.js';
import {
    AgentConfigEntitySchema,
    CreateAgentConfigSchema,
    UpdateAgentConfigSchema,
    type AgentConfigEntity,
    type CreateAgentConfigInput,
    type UpdateAgentConfigInput,
} from '../entities/agent-config.entity.js';

const AGENT_CONFIG_COLUMNS = `
    id,
    name,
    description,
    llm_config_id,
    system_prompt,
    tool_ids,
    skill_ids,
    enabled,
    metadata,
    created_at,
    updated_at
`;

type AgentConfigRow = QueryResultRow & {
    id: string;
    name: string;
    description: string | null;
    llm_config_id: string | null;
    system_prompt: string;
    tool_ids: unknown;
    skill_ids: unknown;
    enabled: boolean;
    metadata: unknown;
    created_at: Date | string;
    updated_at: Date | string;
};

function toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}

function toStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map(String);
}

function toAgentConfigEntity(row: AgentConfigRow): AgentConfigEntity {
    return AgentConfigEntitySchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        llmConfigId: row.llm_config_id,
        systemPrompt: row.system_prompt,
        toolIds: toStringList(row.tool_ids),
        skillIds: toStringList(row.skill_ids),
        enabled: row.enabled,
        metadata: row.metadata ?? {},
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
    });
}

export class AgentConfigRepository {
    constructor(private readonly db: QueryExecutor = requirePostgresPool()) {}

    async list(): Promise<AgentConfigEntity[]> {
        const result = await this.db.query<AgentConfigRow>(
            `SELECT ${AGENT_CONFIG_COLUMNS} FROM agent_configs ORDER BY name ASC`,
        );
        return result.rows.map(toAgentConfigEntity);
    }

    async listEnabled(): Promise<AgentConfigEntity[]> {
        const result = await this.db.query<AgentConfigRow>(
            `SELECT ${AGENT_CONFIG_COLUMNS} FROM agent_configs WHERE enabled = true ORDER BY name ASC`,
        );
        return result.rows.map(toAgentConfigEntity);
    }

    async findById(id: string): Promise<AgentConfigEntity | null> {
        const result = await this.db.query<AgentConfigRow>(
            `SELECT ${AGENT_CONFIG_COLUMNS} FROM agent_configs WHERE id = $1`,
            [id],
        );
        const row = result.rows[0];
        return row ? toAgentConfigEntity(row) : null;
    }

    async findByName(name: string): Promise<AgentConfigEntity | null> {
        const result = await this.db.query<AgentConfigRow>(
            `SELECT ${AGENT_CONFIG_COLUMNS} FROM agent_configs WHERE name = $1`,
            [name],
        );
        const row = result.rows[0];
        return row ? toAgentConfigEntity(row) : null;
    }

    async create(input: CreateAgentConfigInput): Promise<AgentConfigEntity> {
        const data = CreateAgentConfigSchema.parse(input);
        const result = await this.db.query<AgentConfigRow>(
            `
INSERT INTO agent_configs (
    id,
    name,
    description,
    llm_config_id,
    system_prompt,
    tool_ids,
    skill_ids,
    enabled,
    metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING ${AGENT_CONFIG_COLUMNS}
`,
            [
                randomUUID(),
                data.name,
                data.description,
                data.llmConfigId,
                data.systemPrompt,
                data.toolIds,
                data.skillIds,
                data.enabled,
                data.metadata,
            ],
        );

        const row = result.rows[0];
        if (!row) {
            throw new Error('Failed to create agent config');
        }

        return toAgentConfigEntity(row);
    }

    async update(id: string, input: UpdateAgentConfigInput): Promise<AgentConfigEntity | null> {
        const data = UpdateAgentConfigSchema.parse(input);
        const fields: string[] = [];
        const values: unknown[] = [];
        const addField = (column: string, value: unknown) => {
            values.push(value);
            fields.push(`${column} = $${values.length}`);
        };

        if (data.name !== undefined) addField('name', data.name);
        if (data.description !== undefined) addField('description', data.description);
        if (data.llmConfigId !== undefined) addField('llm_config_id', data.llmConfigId);
        if (data.systemPrompt !== undefined) addField('system_prompt', data.systemPrompt);
        if (data.toolIds !== undefined) addField('tool_ids', data.toolIds);
        if (data.skillIds !== undefined) addField('skill_ids', data.skillIds);
        if (data.enabled !== undefined) addField('enabled', data.enabled);
        if (data.metadata !== undefined) addField('metadata', data.metadata);

        if (fields.length === 0) {
            return this.findById(id);
        }

        values.push(id);
        const result = await this.db.query<AgentConfigRow>(
            `
UPDATE agent_configs
SET ${fields.join(', ')}
WHERE id = $${values.length}
RETURNING ${AGENT_CONFIG_COLUMNS}
`,
            values,
        );
        const row = result.rows[0];
        return row ? toAgentConfigEntity(row) : null;
    }

    async deleteById(id: string): Promise<boolean> {
        const result = await this.db.query('DELETE FROM agent_configs WHERE id = $1', [id]);
        return result.rowCount === 1;
    }
}

export function createAgentConfigRepository(
    db: QueryExecutor = requirePostgresPool(),
): AgentConfigRepository {
    return new AgentConfigRepository(db);
}
