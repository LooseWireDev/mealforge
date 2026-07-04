import type { PushMealPlanInput, RecipeInput } from '@mealforge/shared/schemas';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db } from '../../db/client';
import { addManualItem, itemsForPlan, setChecked } from '../grocery/service';
import { getRecipe, listRecipes, toggleFavorite } from '../recipes/service';
import { getPlanByWeek, getRecentPlans, pushMealPlan } from './service';

function testDb(): Db {
  const db = createDb(':memory:');
  migrate(db, { migrationsFolder: new URL('../../db/migrations', import.meta.url).pathname });
  return db;
}

function recipe(title: string, overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    title,
    description: `${title} description`,
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ['dinner'],
    stepsMarkdown: '1. Cook it.\n2. Eat it.',
    ingredients: [
      { name: 'chicken breast', quantity: 1, unit: 'lb', section: 'meat-seafood' },
      { name: 'olive oil', quantity: 2, unit: 'tbsp', section: 'pantry' },
    ],
    ...overrides,
  };
}

function week(meals: PushMealPlanInput['meals'], weekStart = '2026-07-06'): PushMealPlanInput {
  return { weekStart, meals };
}

describe('pushMealPlan', () => {
  let db: Db;
  beforeEach(() => {
    db = testDb();
  });

  it('creates a plan with recipes, meals, and an aggregated grocery list', () => {
    const result = pushMealPlan(
      db,
      week([
        { dayOfWeek: 0, mealType: 'dinner', recipe: recipe('Roast Chicken') },
        { dayOfWeek: 1, mealType: 'dinner', recipe: recipe('Chicken Tacos') },
      ]),
    );

    expect(result.created).toBe(true);
    expect(result.meals).toHaveLength(2);
    // chicken breast (1lb + 1lb merged) + olive oil (2+2 tbsp merged) = 2 items
    expect(result.groceryItemCount).toBe(2);

    const items = itemsForPlan(db, result.planId);
    const chicken = items.find((i) => i.name === 'chicken breast');
    expect(chicken?.quantityText).toBe('2 lb');
  });

  it('rejects a meal with both recipe and recipeId, or neither', () => {
    expect(() => pushMealPlan(db, week([{ dayOfWeek: 0, mealType: 'dinner' }]))).toThrow(
      /exactly one/,
    );
    expect(() =>
      pushMealPlan(
        db,
        week([{ dayOfWeek: 0, mealType: 'dinner', recipeId: 1, recipe: recipe('X') }]),
      ),
    ).toThrow(/exactly one/);
  });

  it('reuses an existing recipe via recipeId', () => {
    const first = pushMealPlan(
      db,
      week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('Roast Chicken') }]),
    );
    const savedId = first.meals[0]?.recipeId as number;

    const second = pushMealPlan(
      db,
      week([{ dayOfWeek: 2, mealType: 'dinner', recipeId: savedId }], '2026-07-13'),
    );
    expect(second.meals[0]?.title).toBe('Roast Chicken');
    expect(second.meals[0]?.recipeId).toBe(savedId);
  });

  it('rejects an unknown recipeId', () => {
    expect(() =>
      pushMealPlan(db, week([{ dayOfWeek: 0, mealType: 'dinner', recipeId: 999 }])),
    ).toThrow(/does not exist/);
  });

  it('re-push replaces meals and deletes orphaned non-favorite recipes', () => {
    const first = pushMealPlan(
      db,
      week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('Old Meal') }]),
    );
    const oldRecipeId = first.meals[0]?.recipeId as number;

    pushMealPlan(db, week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('New Meal') }]));

    expect(getRecipe(db, oldRecipeId)).toBeNull();
    const plan = getPlanByWeek(db, '2026-07-06');
    expect(plan?.meals.map((m) => m.title)).toEqual(['New Meal']);
  });

  it('re-push keeps orphaned recipes that are favorites', () => {
    const first = pushMealPlan(
      db,
      week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('Keeper') }]),
    );
    const keeperId = first.meals[0]?.recipeId as number;
    toggleFavorite(db, keeperId);

    pushMealPlan(db, week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('Other') }]));

    expect(getRecipe(db, keeperId)?.title).toBe('Keeper');
  });

  it('re-push keeps recipes still used by another plan', () => {
    const first = pushMealPlan(
      db,
      week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('Shared') }]),
    );
    const sharedId = first.meals[0]?.recipeId as number;
    pushMealPlan(
      db,
      week([{ dayOfWeek: 0, mealType: 'dinner', recipeId: sharedId }], '2026-07-13'),
    );

    // replace the first week entirely
    pushMealPlan(db, week([{ dayOfWeek: 1, mealType: 'dinner', recipe: recipe('Replacement') }]));

    expect(getRecipe(db, sharedId)?.title).toBe('Shared');
  });

  it('re-push preserves checked state for unchanged grocery items', () => {
    const first = pushMealPlan(
      db,
      week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('Roast Chicken') }]),
    );
    const items = itemsForPlan(db, first.planId);
    const oil = items.find((i) => i.name === 'olive oil');
    setChecked(db, oil?.id as number, true);

    // swap the meal for one that still uses olive oil but a different protein
    pushMealPlan(
      db,
      week([
        {
          dayOfWeek: 0,
          mealType: 'dinner',
          recipe: recipe('Salmon', {
            ingredients: [
              { name: 'salmon', quantity: 1, unit: 'lb', section: 'meat-seafood' },
              { name: 'olive oil', quantity: 1, unit: 'tbsp', section: 'pantry' },
            ],
          }),
        },
      ]),
    );

    const after = itemsForPlan(db, first.planId);
    const oilAfter = after.find((i) => i.name === 'olive oil');
    const salmonAfter = after.find((i) => i.name === 'salmon');
    const chickenAfter = after.find((i) => i.name === 'chicken breast');
    expect(oilAfter?.checked).toBe(true);
    expect(oilAfter?.quantityText).toBe('1 tbsp');
    expect(salmonAfter?.checked).toBe(false);
    expect(chickenAfter).toBeUndefined();
  });

  it('re-push never touches manual grocery items', () => {
    const first = pushMealPlan(
      db,
      week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('Roast Chicken') }]),
    );
    addManualItem(db, { planId: first.planId, name: 'paper towels' });

    pushMealPlan(db, week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('Salmon') }]));

    const after = itemsForPlan(db, first.planId);
    expect(after.some((i) => i.name === 'paper towels' && i.isManual)).toBe(true);
  });
});

