# mealforge

**AI-planned weekly meals, in a real app.** Plan your week conversationally with any MCP-capable AI chat (LibreChat, Claude, and friends) — the model pushes the finished plan here, where it becomes recipe cards, a step-by-step cook mode, and a grocery list you check off in the store.

Meal-planning apps limit you to their recipe catalog. mealforge has **no catalog**: every recipe is generated in conversation, tailored to your household, constraints, and whatever sounds good this week. The app is the structured, shoppable, cookable home for what you and the model decide together.

## How it works

```
┌────────────┐  MCP (streamable http)  ┌────────────────────────────┐
│ your AI    │ ───────────────────────▶│ mealforge                  │
│ chat       │  push_meal_plan          │  • weekly plan view        │
│ (LibreChat,│  search_recipes          │  • recipes + cook mode     │
│  etc.)     │  list_favorites …        │  • grocery list (derived)  │
└────────────┘                          │  • favorites + history     │
                                        └────────────────────────────┘
```

1. **Plan in chat.** "Lots of crock pot this week, salmon once, use the pork shoulder in the freezer." Iterate until it's right.
2. **The model pushes the final plan** (`push_meal_plan`): structured recipes — ingredients with quantities, units, and store sections — plus markdown cooking steps.
3. **mealforge derives the grocery list** automatically: ingredients aggregated across recipes ("2 cups" + "1 cup" → "3 cups"), grouped by store section, checkable while you shop.
4. **Favorite what you loved.** The model can recall favorites and past recipes next week ("give me one of my favorites") and avoids repeating recent meals.

## Self-hosting

```bash
mkdir mealforge && cd mealforge
curl -O https://raw.githubusercontent.com/gavdevs/mealforge/main/docker-compose.yml
docker compose up -d
```

The web app and MCP endpoint are now on port `8090`:

- Web UI: `http://<host>:8090`
- MCP endpoint: `http://<host>:8090/mcp`

Data lives in a single SQLite file under `./data/` — back that folder up and you've backed up everything.

> **Security note:** mealforge has no built-in authentication. It is designed for a household on a private network — put it on your Tailscale/VPN, or behind a reverse proxy that does auth. Do not expose it to the public internet as-is.

Set `APP_URL` (in the compose file or a `.env` next to it) to the URL your household uses, e.g. `APP_URL=https://mealforge.your-tailnet.ts.net` — the MCP tools return it so the model can link you to the app.

## Connecting an MCP client

### LibreChat

`librechat.yaml`:

```yaml
mcpServers:
  mealforge:
    type: streamable-http
    url: http://<host>:8090/mcp
    timeout: 60000
```

If mealforge runs on a private IP, also exempt it from LibreChat's SSRF guard:

```yaml
mcpSettings:
  allowedAddresses:
    - "<host>:8090"
```

Then restart the LibreChat container and enable the `mealforge` tools for your agent/endpoint.

### Other clients

Any client that speaks MCP over streamable HTTP works — point it at `http://<host>:8090/mcp`. No auth headers are required (see the security note above).

### Suggested instructions for your meal-planning assistant

> You have mealforge tools for the family meal-planning app. When we plan a week's dinners: call `get_recent_meal_plans` first and avoid repeating the last few weeks; use `list_favorites` / `search_recipes` when I ask for something we've had before. Draft and iterate the plan in chat only. When I explicitly confirm the plan is final, call `push_meal_plan` once with the full week — every recipe complete with structured ingredients (name, quantity, unit, store section) and markdown steps; pass `recipeId` instead of a full recipe to reuse a past one. After pushing, share the app link. If we revise an already-pushed week, re-push the same `weekStart`. Never push drafts.

## MCP tools

| Tool | Purpose |
|---|---|
| `push_meal_plan` | Push a finalized week (new recipes and/or `recipeId` reuses). Re-pushing the same `weekStart` revises the week; checked-off grocery items that didn't change stay checked. |
| `get_recent_meal_plans` | Recent weeks with meal titles — for repeat-avoidance. |
| `get_meal_plan_for_week` | The plan for a specific week, if any. |
| `list_favorites` | Recipes the household has favorited in the UI. |
| `search_recipes` | Search past recipes by title, tag, or ingredient. |
| `get_recipe` | Full recipe (ingredients + steps) by id. |

## Development

pnpm + Nx monorepo: `apps/api` (Hono + tRPC + Drizzle + SQLite, serves the MCP endpoint and the built web app), `apps/web` (React + Vite + TanStack Router + Tailwind).

```bash
pnpm install
pnpm nx run-many -t test,build      # tests + builds
pnpm --filter @mealforge/api dev    # API on :3000
pnpm --filter @mealforge/web dev    # web on :5173 (proxies /trpc to :3000)
```

## License

[MIT](LICENSE)
