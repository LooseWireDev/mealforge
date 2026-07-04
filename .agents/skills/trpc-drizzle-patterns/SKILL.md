---
name: trpc-drizzle-patterns
description: Canonical patterns for the Hono + tRPC + Drizzle + Better Auth backend — procedures, routers, context, schema, and how types flow to clients. Use when writing or reviewing any code in apps/api (TypeScript backend) or consuming the API from web/mobile.
---

# tRPC + Drizzle Patterns (Hono backend)

## Context and procedures

`apps/api/src/trpc.ts` is the hub. It defines:

```ts
export interface Context {
  req: Request;
  session: Session | null; // Session = typeof auth.$Infer.Session (Better Auth)
}
```

`createContext` resolves the session once per request via `auth.api.getSession({ headers: req.headers })`.

- `publicProcedure` — no auth requirement.
- `protectedProcedure` — throws `TRPCError({ code: 'UNAUTHORIZED' })` when there is no session, and narrows `ctx.session` to non-null for everything chained after it. Use it for anything user-specific; never re-check the session manually inside a protected handler.

## Feature routers

Each feature owns a router in `apps/api/src/features/<name>/router.ts`:

```ts
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../../trpc';
import { listThings } from './service';

export const thingRouter = router({
  list: publicProcedure.query(() => listThings()),
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ ctx, input }) => createThing(ctx.session.user.id, input)),
});
```

Rules:

- **Every input is a Zod schema.** No unvalidated `input`.
- Routers stay thin — business logic lives in the feature's `service.ts`, with explicit return types on every exported function.
- Services throw `TRPCError` with the right code (`NOT_FOUND`, `FORBIDDEN`, ...). **No try/catch in services or routers** — errors propagate to the tRPC error handler.
- Feature routers are registered in `appRouter` by the feature generator via the `// forge:feature-imports` / `// forge:feature-routers` anchors in `trpc.ts`. Never register by hand; never delete the anchors.

## Drizzle

- Tables live in `apps/api/src/db/schema.ts`; auth tables are separate in `apps/api/src/auth/authSchema.ts` (owned by Better Auth — don't hand-edit).
- The project is either postgres (`drizzle-orm/pg-core`: `pgTable`, `serial`, ...) or sqlite (`drizzle-orm/sqlite-core`: `sqliteTable`, `integer`, ...) — check the existing imports in `schema.ts` and stay consistent.
- Migrations: `drizzle.config.ts` at `apps/api/` is already wired to the right dialect; generate migrations with drizzle-kit into `src/db/migrations/`.
- Better Auth uses `drizzleAdapter(db, { provider: 'pg' | 'sqlite' })` in `src/auth/auth.ts` — the provider must match the database.

## How types reach clients (the type bridge)

`AppRouter` is exported from `trpc.ts` and re-exported by `packages/shared/src/types/trpc.ts`. Clients import it **only** as:

```ts
import type { AppRouter } from '@<project>/shared/types';
```

Never import from `apps/api` directly in web/mobile code, and never duplicate API types by hand. On the web side, `apps/web/src/lib/trpc.ts` exposes `trpc = createTRPCReact<AppRouter>()`; wrap the app in `<trpc.Provider>` (client from `createTRPCClient()`) when adding the first `trpc.<feature>.<proc>.useQuery()` call.

## Testing

- Vitest, tests next to the code (`service.test.ts`). Property-based tests with fast-check for pure data transformations.
- Do not mock the database or internal modules; only external network calls. For db-touching tests, use a real sqlite database or a test transaction.
- Test names describe behavior: `"returns UNAUTHORIZED when no session"`.