describe('recall', () => {
  let db: Db;
  beforeEach(() => {
    db = testDb();
  });

  it('getRecentPlans returns newest weeks first with meal titles', () => {
    pushMealPlan(
      db,
      week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('A') }], '2026-06-29'),
    );
    pushMealPlan(
      db,
      week([{ dayOfWeek: 0, mealType: 'dinner', recipe: recipe('B') }], '2026-07-06'),
    );

    const recent = getRecentPlans(db, 5);
    expect(recent.map((p) => p.weekStart)).toEqual(['2026-07-06', '2026-06-29']);
    expect(recent[0]?.meals[0]?.title).toBe('B');
  });

  it('listRecipes searches by title, tag, and ingredient', () => {
    pushMealPlan(
      db,
      week([
        {
          dayOfWeek: 0,
          mealType: 'dinner',
          recipe: recipe('Carnitas Tacos', { tags: ['mexican', 'slow-cooker'] }),
        },
        { dayOfWeek: 1, mealType: 'dinner', recipe: recipe('Roast Chicken') },
      ]),
    );

    expect(listRecipes(db, { query: 'carnitas' })).toHaveLength(1);
    expect(listRecipes(db, { query: 'slow-cooker' })).toHaveLength(1);
    expect(listRecipes(db, { query: 'chicken breast' }).length).toBeGreaterThanOrEqual(1);
    expect(listRecipes(db, { query: 'zzz-nothing' })).toHaveLength(0);
  });
});
