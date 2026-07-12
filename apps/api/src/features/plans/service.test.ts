import type { PushMealPlanInput, RecipeInput } from '@mealforge/shared/schemas';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, migrateDb } from '../../db/client';
import { addManualItem, itemsForPlan, setChecked } from '../grocery/service';
import { getRecipe, listRecipes, toggleFavorite } from '../recipes/service';
import {
  activatePlan,
  completePlan,
  getActivePlan,
  getPlan,
  listPlans,
  pushMealPlan,
  renamePlan,
  togglePlanFavorite,
} from './service';

function testDb(): Db {
  const db = createDb(':memory:');
  migrateDb(db, new URL('../../db/migrations', import.meta.url).pathname);
  return db;
}

function recipe(title: string, overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    title,
    description: `${title} description`,
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ['weeknight'],
    mealTypes: [],
    stepsMarkdown: '1. Cook it.\n2. Eat it.',
    ingredients: [
      { name: 'chicken breast', quantity: 1, unit: 'lb', section: 'meat-seafood' },
      { name: 'olive oil', quantity: 2, unit: 'tbsp', section: 'pantry' },
    ],
    ...overrides,
  };
}

function plan(
  meals: PushMealPlanInput['meals'],
  overrides: Partial<PushMealPlanInput> = {},
): PushMealPlanInput {
  return { meals, ...overrides };
}

function dinner(title: string): PushMealPlanInput['meals'][number] {
  return { mealType: 'dinner', recipe: recipe(title) };
}

