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

function sampleWeek(weekStart: string): unknown {
  return {
    weekStart,
    meals: [
      {
        dayOfWeek: 0,
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
        dayOfWeek: 2,
        mealType: 'dinner',
        recipe: {
          title: 'Salmon with Zucchini',
          description: 'Pan-seared salmon.',
          servings: 4,
          prepMinutes: 10,
          cookMinutes: 20,
          tags: ['fish', 'quick'],
          stepsMarkdown: '1. Sear salmon.\n2. Sauté zucchini.',
          ingredients: [
            { name: 'salmon fillets', quantity: 1.5, unit: 'lb', section: 'meat-seafood' },
            { name: 'zucchini', quantity: 3, unit: null, section: 'produce' },
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

  it('lists the six mealforge tools', async () => {
    const result = (await rpc(app, 'tools/list')) as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      'get_meal_plan_for_week',
      'get_recent_meal_plans',
      'get_recipe',
      'list_favorites',
      'push_meal_plan',
      'search_recipes',
    ]);
  });

  it('push_meal_plan stores the week and returns a summary with the app url', async () => {
    const result = await callTool(app, 'push_meal_plan', sampleWeek('2026-07-06'));
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      created: boolean;
      meals: Array<{ title: string }>;
      groceryItemCount: number;
      appUrl: string;
    };
    expect(payload.created).toBe(true);
    expect(payload.meals.map((m) => m.title)).toEqual([
      'Cast Iron Roast Chicken',
      'Salmon with Zucchini',
    ]);
    // carrots, zucchini, chicken, salmon, salt (deduped) = 5
    expect(payload.groceryItemCount).toBe(5);
    expect(payload.appUrl).toContain('http');
  });

  it('recall tools see pushed data', async () => {
    await callTool(app, 'push_meal_plan', sampleWeek('2026-07-06'));

    const recent = await callTool(app, 'get_recent_meal_plans', { limit: 4 });
    const plans = JSON.parse(recent.content[0]?.text ?? '[]') as Array<{ weekStart: string }>;
    expect(plans[0]?.weekStart).toBe('2026-07-06');

    const search = await callTool(app, 'search_recipes', { query: 'salmon' });
    const found = JSON.parse(search.content[0]?.text ?? '[]') as Array<{ id: number }>;
    expect(found).toHaveLength(1);

    const detail = await callTool(app, 'get_recipe', { recipeId: found[0]?.id as number });
    const full = JSON.parse(detail.content[0]?.text ?? '{}') as {
      stepsMarkdown: string;
      usedInWeeks: string[];
    };
    expect(full.stepsMarkdown).toContain('Sear salmon');
    expect(full.usedInWeeks).toEqual(['2026-07-06']);
  });

  it('accepts numbers sent as strings and fraction quantities (small-model wire format)', async () => {
    // regression: MiniMax-M3 sends every number inside the nested recipe as a
    // string, which a strict published schema rejects client-side in LibreChat
    const result = await callTool(app, 'push_meal_plan', {
      weekStart: '2026-07-13',
      meals: [
        {
          dayOfWeek: '0',
          mealType: 'dinner',
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
    const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
      meals: Array<{ title: string }>;
      groceryItemCount: number;
    };
    expect(payload.meals[0]?.title).toBe('Shrimp Scampi');
    expect(payload.groceryItemCount).toBe(3);
  });

  it('reports the exact field path when a value cannot be coerced', async () => {
    const result = await callTool(app, 'push_meal_plan', {
      weekStart: '2026-07-13',
      meals: [
        {
          dayOfWeek: 0,
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

  it('push_meal_plan returns a friendly error for an invalid meal', async () => {
    const result = await callTool(app, 'push_meal_plan', {
      weekStart: '2026-07-06',
      meals: [{ dayOfWeek: 0, mealType: 'dinner' }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/exactly one/);
  });
});
