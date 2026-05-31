import { pool, isDbConfigured } from '../config/postgres.js';
import { env } from '../env.js';
import { logger } from '../observability/logger.js';

const CONFIG_TABLE_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS llms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key varchar(64) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    provider varchar(40) NOT NULL,
    model varchar(120) NOT NULL,
    base_url text,
    api_key varchar(240),
    temp real NOT NULL DEFAULT 0,
    top_p real,
    max_tokens integer,
    opts jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llms_provider_idx ON llms(provider);
CREATE INDEX IF NOT EXISTS llms_enabled_idx ON llms(enabled);
ALTER TABLE llms ALTER COLUMN api_key TYPE varchar(240);

CREATE TABLE IF NOT EXISTS agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key varchar(64) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    "desc" text,
    llm_id uuid REFERENCES llms(id) ON DELETE SET NULL,
    prompt text NOT NULL DEFAULT '',
    tools jsonb NOT NULL DEFAULT '[]'::jsonb,
    skills jsonb NOT NULL DEFAULT '[]'::jsonb,
    opts jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agents_llm_id_idx ON agents(llm_id);
CREATE INDEX IF NOT EXISTS agents_enabled_idx ON agents(enabled);
CREATE UNIQUE INDEX IF NOT EXISTS agents_one_default_idx ON agents(is_default) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS app_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key varchar(64) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    shopify_app_handle varchar(120),
    default_store_url text,
    repos jsonb NOT NULL DEFAULT '[]'::jsonb,
    db_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_configs_enabled_idx ON app_configs(enabled);

CREATE TABLE IF NOT EXISTS workflow_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key varchar(64) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    entry_graph varchar(120) NOT NULL,
    graph_order jsonb NOT NULL DEFAULT '[]'::jsonb,
    routing_policy varchar(64) NOT NULL DEFAULT 'evidence-driven',
    default_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
    opts jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_configs_default_agent_idx ON workflow_configs(default_agent_id);
CREATE INDEX IF NOT EXISTS workflow_configs_enabled_idx ON workflow_configs(enabled);

CREATE TABLE IF NOT EXISTS tool_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key varchar(120) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    source varchar(64) NOT NULL,
    description text NOT NULL DEFAULT '',
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_configs_source_idx ON tool_configs(source);
CREATE INDEX IF NOT EXISTS tool_configs_enabled_idx ON tool_configs(enabled);

CREATE TABLE IF NOT EXISTS skill_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key varchar(120) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    description text NOT NULL DEFAULT '',
    instructions text NOT NULL DEFAULT '',
    tool_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS skill_configs_enabled_idx ON skill_configs(enabled);

CREATE TABLE IF NOT EXISTS support_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id varchar(160) NOT NULL,
    app_key varchar(64) NOT NULL,
    workflow_key varchar(64) NOT NULL,
    app_name varchar(120) NOT NULL,
    store_url text,
    store_domain varchar(255),
    issue text NOT NULL,
    status varchar(32) NOT NULL,
    input jsonb NOT NULL DEFAULT '{}'::jsonb,
    output jsonb,
    error text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_runs_thread_id_idx ON support_runs(thread_id);
CREATE INDEX IF NOT EXISTS support_runs_app_key_idx ON support_runs(app_key);
CREATE INDEX IF NOT EXISTS support_runs_workflow_key_idx ON support_runs(workflow_key);
CREATE INDEX IF NOT EXISTS support_runs_status_idx ON support_runs(status);
CREATE INDEX IF NOT EXISTS support_runs_created_at_idx ON support_runs(created_at);

CREATE TABLE IF NOT EXISTS support_run_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES support_runs(id) ON DELETE CASCADE,
    step_key varchar(120) NOT NULL,
    graph varchar(120) NOT NULL,
    status varchar(32) NOT NULL,
    input jsonb NOT NULL DEFAULT '{}'::jsonb,
    output jsonb,
    error text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_run_steps_run_id_idx ON support_run_steps(run_id);
CREATE INDEX IF NOT EXISTS support_run_steps_graph_idx ON support_run_steps(graph);
CREATE INDEX IF NOT EXISTS support_run_steps_status_idx ON support_run_steps(status);

CREATE TABLE IF NOT EXISTS memories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace varchar(240) NOT NULL,
    key varchar(160) NOT NULL,
    kind varchar(40) NOT NULL,
    content text NOT NULL,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    confidence varchar(16) NOT NULL,
    source_run_id uuid REFERENCES support_runs(id) ON DELETE SET NULL,
    source_step_id uuid REFERENCES support_run_steps(id) ON DELETE SET NULL,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS memories_namespace_key_idx ON memories(namespace, key);
CREATE INDEX IF NOT EXISTS memories_namespace_idx ON memories(namespace);
CREATE INDEX IF NOT EXISTS memories_kind_idx ON memories(kind);
CREATE INDEX IF NOT EXISTS memories_source_run_idx ON memories(source_run_id);
CREATE INDEX IF NOT EXISTS memories_expires_at_idx ON memories(expires_at);
`;

export async function migrateConfigTables(): Promise<void> {
    if (!isDbConfigured()) return;
    if (!env.DATABASE_MIGRATE_ON_START) return;

    await pool.query(CONFIG_TABLE_SQL);
    logger.info('config tables migrated');
}
