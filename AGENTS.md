# Agent Workflow & Project Conventions

You are a software engineer working in this monorepo. Follow the rules below. For app-specific conventions, read the per-app `AGENTS.md` files — they are hoisted into your context alongside this one.

## Per-app context

- `apps/api/AGENTS.md` — backend conventions (Hono + tRPC + Drizzle + SQLite; also serves the MCP endpoint and the built web app)
- `apps/web/AGENTS.md` — web app conventions (React + Vite + TanStack Router + Tailwind)

Each app's `AGENTS.md` describes its layout, run/test commands, and framework-specific rules.

---

## Spec-Driven Development

- Always ask for a spec before implementing a feature.
- Session 1: Write failing tests from the spec. Do not implement.
- Session 2: Implement the minimum code to make tests pass.
- If you see implementation before tests exist, stop and ask for the spec.

## Feature Development

- Always use `nx generate @mealforge/project-plugin:feature --name <name> --apps <apps>` before writing feature code.
- Feature names are camelCase identifiers (`userProfile`, not `user-profile`).
- Never create feature directories manually.
- The feature generator creates the correct file structure, imports, and wiring — including registering the tRPC router in `apps/api/src/trpc.ts`.

## Task Execution

- Use `nx affected` to run only what changed.
- Use `nx run <app>:<task>` for specific apps.
- Use `nx run-many --target=<task>` when you need to run across all apps.

---

## Language & Runtime

TypeScript everywhere, on Node. Not Bun, not Deno. All code is ESM. No CommonJS.

## File Naming

- camelCase for all files: `userService.ts`, `createPost.ts`, `authMiddleware.ts`
- React components use PascalCase: `UserProfile.tsx`, `DashboardLayout.tsx`
- Test files sit next to what they test: `userService.test.ts` alongside `userService.ts`
- No `index.ts` barrel files inside `apps/` directories. Only at package boundaries (`packages/shared/index.ts`).

## Exports

- Default exports for React components only.
- Named exports for everything else: services, utilities, hooks, types, constants.
- Every exported function has an explicit return type annotation. No exceptions.

## Functions

- `function` keyword for all top-level and exported functions.
- Arrow functions for callbacks, inline handlers, and short expressions only.

## Error Handling

- Services throw `TRPCError` with the appropriate code.
- No try/catch blocks in business logic. Ever. The only try/catch blocks are at entry points: the MCP tool handlers, background task runners, top-level process error handlers.

## Validation

- Zod everywhere. Every external input is validated. tRPC procedure inputs and MCP tool inputs use Zod schemas.
- Shared schemas live in `packages/shared/`. Feature-specific schemas live in the feature's `types.ts`.

## Testing Rules

- **NEVER** write tests after implementation in the same session.
- Always write failing tests first, based on the spec/requirements, before touching implementation.
- Tests must derive from expected behavior described in task requirements, not from reading the code.
- Vitest for unit/integration tests; Playwright (in `e2e/`) runs against the production build.
- No mocking unless the dependency is external (network calls, third-party APIs).
- Test names describe behavior: "returns 404 when user does not exist" not "calls db.findFirst and throws TRPCError".

## Linting and Formatting

- Biome handles both linting and formatting. No ESLint. No Prettier. Single quotes. Semicolons: yes. Tab width: 2 spaces. Trailing commas: all. Print width: 100.

## Git

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- One logical change per commit.

## Comments

- No obvious comments. Comment WHY, never WHAT.
- TODO comments include a brief reason: `// TODO: handle pagination once we have >100 users`

## Code Review Checklist

- Explicit return types on all exported functions
- External inputs validated with Zod
- No try/catch in business logic
- No `any` types — use `unknown` and narrow
- No barrel files in app directories
- No CommonJS imports
- No mocking of internal dependencies in tests
- Conventional commit message

## What Not To Do

- Do not create `index.ts` barrel files inside `apps/` directories.
- Do not use `any` type. Use `unknown` and narrow.
- Do not use `require()` or CommonJS syntax.
- Do not mock internal dependencies in tests. Only mock external network calls.
- Do not write tests that mirror implementation. Tests come from specs.
- Do not use try/catch in service/business logic files.
- Do not commit `.env` files or secrets.
