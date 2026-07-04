import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { Db } from '../db/client';
import { getPlanByWeek, getRecentPlans, pushMealPlan } from '../features/plans/service';
import { createRecipe, getRecipe, listFavorites, listRecipes } from '../features/recipes/service';
import {
  formatZodIssues,
  normalizePush,
  normalizeRecipe,
  pushWireShape,
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

// A fresh server is created per request (stateless streamable-http), so
// registration cost must stay trivial — these are thin wrappers over the
// same service layer the web app's tRPC routers use.
export function createMcpServer(db: Db): McpServer {
  const server = new McpServer({ name: 'mealforge', version: '1.0.0' });

  server.registerTool(
    'push_meal_plan',
    {
      title: 'Push a weekly meal plan',
      description:
        'Push a FINALIZED weekly meal plan to the mealforge app. Only call this after the user has explicitly confirmed the plan is final — never push drafts. ' +
        'RECOMMENDED FLOW: first save each new recipe with create_recipe, then call this tool with small meals entries that reference recipeId only. ' +
        'Inline "recipe" objects are also accepted for each meal, but keep those payloads small. ' +
        'The grocery list is derived automatically from the recipes’ structured ingredients, so ingredient quantities, units, and store sections must be accurate. ' +
        'Re-pushing the same weekStart replaces that week’s meals and regenerates the grocery list; unchanged items keep their checked-off state. ' +
        'Returns the plan summary and the app URL to share with the user.',
      inputSchema: pushWireShape,
    },
    (input) => {
      try {
        const result = pushMealPlan(db, normalizePush(input));
        return textResult({ ...result, appUrl: appUrl() });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return errorResult(new Error(formatZodIssues(error)));
        }
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'create_recipe',
    {
      title: 'Create a recipe',
      description:
        'Save one new recipe and get back its recipeId. Preferred way to build a meal plan: create each recipe individually (small, flat payloads), then call push_meal_plan once with recipeId references. The recipe is stored immediately and reusable in any week. Returns the recipeId.',
      inputSchema: recipeWireShape,
    },
    (input) => {
      try {
        const recipe = createRecipe(db, normalizeRecipe(input));
        return textResult({
          recipeId: recipe.id,
          title: recipe.title,
          next: 'Reference this recipeId in push_meal_plan when the user confirms the week.',
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return errorResult(new Error(formatZodIssues(error)));
        }
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_recent_meal_plans',
    {
      title: 'List recent meal plans',
      description:
        'List the most recent weekly meal plans with their meal titles and recipe ids. Call this before drafting a new week so you avoid repeating recent meals (unless the user asks for a repeat).',
      inputSchema: { limit: z.union([z.number(), z.string()]).default(4) },
    },
    ({ limit }) => textResult(getRecentPlans(db, Math.min(Math.max(toInt(limit, 4), 1), 12))),
  );

  server.registerTool(
    'get_meal_plan_for_week',
    {
      title: 'Get the meal plan for a week',
      description:
        'Fetch the meal plan for a specific week (weekStart = ISO date of that week’s Monday, YYYY-MM-DD). Returns null if no plan exists yet.',
      inputSchema: { weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) },
    },
    ({ weekStart }) => textResult(getPlanByWeek(db, weekStart)),
  );

  server.registerTool(
    'list_favorites',
    {
      title: 'List favorite recipes',
      description:
        'List the household’s favorited recipes (id, title, tags). Use when the user asks for "one of my favorites". Favoriting happens in the app UI, not over MCP.',
      inputSchema: {},
    },
    () => textResult(listFavorites(db)),
  );

  server.registerTool(
    'search_recipes',
    {
      title: 'Search past recipes',
      description:
        'Search all past recipes by title, tag, or ingredient (case-insensitive substring match). Returns the newest matches with ids that can be reused via push_meal_plan’s recipeId.',
      inputSchema: { query: z.string().min(2) },
    },
    ({ query }) => textResult(listRecipes(db, { query, limit: 20 })),
  );

  server.registerTool(
    'get_recipe',
    {
      title: 'Get a full recipe',
      description:
        'Fetch a full recipe by id — ingredients, step-by-step markdown, tags, and which weeks it was cooked. Use before reusing a recipe so you can confirm it with the user.',
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