describe('pushMealPlan', () => {
  let db: Db;
  beforeEach(() => {
    db = testDb();
  });

  it('creates a plan with recipes, meals, and an aggregated grocery list', () => {
    const result = pushMealPlan(db, plan([dinner('Roast Chicken'), dinner('Chicken Tacos')]));

    expect(result.created).toBe(true);
    expect(result.meals).toHaveLength(2);
    // chicken breast (1lb + 1lb merged) + olive oil (2+2 tbsp merged) = 2 items
    expect(result.groceryItemCount).toBe(2);

    const items = itemsForPlan(db, result.planId);
    const chicken = items.find((i) => i.name === 'chicken breast');
    expect(chicken?.quantityText).toBe('2 lb');
  });

  it('first plan becomes active, later plans queue as upcoming', () => {
    const first = pushMealPlan(db, plan([dinner('A')]));
    expect(first.status).toBe('active');

    const second = pushMealPlan(db, plan([dinner('B')]));
    expect(second.status).toBe('upcoming');
    expect(getActivePlan(db)?.planId).toBe(first.planId);
  });

  it('unnamed plans display as "Meal Plan {id}"; named plans keep their name', () => {
    const unnamed = pushMealPlan(db, plan([dinner('A')]));
    expect(unnamed.name).toBeNull();
    expect(unnamed.displayName).toBe(`Meal Plan ${unnamed.planId}`);

    const named = pushMealPlan(db, plan([dinner('B')], { name: 'Taco Week' }));
    expect(named.displayName).toBe('Taco Week');
  });

  it('a plan can hold multiple meals of the same type and any mix of types', () => {
    const result = pushMealPlan(
      db,
      plan([
        { mealType: 'breakfast', recipe: recipe('Pancakes') },
        { mealType: 'breakfast', recipe: recipe('Omelette') },
        { mealType: 'snack', recipe: recipe('Hummus') },
        dinner('Roast Chicken'),
      ]),
    );
    expect(result.meals.map((m) => m.mealType)).toEqual([
      'breakfast',
      'breakfast',
      'snack',
      'dinner',
    ]);
  });

  it('tags recipes with the meal types they are planned as', () => {
    const result = pushMealPlan(db, plan([{ mealType: 'breakfast', recipe: recipe('Frittata') }]));
    const frittataId = result.meals[0]?.recipeId as number;
    expect(getRecipe(db, frittataId)?.mealTypes).toEqual(['breakfast']);

    // planned again as lunch -> both types, no duplicates
    pushMealPlan(db, plan([{ mealType: 'lunch', recipeId: frittataId }]));
    expect(getRecipe(db, frittataId)?.mealTypes).toEqual(['breakfast', 'lunch']);
  });

  it('rejects a meal with both recipe and recipeId, or neither', () => {
    expect(() => pushMealPlan(db, plan([{ mealType: 'dinner' }]))).toThrow(/exactly one/);
    expect(() =>
      pushMealPlan(db, plan([{ mealType: 'dinner', recipeId: 1, recipe: recipe('X') }])),
    ).toThrow(/exactly one/);
  });

  it('reuses an existing recipe via recipeId', () => {
    const first = pushMealPlan(db, plan([dinner('Roast Chicken')]));
    const savedId = first.meals[0]?.recipeId as number;

    const second = pushMealPlan(db, plan([{ mealType: 'dinner', recipeId: savedId }]));
    expect(second.meals[0]?.title).toBe('Roast Chicken');
    expect(second.meals[0]?.recipeId).toBe(savedId);
  });

  it('rejects an unknown recipeId and an unknown planId', () => {
    expect(() => pushMealPlan(db, plan([{ mealType: 'dinner', recipeId: 999 }]))).toThrow(
      /does not exist/,
    );
    expect(() => pushMealPlan(db, plan([dinner('A')], { planId: 999 }))).toThrow(/does not exist/);
  });

  it('re-push with planId replaces meals and deletes orphaned non-favorite recipes', () => {
    const first = pushMealPlan(db, plan([dinner('Old Meal')]));
    const oldRecipeId = first.meals[0]?.recipeId as number;

    const revised = pushMealPlan(db, plan([dinner('New Meal')], { planId: first.planId }));
    expect(revised.created).toBe(false);
    expect(revised.planId).toBe(first.planId);
    // revising keeps the plan's status rather than re-queueing it
    expect(revised.status).toBe('active');

    expect(getRecipe(db, oldRecipeId)).toBeNull();
    expect(getPlan(db, first.planId)?.meals.map((m) => m.title)).toEqual(['New Meal']);
  });

  it('re-push can name a plan; omitting name keeps the existing one', () => {
    const first = pushMealPlan(db, plan([dinner('A')], { name: 'Original' }));
    const renamed = pushMealPlan(
      db,
      plan([dinner('B')], { planId: first.planId, name: 'Revised' }),
    );
    expect(renamed.name).toBe('Revised');

    const kept = pushMealPlan(db, plan([dinner('C')], { planId: first.planId }));
    expect(kept.name).toBe('Revised');
  });

  it('re-push keeps orphaned recipes that are favorites', () => {
    const first = pushMealPlan(db, plan([dinner('Keeper')]));
    const keeperId = first.meals[0]?.recipeId as number;
    toggleFavorite(db, keeperId);

    pushMealPlan(db, plan([dinner('Other')], { planId: first.planId }));

    expect(getRecipe(db, keeperId)?.title).toBe('Keeper');
  });

  it('re-push keeps recipes still used by another plan', () => {
    const first = pushMealPlan(db, plan([dinner('Shared')]));
    const sharedId = first.meals[0]?.recipeId as number;
    pushMealPlan(db, plan([{ mealType: 'dinner', recipeId: sharedId }]));

    // replace the first plan entirely
    pushMealPlan(db, plan([dinner('Replacement')], { planId: first.planId }));

    expect(getRecipe(db, sharedId)?.title).toBe('Shared');
  });

  it('re-push preserves checked state for unchanged grocery items', () => {
    const first = pushMealPlan(db, plan([dinner('Roast Chicken')]));
    const items = itemsForPlan(db, first.planId);
    const oil = items.find((i) => i.name === 'olive oil');
    setChecked(db, oil?.id as number, true);

    // swap the meal for one that still uses olive oil but a different protein
    pushMealPlan(
      db,
      plan(
        [
          {
            mealType: 'dinner',
            recipe: recipe('Salmon', {
              ingredients: [
                { name: 'salmon', quantity: 1, unit: 'lb', section: 'meat-seafood' },
                { name: 'olive oil', quantity: 1, unit: 'tbsp', section: 'pantry' },
              ],
            }),
          },
        ],
        { planId: first.planId },
      ),
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
    const first = pushMealPlan(db, plan([dinner('Roast Chicken')]));
    addManualItem(db, { planId: first.planId, name: 'paper towels' });

    pushMealPlan(db, plan([dinner('Salmon')], { planId: first.planId }));

    const after = itemsForPlan(db, first.planId);
    expect(after.some((i) => i.name === 'paper towels' && i.isManual)).toBe(true);
  });
});

describe('plan lifecycle', () => {
  let db: Db;
  beforeEach(() => {
    db = testDb();
  });

  it('completing the active plan frees the slot for an upcoming one', () => {
    const first = pushMealPlan(db, plan([dinner('A')]));
    const second = pushMealPlan(db, plan([dinner('B')]));

    const completed = completePlan(db, first.planId);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).not.toBeNull();
    expect(getActivePlan(db)).toBeNull();

    const activated = activatePlan(db, second.planId);
    expect(activated.status).toBe('active');
    expect(getActivePlan(db)?.planId).toBe(second.planId);
  });

  it('refuses to activate while another plan is active', () => {
    pushMealPlan(db, plan([dinner('A')], { name: 'Current' }));
    const second = pushMealPlan(db, plan([dinner('B')]));

    expect(() => activatePlan(db, second.planId)).toThrow(/"Current" is already active/);
  });

  it('activate and complete are idempotent', () => {
    const first = pushMealPlan(db, plan([dinner('A')]));
    expect(activatePlan(db, first.planId).status).toBe('active');

    const completed = completePlan(db, first.planId);
    expect(completePlan(db, first.planId).completedAt).toEqual(completed.completedAt);
  });

  it('a completed plan can be reactivated', () => {
    const first = pushMealPlan(db, plan([dinner('A')]));
    completePlan(db, first.planId);

    const reactivated = activatePlan(db, first.planId);
    expect(reactivated.status).toBe('active');
    expect(reactivated.completedAt).toBeNull();
  });

  it('unknown plan ids fail with a friendly error', () => {
    expect(() => activatePlan(db, 42)).toThrow(/does not exist/);
    expect(() => completePlan(db, 42)).toThrow(/does not exist/);
  });
});

