---
name: meal-planning
description: Plan meals collaboratively in chat, then publish the finalized plan to mealforge via its MCP tools. Use when the user wants to plan meals (a week of dinners, a few breakfasts, a single meal), revise a pushed plan, switch or complete the active plan, or push a plan to mealforge.
---

# Meal planning with mealforge

Plan meals collaboratively in chat, then publish the finalized plan to the mealforge app. A plan is any set of 1+ meals — a full week of dinners, a weekend of brunches, breakfast-lunch-dinner-snacks, or one special meal. Each meal is typed `breakfast`, `lunch`, `dinner`, or `snack`. Planning is conversation — as much back-and-forth as it takes. Publishing is a command — it happens exactly once, only when the user says so, and always via the two-step flow: save each recipe with `create_recipe`, then assemble the plan with `push_meal_plan` using recipeIds only.

## The plan lifecycle

Plans move through three states, and the household cooks from exactly **one active plan** at a time:

- **upcoming** — pushed but not started; plans queue here.
- **active** — the plan being cooked from right now. Its grocery list is the one in the app. A brand-new push becomes active automatically only when nothing else is active.
- **completed** — cooked through; browsable history.

Lifecycle moves are user commands, not your judgment calls: `complete_meal_plan` when they say they're done ("we finished the week", "wrap up this plan"), `activate_meal_plan` when they pick what's next. Activation fails while another plan is active — complete that one first (confirm with the user).

## When to use

- The user wants to plan meals ("let's plan next week", "plan me three breakfasts", "meal plan time")
- The user revises a pushed plan ("swap the salmon", "add a couple of snacks to the plan")
- The user tells you to push/send the plan to mealforge
- The user wants to switch plans, finish a plan, or bring back a favorite plan

## How to apply

### 1. Gather context before proposing anything

- `get_active_meal_plan` and `list_meal_plans` (limit 6) — see what's cooking now and what was cooked recently; don't repeat recent meals unless asked.
- If the user wants something they've had before ("one of our favorites", "that carnitas"), find it with `list_favorites` or `search_recipes`, confirm with `get_recipe`, and remember its recipeId — reuse the id at push time instead of recreating the recipe.
- For "one of our favorite plans", use `list_meal_plans` with `favoritesOnly: true` and rebuild from its recipeIds.

### 2. Draft the whole plan at once

Ask (or infer) the plan's shape first: how many meals, which meal types. From whatever cues the user gives ("lots of crock pot, salmon once, use the pork shoulder"), propose the complete plan in one reply — meal type, meal name, one line each. No full recipes in chat unless asked. Then iterate meal-by-meal as the user reacts. Stay in conversation as long as it takes; never call any write tool during drafting.

### 3. Publish — only on command, always in two steps

Wait for an explicit instruction ("push it", "send it over", "that's the plan"). Never push drafts, never push "to save progress". Then:

**Step A — save each NEW recipe with `create_recipe`, one call per recipe.** Small flat payloads are reliable; one giant nested payload is not. Each call returns a `recipeId` — collect them. Recipes the user is repeating from history already have ids; don't recreate those.

**Step B — one `push_meal_plan` call with ids only:**

```json
{"name":"Slow Cooker Week","meals":[
  {"mealType":"dinner","recipeId":12},
  {"mealType":"dinner","recipeId":13},
  {"mealType":"breakfast","recipeId":9}
]}
```

`name` is optional but nice — unnamed plans show as "Meal Plan {id}", and a plan must be named before the household can favorite it in the app. The result tells you the `planId` and whether the plan landed `active` or `upcoming` — relay that ("it's live now" vs "it's queued behind the current plan") and share the app URL from the tool result.

### 4. Recipe data quality

The grocery list is derived automatically from ingredients, so precision here is the whole ballgame:

- `title`, `stepsMarkdown` (numbered list: `"1. …\n2. …"`, real cookable steps), and `ingredients` are required. Include `description`, `servings`, `prepMinutes`, `cookMinutes`, `tags`, and `mealTypes` (which slots the recipe suits, e.g. `["breakfast","lunch"]` — planning it as a meal also tags it automatically).
- `quantity`: a number (1.5, or "1/2" is accepted). Omit or null only for to-taste items (salt, pepper).
- `unit`: "lb", "oz", "g", "kg", "cup", "tbsp", "tsp", "clove", "can", "bunch" — or null for countable items ("3 zucchini").
- `section`: one of `produce`, `meat-seafood`, `dairy-eggs`, `bakery`, `pantry`, `frozen`, `spices`, `beverages`, `other`.
- **Name ingredients identically across recipes** — "yellow onion" everywhere, not "onion" in one recipe and "yellow onion" in another — so the grocery list merges them into one line.

### 5. If a tool call fails

The error names the exact fields and shows a valid example. Fix only those fields and retry once. Don't restructure the whole payload, don't switch tools, don't retry more than twice — if it still fails, tell the user what the error said.

### 6. Revising a pushed plan

Adjust in chat, then — again only when told — re-push with the **same `planId`**: `create_recipe` for any newly added meals, then `push_meal_plan` with `planId` and the full plan's ids (unchanged meals keep their existing recipeIds). The app replaces the meals and regenerates the grocery list; checked-off items that didn't change stay checked, so mid-plan re-pushes are safe. Never omit `planId` when revising — that would create a duplicate plan.
