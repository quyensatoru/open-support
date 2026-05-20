# MIDA Agent Architecture

`mida-agent` is split into an internal runtime API, an admin UI, and shared packages.

## Runtime

The server owns agent runs, LangGraph workflow execution, local tool metadata, skill manifests,
Playwright browser-search runtime helpers, and future MCP server entrypoints. Run state is in-memory for this
scaffold and should be replaced with durable storage when production workflows are introduced.

## Storage

Server storage lives under `apps/server/src/storage/`.

- `postgres/`: Postgres pool, Fastify lifecycle hook, and migration runner.
- `postgres/migrations/`: versioned schema migrations compiled with the server.
- `configs/entities/`: Zod-backed entity definitions for persisted LLM and agent config.
- `configs/repositories/`: Postgres repositories for config CRUD.
- `configs/services/`: business logic around config reads/writes, including cross-entity validation.

Postgres is optional during local scaffold development. Set `DATABASE_URL` to enable the pool, and set
`DATABASE_MIGRATE_ON_START=true` when the server should create or update config tables on boot.

## Admin UI

The admin app only manages `mida-agent` internals. It does not call OpenAI, MCP, MongoDB, Redis, or
`mida-mcp` directly. All admin data comes from `apps/server`.

## MCP

MCP is a server placeholder in this phase. Future work should expose a curated subset of agent
operations over MCP so trusted external systems can create runs, inspect tools, or subscribe to
results.
