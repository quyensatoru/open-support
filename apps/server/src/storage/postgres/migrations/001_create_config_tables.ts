import type { PostgresMigration } from './types.js';

export const createConfigTablesMigration: PostgresMigration = {
    id: '001_create_config_tables',
    sql: `
CREATE TABLE IF NOT EXISTS llm_configs (
    id uuid PRIMARY KEY,
    name text NOT NULL UNIQUE,
    provider text NOT NULL DEFAULT 'openai',
    model text NOT NULL,
    api_key_secret_ref text,
    base_url text,
    temperature double precision,
    max_tokens integer,
    enabled boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_configs (
    id uuid PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text,
    llm_config_id uuid REFERENCES llm_configs(id) ON DELETE SET NULL,
    system_prompt text NOT NULL DEFAULT '',
    tool_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
    skill_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
    enabled boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_configs_enabled ON llm_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_agent_configs_enabled ON agent_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_agent_configs_llm_config_id ON agent_configs(llm_config_id);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_llm_configs_updated_at ON llm_configs;
CREATE TRIGGER set_llm_configs_updated_at
BEFORE UPDATE ON llm_configs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_agent_configs_updated_at ON agent_configs;
CREATE TRIGGER set_agent_configs_updated_at
BEFORE UPDATE ON agent_configs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
`,
};
