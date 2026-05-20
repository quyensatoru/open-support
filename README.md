# mida-agent

TypeScript workspace for the MIDA internal AI agent runtime.

## Apps

- `apps/server`: Fastify API, LangGraph scaffold, tools, skills, run store, MCP placeholder.
- `apps/admin`: Vite React admin UI for managing internal agent runs, tools, skills, settings, and logs.

## Packages

- `packages/types`: public TypeScript/Zod interface definitions.
- `packages/config`: shared constants.
- `packages/prompts`: prompt text entrypoint.
- `packages/sdk`: small fetch client for agent API consumers.

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The admin UI expects the server at `http://localhost:7332` by default.

## Storage

Postgres storage scaffolding is under `apps/server/src/storage/`. It includes a pool, migration runner,
and LLM/agent config entities and repositories. Set `DATABASE_URL` to enable Postgres, and optionally set
`DATABASE_MIGRATE_ON_START=true` to run the config-table migration when the server boots.

Run local Postgres before starting the server:

```bash
docker compose up -d postgres
```

The compose database matches `.env.example`:
`postgresql://mida_agent:mida_agent@localhost:5432/mida_agent`.

## Playwright

Playwright is a runtime browser capability for agent tools, not the test runner in this repo. The
current scaffold exposes a disabled `browser.search_web` tool definition and a Playwright helper
under `apps/server/src/playwright/` for future live web search workflows.

## MCP Status

The `/mcp` endpoint intentionally returns `501 Not Implemented` in this scaffold. It is reserved
for a future MCP server that external systems can use to call into `mida-agent`.

This workspace does not connect to the existing `mida-mcp` service.
