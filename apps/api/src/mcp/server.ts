import { PLAN_STATUSES, planStatusSchema } from '@mealforge/shared/schemas';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { Db } from '../db/client';
import {
  activatePlan,
  completePlan,
  getActivePlan,
  getPlan,
  listPlans,
  pushMealPlan,
} from '../features/plans/service';
import { createRecipe, getRecipe, listFavorites, listRecipes } from '../features/recipes/service';
import {
  normalizePush,
  normalizeRecipe,
  PUSH_EXAMPLE,
  pushWireShape,
  RECIPE_EXAMPLE,
  recipeWireShape,
  toInt,
} from './wire';

function appUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

function textResult(payload: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(error: unknown): {
  content: [{ type: 'text'; text: string }];
  isError: true;
} {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

// Rejected payloads go to the container log so failures are debuggable from
// `docker logs mealforge` instead of spelunking the client's message store.
function logRejection(tool: string, input: unknown, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[mcp] ${tool} rejected: ${message}\n[mcp] payload: ${JSON.stringify(input)?.slice(0, 2000)}`,
  );
}

// A fresh server is created per request (stateless streamable-http), so
// registration cost must stay trivial — these are thin wrappers over the
// same service layer the web app's tRPC routers use.
export function createMcpServer(db: Db): McpServer {
  const server = new McpServer({ name: 'mealforge', version: '2.0.0' });

  server.registerTool(
    'push_meal_plan',
    {
      title: 'Push a meal plan',
      description:
        'Push a FINALIZED meal plan to the mealforge app. Only call this after the user has explicitly confirmed the plan is final — never push drafts. ' +
        'A plan holds 1 or more meals, each typed breakfast, lunch, dinner, or snack — a full week of dinners, a weekend of brunches, or a single meal are all valid plans. ' +
        'RECOMMENDED FLOW: first save each new recipe with create_recipe, then call this tool with small meals entries that reference recipeId only. ' +
        'Inline "recipe" objects are also accepted for each meal, but keep those payloads small. ' +
        "The new plan becomes the household's ACTIVE plan if none is active, otherwise it lands in UPCOMING (promote it with activate_meal_plan when asked). " +
        "To REVISE an existing plan, pass its planId — that replaces the plan's meals and regenerates the grocery list; unchanged items keep their checked-off state. " +
        "The grocery list is derived automatically from the recipes' structured ingredients, so ingredient quantities, units, and store sections must be accurate. " +
        'Returns the plan summary (including planId and status) and the app URL to share with the user. ' +
        `Example arguments: ${PUSH_EXAMPLE}`,
      inputSchema: pushWireShape,
    },
    (input) => {
      try {
        const result = pushMealPlan(db, normalizePush(input));
        return textResult({ ...result, appUrl: appUrl() });
      } catch (error) {
        logRejection('push_meal_plan', input, error);
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'create_recipe',
    {
      title: 'Create a recipe',
      description:
        'Save one new recipe and get back its recipeId. Preferred way to build a meal plan: create each recipe individually (small, flat payloads), then call push_meal_plan once with recipeId references. The recipe is stored immediately and reusable in any plan. Returns the recipeId. ' +
        `Example arguments: ${RECIPE_EXAMPLE}`,
      inputSchema: recipeWireShape,
    },
    (input) => {
      try {
        const recipe = createRecipe(db, normalizeRecipe(input));
        return textResult({
          recipeId: recipe.id,
          title: recipe.title,
          next: 'Reference this recipeId in push_meal_plan when the user confirms the plan.',
        });
      } catch (error) {
        logRejection('create_recipe', input, error);
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_meal_plans',
    {
      title: 'List meal plans',
      description:
        `List meal plans with their status (${PLAN_STATUSES.join(', ')}), names, and meal titles. ` +
        'Call this before drafting a new plan so you avoid repeating recent meals (unless the user asks for a repeat). ' +
        'Filter by status to see the upcoming queue or completed history, or set favoritesOnly for the plans the household loved.',
      inputSchema: {
        status: z.union([planStatusSchema, z.string()]).optional(),
        favoritesOnly: z.union([z.boolean(), z.string()]).optional(),
        limit: z.union([z.number(), z.string()]).default(6),
      },
    },
    ({ status, favoritesOnly, limit }) => {
      try {
        const parsedStatus =
          typeof status === 'string' && status.trim() !== ''
            ? planStatusSchema.parse(status.trim().toLowerCase())
            : undefined;
        return textResult(
          listPlans(db, {
            status: parsedStatus,
            favoritesOnly: favoritesOnly === true || favoritesOnly === 'true',
            limit: Math.min(Math.max(toInt(limit, 6), 1), 50),
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_meal_plan',
    {
      title: 'Get a meal plan',
      description:
        'Fetch one meal plan by planId — name, status, and every meal with its type and recipeId. Returns null if the plan does not exist.',
      inputSchema: { planId: z.union([z.number(), z.string()]) },
    },
    ({ planId }) => {
      try {
        return textResult(getPlan(db, toInt(planId)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_active_meal_plan',
    {
      title: 'Get the active meal plan',
      description:
        'Fetch the plan the household is cooking from right now. Returns null when nothing is active — offer to activate an upcoming plan or push a new one.',
      inputSchema: {},
    },
    () => textResult(getActivePlan(db)),
  );

  server.registerTool(
    'activate_meal_plan',
    {
      title: 'Activate a meal plan',
      description:
        "Make an upcoming (or completed) plan the household's active plan. Fails while another plan is active — complete that one first (complete_meal_plan). Only call when the user asks to switch plans.",
      inputSchema: { planId: z.union([z.number(), z.string()]) },
    },
    ({ planId }) => {
      try {
        return textResult(activatePlan(db, toInt(planId)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'complete_meal_plan',
    {
      title: 'Complete a meal plan',
      description:
        'Mark a plan as completed (cooked through / done with it). Omit planId to complete the currently active plan. Only call when the user says they are done with it.',
      inputSchema: { planId: z.union([z.number(), z.string()]).optional() },
    },
    ({ planId }) => {
      try {
        if (planId != null && planId !== '') {
          return textResult(completePlan(db, toInt(planId)));
        }
        const active = getActivePlan(db);
        if (!active) return errorResult(new Error('No active meal plan to complete.'));
        return textResult(completePlan(db, active.planId));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_favorites',
    {
      title: 'List favorite recipes',
      description:
        'List the household\'s favorited recipes (id, title, tags, mealTypes). Use when the user asks for "one of my favorites". Favoriting happens in the app UI, not over MCP.',
      inputSchema: {},
    },
    () => textResult(listFavorites(db)),
  );

  server.registerTool(
    'search_recipes',
    {
      title: 'Search past recipes',
      description:
        "Search all past recipes by title, tag, or ingredient (case-insensitive substring match). Returns the newest matches with ids that can be reused via push_meal_plan's recipeId.",
      inputSchema: { query: z.string().min(2) },
    },
    ({ query }) => textResult(listRecipes(db, { query, limit: 20 })),
  );

  server.registerTool(
    'get_recipe',
    {
      title: 'Get a full recipe',
      description:
        'Fetch a full recipe by id — ingredients, step-by-step markdown, tags, meal types, and which plans it was cooked in. Use before reusing a recipe so you can confirm it with the user.',
      inputSchema: { recipeId: z.union([z.number(), z.string()]) },
    },
    ({ recipeId }) => {
      try {
        const id = toInt(recipeId);
        const recipe = getRecipe(db, id);
        if (!recipe) return errorResult(new Error(`Recipe ${id} does not exist.`));
        return textResult(recipe);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
