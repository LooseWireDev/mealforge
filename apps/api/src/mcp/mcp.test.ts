import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app';
import { createDb, type Db } from '../db/client';

const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2025-06-18',
};

let requestId = 0;

async function rpc(app: Hono, method: string, params?: unknown): Promise<unknown> {
  requestId += 1;
  const res = await app.request('/mcp', {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
  });
  expect(res.status).toBe(200);
  const text = await res.text();
  // streamable-http responses may arrive as SSE or plain JSON
  const dataLine = text
    .split('\n')
    .find((line) => line.startsWith('data:'))
    ?.slice(5)
    .trim();
  const jsonLine = dataLine ?? text;
  const parsed = JSON.parse(jsonLine) as { result?: unknown; error?: { message: string } };
  if (parsed.error) throw new Error(parsed.error.message);
  return parsed.result;
}

function samplePlan(name?: string): unknown {
  return {
    ...(name !== undefined ? { name } : {}),
    meals: [
      {
        mealType: 'dinner',
        recipe: {
          title: 'Cast Iron Roast Chicken',
          description: 'Whole chicken over root vegetables.',
          servings: 4,
          prepMinutes: 15,
          cookMinutes: 75,
          tags: ['sunday', 'whole-foods'],
          stepsMarkdown: '1. Preheat to 425°F.\n2. Roast 75 minutes.\n3. Rest and carve.',
          ingredients: [
            { name: 'whole chicken', quantity: 4, unit: 'lb', section: 'meat-seafood' },
            { name: 'carrots', quantity: 4, unit: null, section: 'produce' },
            { name: 'salt', quantity: null, unit: null, section: 'spices' },
          ],
        },
      },
      {
        mealType: 'breakfast',
        recipe: {
          title: 'Zucchini Frittata',
          description: 'Eggs for a slow morning.',
          servings: 4,
          prepMinutes: 10,
          cookMinutes: 20,
          tags: ['eggs', 'quick'],
          stepsMarkdown: '1. Whisk eggs.\n2. Bake in the skillet.',
          ingredients: [
            { name: 'eggs', quantity: 8, unit: null, section: 'dairy-eggs' },
            { name: 'zucchini', quantity: 2, unit: null, section: 'produce' },
            { name: 'salt', quantity: null, unit: null, section: 'spices' },
          ],
        },
      },
    ],
  };
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

async function callTool(app: Hono, name: string, args: unknown): Promise<ToolCallResult> {
  return (await rpc(app, 'tools/call', { name, arguments: args })) as ToolCallResult;
}

function payloadOf<T>(result: ToolCallResult): T {
  return JSON.parse(result.content[0]?.text ?? 'null') as T;
}

interface PlanPayload {
  planId: number;
  name: string | null;
  displayName: string;
  status: string;
  created: boolean;
  meals: Array<{ mealType: string; title: string; recipeId: number }>;
  groceryItemCount: number;
  appUrl: string;
}

describe('MCP endpoint', () => {
  let db: Db;
  let app: Hono;

  beforeEach(async () => {
    db = createDb(':memory:');
    migrate(db, { migrationsFolder: new URL('../db/migrations', import.meta.url).pathname });
    app = buildApp(db);
    await rpc(app, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'vitest', version: '0.0.0' },
    });
  });

  it('lists the ten mealforge tools', async () => {
    const result = (await rpc(app, 'tools/list')) as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      'activate_meal_plan',
      'complete_meal_plan',
      'create_recipe',
      'get_active_meal_plan',
      'get_meal_plan',
      'get_recipe',
      'list_favorites',
      'list_meal_plans',
      'push_meal_plan',
      'search_recipes',
    ]);
  });

  it('push_meal_plan stores the plan and returns a summary with the app url', async () => {
    const result = await callTool(app, 'push_meal_plan', samplePlan('Test Week'));
    expect(result.isError).toBeFalsy();
    const payload = payloadOf<PlanPayload>(result);
    expect(payload.created).toBe(true);
    // an empty kitchen's first plan goes straight to active
    expect(payload.status).toBe('active');
    expect(payload.displayName).toBe('Test Week');
    expect(payload.meals.map((m) => `${m.mealType}:${m.title}`)).toEqual([
      'dinner:Cast Iron Roast Chicken',
      'breakfast:Zucchini Frittata',
    ]);
    // chicken, carrots, salt (deduped), eggs, zucchini = 5
    expect(payload.groceryItemCount).toBe(5);
    expect(payload.appUrl).toContain('http');
  });

  it('second push lands as upcoming; lifecycle tools promote and complete', async () => {
    const first = payloadOf<PlanPayload>(await callTool(app, 'push_meal_plan', samplePlan()));
    const second = payloadOf<PlanPayload>(
      await callTool(app, 'push_meal_plan', {
        meals: [{ mealType: 'dinner', recipeId: first.meals[0]?.recipeId }],
      }),
    );
    expect(second.status).toBe('upcoming');

    // activating over an active plan fails with a pointer to the blocker
    const blocked = await callTool(app, 'activate_meal_plan', { planId: second.planId });
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0]?.text).toContain('already active');

    // complete the active plan (no planId = active one), then promote
    const completed = payloadOf<PlanPayload>(await callTool(app, 'complete_meal_plan', {}));
    expect(completed.planId).toBe(first.planId);
    expect(completed.status).toBe('completed');

    const promoted = payloadOf<PlanPayload>(
      await callTool(app, 'activate_meal_plan', { planId: String(second.planId) }),
    );
    expect(promoted.status).toBe('active');

    const active = payloadOf<PlanPayload>(await callTool(app, 'get_active_meal_plan', {}));
    expect(active.planId).toBe(second.planId);
  });

  it('push with planId revises a plan in place', async () => {
    const first = payloadOf<PlanPayload>(
      await callTool(app, 'push_meal_plan', samplePlan('Original')),
    );
    const revised = payloadOf<PlanPayload>(
      await callTool(app, 'push_meal_plan', {
        planId: String(first.planId),
        meals: [{ mealType: 'dinner', recipeId: first.meals[0]?.recipeId }],
      }),
    );
    expect(revised.created).toBe(false);
    expect(revised.planId).toBe(first.planId);
    expect(revised.name).toBe('Original');
    expect(revised.meals).toHaveLength(1);
  });

  it('recall tools see pushed data', async () => {
    await callTool(app, 'push_meal_plan', samplePlan('Recall Week'));

    const listed = await callTool(app, 'list_meal_plans', { limit: 4 });
    const plans = payloadOf<Array<{ planId: number; displayName: string; status: string }>>(listed);
    expect(plans[0]?.displayName).toBe('Recall Week');
    expect(plans[0]?.status).toBe('active');

    const byId = await callTool(app, 'get_meal_plan', { planId: plans[0]?.planId });
    expect(payloadOf<PlanPayload>(byId).displayName).toBe('Recall Week');

    const search = await callTool(app, 'search_recipes', { query: 'frittata' });
    const found = payloadOf<Array<{ id: number }>>(search);
    expect(found).toHaveLength(1);

    const detail = await callTool(app, 'get_recipe', { recipeId: found[0]?.id as number });
    const full = payloadOf<{
      stepsMarkdown: string;
      mealTypes: string[];
      usedInPlans: Array<{ displayName: string }>;
    }>(detail);
    expect(full.stepsMarkdown).toContain('Whisk eggs');
    expect(full.mealTypes).toEqual(['breakfast']);
    expect(full.usedInPlans.map((u) => u.displayName)).toEqual(['Recall Week']);
  });

  it('list_meal_plans filters by status', async () => {
    const first = payloadOf<PlanPayload>(await callTool(app, 'push_meal_plan', samplePlan()));
    await callTool(app, 'push_meal_plan', {
      meals: [{ mealType: 'dinner', recipeId: first.meals[0]?.recipeId }],
    });

    const upcoming = payloadOf<Array<{ status: string }>>(
      await callTool(app, 'list_meal_plans', { status: 'upcoming' }),
    );
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]?.status).toBe('upcoming');
  });

  it('accepts numbers sent as strings and fraction quantities (small-model wire format)', async () => {
    // regression: MiniMax-M3 sends every number inside the nested recipe as a
    // string, which a strict published schema rejects client-side in LibreChat
    const result = await callTool(app, 'push_meal_plan', {
      meals: [
        {
          mealType: 'Dinner',
          recipe: {
            title: 'Shrimp Scampi',
            description: 'Garlic butter shrimp.',
            servings: '4',
            prepMinutes: '10',
            cookMinutes: '15',
            tags: ['seafood'],
            stepsMarkdown: '1. Cook it.',
            ingredients: [
              { name: 'shrimp', quantity: '1.5', unit: 'lb', section: 'meat-seafood' },
              { name: 'butter', quantity: '1/2', unit: 'cup', section: 'dairy-eggs' },
              { name: 'kosher salt', quantity: null, unit: null, section: 'spices' },
            ],
          },
        },
      ],
    });
    expect(result.isError).toBeFalsy();
    const payload = payloadOf<PlanPayload>(result);
    expect(payload.meals[0]?.title).toBe('Shrimp Scampi');
    // wrong-case meal types are canonicalized
    expect(payload.meals[0]?.mealType).toBe('dinner');
    expect(payload.groceryItemCount).toBe(3);
  });

  it('tolerates double-wrapped arrays (small-model wire format)', async () => {
    // regression: MiniMax-M3 also sends tags/ingredients as nested arrays
    const result = await callTool(app, 'push_meal_plan', {
      meals: [
        {
          recipe: {
            title: 'Nested Arrays',
            servings: 4,
            stepsMarkdown: '1. Cook.',
            tags: [['seafood', 'pasta']],
            ingredients: [
              [
                { name: 'shrimp', quantity: 1, unit: 'lb', section: 'meat-seafood' },
                { name: 'linguine', quantity: 1, unit: 'lb', section: 'pantry' },
              ],
            ],
          },
        },
      ],
    });
    expect(result.isError).toBeFalsy();
    expect(payloadOf<PlanPayload>(result).groceryItemCount).toBe(2);
  });

  it('create_recipe returns a recipeId usable by push_meal_plan', async () => {
    const created = await callTool(app, 'create_recipe', {
      title: 'Standalone Carnitas',
      description: 'Made via create_recipe.',
      servings: '6',
      prepMinutes: '15',
      cookMinutes: '480',
      tags: ['slow-cooker'],
      mealTypes: ['Dinner', 'lunch'],
      stepsMarkdown: '1. Slow cook.\n2. Broil.',
      ingredients: [{ name: 'pork shoulder', quantity: '3', unit: 'lb', section: 'meat-seafood' }],
    });
    expect(created.isError).toBeFalsy();
    const { recipeId } = payloadOf<{ recipeId: number }>(created);
    expect(recipeId).toBeGreaterThan(0);

    const pushed = await callTool(app, 'push_meal_plan', {
      name: 'Carnitas Night',
      meals: [{ mealType: 'dinner', recipeId }],
    });
    expect(pushed.isError).toBeFalsy();
    expect(payloadOf<PlanPayload>(pushed).meals[0]?.title).toBe('Standalone Carnitas');
  });

  it('canonicalizes section names and ignores unknown extra keys', async () => {
    const result = await callTool(app, 'push_meal_plan', {
      meals: [
        {
          notes: 'extra key models like to add',
          recipe: {
            title: 'Section Variants',
            servings: 4,
            stepsMarkdown: '1. Cook.',
            difficulty: 'easy',
            ingredients: [
              { name: 'steak', quantity: 1, unit: 'lb', section: 'Meat & Seafood' },
              { name: 'cheddar', quantity: 8, unit: 'oz', section: 'DAIRY EGGS' },
            ],
          },
        },
      ],
    });
    expect(result.isError).toBeFalsy();
    expect(payloadOf<PlanPayload>(result).groceryItemCount).toBe(2);
  });

  it('missing required recipe fields produce a path error with a valid example', async () => {
    const result = await callTool(app, 'push_meal_plan', {
      meals: [
        {
          recipe: {
            title: 'No Steps',
            ingredients: [{ name: 'x', quantity: 1, unit: 'lb', section: 'pantry' }],
          },
        },
      ],
    });
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('stepsMarkdown');
    expect(text).toContain('Valid example:');
  });

  it('reports the exact field path when a value cannot be coerced', async () => {
    const result = await callTool(app, 'push_meal_plan', {
      meals: [
        {
          recipe: {
            title: 'Bad Quantity',
            stepsMarkdown: '1. x',
            ingredients: [
              { name: 'flour', quantity: 'a pinch or two', unit: 'cup', section: 'pantry' },
            ],
          },
        },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('meals.0.recipe.ingredients.0.quantity');
  });

  it('rejects an unknown meal type with the valid options', async () => {
    const result = await callTool(app, 'push_meal_plan', {
      meals: [
        {
          mealType: 'brunch',
          recipe: {
            title: 'Brunch Thing',
            stepsMarkdown: '1. x',
            ingredients: [{ name: 'eggs', quantity: 6, unit: null, section: 'dairy-eggs' }],
          },
        },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('meals.0.mealType');
  });

  it('push_meal_plan returns a friendly error for an invalid meal', async () => {
    const result = await callTool(app, 'push_meal_plan', {
      meals: [{ mealType: 'dinner' }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/exactly one/);
  });

  it('complete_meal_plan with nothing active reports it', async () => {
    const result = await callTool(app, 'complete_meal_plan', {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('No active meal plan');
  });
});