describe('naming and favorites', () => {
  let db: Db;
  beforeEach(() => {
    db = testDb();
  });

  it('renames a plan and clears the name back to the default', () => {
    const p = pushMealPlan(db, plan([dinner('A')]));
    expect(renamePlan(db, p.planId, 'Comfort Food Week').displayName).toBe('Comfort Food Week');

    const cleared = renamePlan(db, p.planId, null);
    expect(cleared.name).toBeNull();
    expect(cleared.displayName).toBe(`Meal Plan ${p.planId}`);
  });

  it('favoriting requires a name', () => {
    const unnamed = pushMealPlan(db, plan([dinner('A')]));
    expect(() => togglePlanFavorite(db, unnamed.planId)).toThrow(/Name this plan/);

    renamePlan(db, unnamed.planId, 'Keeper Week');
    expect(togglePlanFavorite(db, unnamed.planId).isFavorite).toBe(true);
  });

  it('a favorite plan cannot lose its name until unfavorited', () => {
    const p = pushMealPlan(db, plan([dinner('A')], { name: 'Named' }));
    togglePlanFavorite(db, p.planId);

    expect(() => renamePlan(db, p.planId, null)).toThrow(/favorite plan needs a name/);

    togglePlanFavorite(db, p.planId); // unfavorite
    expect(renamePlan(db, p.planId, null).name).toBeNull();
  });
});

describe('recall', () => {
  let db: Db;
  beforeEach(() => {
    db = testDb();
  });

  it('listPlans filters by status and favorites', () => {
    const first = pushMealPlan(db, plan([dinner('A')], { name: 'Done Week' }));
    const second = pushMealPlan(db, plan([dinner('B')]));
    pushMealPlan(db, plan([dinner('C')]));
    completePlan(db, first.planId);
    togglePlanFavorite(db, first.planId);
    activatePlan(db, second.planId);

    expect(listPlans(db).map((p) => p.planId)).toHaveLength(3);
    expect(listPlans(db, { status: 'upcoming' }).map((p) => p.meals[0]?.title)).toEqual(['C']);
    expect(listPlans(db, { status: 'completed' })[0]?.planId).toBe(first.planId);
    expect(listPlans(db, { favoritesOnly: true }).map((p) => p.displayName)).toEqual(['Done Week']);
  });

  it('getPlan returns meals in pushed order with their types', () => {
    const p = pushMealPlan(
      db,
      plan([
        { mealType: 'breakfast', recipe: recipe('Pancakes') },
        dinner('Roast Chicken'),
        { mealType: 'snack', recipe: recipe('Hummus') },
      ]),
    );
    const fetched = getPlan(db, p.planId);
    expect(fetched?.meals.map((m) => `${m.mealType}:${m.title}`)).toEqual([
      'breakfast:Pancakes',
      'dinner:Roast Chicken',
      'snack:Hummus',
    ]);
    expect(getPlan(db, 999)).toBeNull();
  });

  it('getRecipe reports the plans a recipe was used in', () => {
    const first = pushMealPlan(db, plan([dinner('Carnitas')], { name: 'Taco Week' }));
    const carnitasId = first.meals[0]?.recipeId as number;
    pushMealPlan(db, plan([{ mealType: 'dinner', recipeId: carnitasId }]));

    const detail = getRecipe(db, carnitasId);
    expect(detail?.usedInPlans).toHaveLength(2);
    expect(detail?.usedInPlans.some((u) => u.displayName === 'Taco Week')).toBe(true);
  });

  it('listRecipes searches by title, tag, and ingredient, and filters by meal type', () => {
    pushMealPlan(
      db,
      plan([
        {
          mealType: 'dinner',
          recipe: recipe('Carnitas Tacos', { tags: ['mexican', 'slow-cooker'] }),
        },
        { mealType: 'breakfast', recipe: recipe('Breakfast Burrito') },
      ]),
    );

    expect(listRecipes(db, { query: 'carnitas' })).toHaveLength(1);
    expect(listRecipes(db, { query: 'slow-cooker' })).toHaveLength(1);
    expect(listRecipes(db, { query: 'chicken breast' }).length).toBeGreaterThanOrEqual(1);
    expect(listRecipes(db, { query: 'zzz-nothing' })).toHaveLength(0);
    expect(listRecipes(db, { mealType: 'breakfast' }).map((r) => r.title)).toEqual([
      'Breakfast Burrito',
    ]);
  });
});
