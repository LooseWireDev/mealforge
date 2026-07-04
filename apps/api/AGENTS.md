# apps/api — Backend (Hono / TypeScript)

This is the TypeScript backend, built with **Hono + tRPC + Drizzle + Better Auth**. If the project is using the Python backend instead (FastAPI + SQLAlchemy + Alembic), see `apps/api/AGENTS.md` from the python scaffold — this file will not exist in that case.

## Stack

- **Hono** — HTTP framework
- **tRPC** — end-to-end typesafe RPC
- **Drizzle** — ORM with `drizzle-kit` for migrations
- **Better Auth** — authentication

## Layout

```
apps/api/
├── src/
│   ├── index.ts           # Hono app entry, port binding
│   ├── trpc.ts            # tRPC router root + context
│   ├── middleware/        # auth.ts, errorHandler.ts
│   ├── auth/              # better-auth setup, routes, schema
│   ├── db/                # schema.ts, vector.ts (optional)
│   ├── features/          # feature-specific routers/services/types (created by `feature` generator)
│   └── lib/               # shared utilities (e.g. telemetry)
├── drizzle.config.ts
└── package.json
```

## Run / Test / Migrate

```sh
pnpm --filter @mealforge/api dev        # start with tsx watch
pnpm --filter @mealforge/api test       # vitest run
pnpm --filter @mealforge/api db:generate # generate migration from schema diff
pnpm --filter @mealforge/api db:migrate  # apply pending migrations
# or via Nx:
nx run mealforge-api:dev
nx run mealforge-api:test
nx run mealforge-api:db:migrate
```

## Conventions

- **tRPC routers** are the public API surface. Procedures use Zod for input validation. Throw `TRPCError` with the appropriate code from services.
- **Drizzle schema** is the source of truth for the database. Update `apps/api/src/db/schema.ts` and run `db:generate`.
- **Auth** is wired via Better Auth in `apps/api/src/auth/`. New protected procedures use `protectedProcedure` from `trpc.ts`.
- **No barrel files** inside `src/` — import directly from the module that owns the export.
- **No `any`** — use `unknown` and narrow with Zod.

## Adding a new feature

```sh
pnpm nx generate @mealforge/project-plugin:feature --name <name> --apps api
```

The generator creates the correct folder under `src/features/<name>/`, registers the router, and wires imports. Do not create feature directories manually.
