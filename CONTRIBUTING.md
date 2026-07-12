# Contributing to mealforge

Thanks for your interest! Issues and PRs are welcome. This page covers everything you need to get productive.

## Dev setup

Requirements: **Node 22** and **pnpm** (`corepack enable` gets you pnpm).

```bash
git clone https://github.com/LooseWireDev/mealforge.git
cd mealforge
pnpm install

pnpm --filter @mealforge/api dev    # API + MCP endpoint on :3000
pnpm --filter @mealforge/web dev    # web on :5173 (proxies /trpc to :3000)
```

It's an Nx monorepo:

- `apps/api` — Hono + tRPC + Drizzle + SQLite; serves the MCP endpoint and, in production, the built web app
- `apps/web` — React + Vite + TanStack Router + Tailwind
- `packages/shared` — Zod schemas shared between the two
- `skills/` — the agent skill shipped to users

## Checks

Everything below must pass on a fresh clone and is expected to pass on your PR:

```bash
pnpm test                        # vitest unit/integration tests
pnpm lint                        # biome (lint + format)
pnpm nx run-many -t build        # builds
pnpm exec playwright test        # e2e against the production build (build first)
```

To smoke-test a running instance over MCP: `scripts/verify-mcp.sh http://localhost:3000`.

## Conventions

The full conventions live in [`AGENTS.md`](AGENTS.md) (they apply to humans too). The short version:

- **Tests come from specs, before implementation** — write failing tests first based on the expected behavior, not the code.
- Zod-validate every external input (tRPC procedure inputs, MCP tool inputs).
- No `any`, no barrel files inside `apps/`, no try/catch in business logic, no mocking internal dependencies.
- Biome for lint + format: `pnpm lint:fix` before you push.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`), one logical change per commit.

## MCP tool changes

The MCP tools are the public API that people's agents depend on. If you change a tool's schema or behavior:

- keep inputs permissive (coerce, don't reject) and errors self-correcting — a validation error must name the exact fields and include a valid example, so models can fix their own calls;
- update the tool table in `README.md` and, if the workflow changes, `skills/meal-planning/SKILL.md`;
- run `scripts/verify-mcp.sh` against your dev server.

## Reporting bugs

Use the issue templates. For MCP integration problems, the output of `scripts/verify-mcp.sh` and the name of your client (LibreChat, Claude Code, …) shortcut most of the diagnosis.
