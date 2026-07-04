import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';

import type { PushMealPlanInput, StoreSection } from '@mealforge/shared/schemas';

import type { Db } from '../../db/client';
import { groceryItems, mealPlans, meals, recipeIngredients, recipes } from '../../db/schema';
import { aggregateIngredients } from '../grocery/aggregate';

export interface PushedMeal {
  dayOfWeek: number;
  mealType: string;
  recipeId: number;
  title: string;
}

export interface PushMealPlanResult {
  planId: number;
  weekStart: string;
  created: boolean;
  meals: PushedMeal[];
  groceryItemCount: number;
}

export interface PlanSummary {
  planId: number;
  weekStart: string;
  meals: PushedMeal[];
}

export function pushMealPlan(db: Db, input: PushMealPlanInput): PushMealPlanResult {
  for (const meal of input.meals) {
    const hasRecipe = meal.recipe !== undefined;
    const hasRecipeId = meal.recipeId !== undefined;
    if (hasRecipe === hasRecipeId) {
      throw new Error(
        `Meal for day ${meal.dayOfWeek}: provide exactly one of "recipe" (a full new recipe) or "recipeId" (a past recipe to reuse).`,
      );
    }
  }

  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(mealPlans)
      .where(eq(mealPlans.weekStart, input.weekStart))
      .get();

    const plan =
      existing ?? tx.insert(mealPlans).values({ weekStart: input.weekStart }).returning().get();

    const oldMealRows = tx.select().from(meals).where(eq(meals.planId, plan.id)).all();
    const oldRecipeIds = [...new Set(oldMealRows.map((m) => m.recipeId))];
    if (oldMealRows.length > 0) {
      tx.delete(meals).where(eq(meals.planId, plan.id)).run();
    }

    const pushedMeals: PushedMeal[] = [];
    for (const meal of input.meals) {
      let recipeId: number;
      let title: string;
      if (meal.recipeId !== undefined) {
        const recipe = tx.select().from(recipes).where(eq(recipes.id, meal.recipeId)).get();
        if (!recipe) {
          throw new Error(
            `Meal for day ${meal.dayOfWeek}: recipeId ${meal.recipeId} does not exist. Use search_recipes or list_favorites to find valid ids.`,
          );
        }
        recipeId = recipe.id;
        title = recipe.title;
      } else if (meal.recipe !== undefined) {
        const inserted = tx
          .insert(recipes)
          .values({
            title: meal.recipe.title,
            description: meal.recipe.description,
            servings: meal.recipe.servings,
            prepMinutes: meal.recipe.prepMinutes,
            cookMinutes: meal.recipe.cookMinutes,
            tags: meal.recipe.tags,
            stepsMarkdown: meal.recipe.stepsMarkdown,
            source: 'agent',
          })
          .returning()
          .get();
        tx.insert(recipeIngredients)
          .values(
            meal.recipe.ingredients.map((ingredient, i) => ({
              recipeId: inserted.id,
              name: ingredient.name,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
              section: ingredient.section,
              sortOrder: i,
            })),
          )
          .run();
        recipeId = inserted.id;
        title = inserted.title;
      } else {
        throw new Error('unreachable');
      }
      tx.insert(meals)
        .values({
          planId: plan.id,
          recipeId,
          dayOfWeek: meal.dayOfWeek,
          mealType: meal.mealType,
        })
        .run();
      pushedMeals.push({ dayOfWeek: meal.dayOfWeek, mealType: meal.mealType, recipeId, title });
    }

    // Recipes orphaned by this re-push are deleted unless they're favorites
    // or still used by another plan — those stay as browsable history.
    const keptRecipeIds = new Set(pushedMeals.map((m) => m.recipeId));
    const orphanCandidates = oldRecipeIds.filter((id) => !keptRecipeIds.has(id));
    for (const recipeId of orphanCandidates) {
      const recipe = tx.select().from(recipes).where(eq(recipes.id, recipeId)).get();
      if (!recipe || recipe.isFavorite) continue;
      const stillUsed = tx.select().from(meals).where(eq(meals.recipeId, recipeId)).get();
      if (stillUsed) continue;
      tx.delete(recipes).where(eq(recipes.id, recipeId)).run();
    }

    // Regenerate the grocery list, preserving checked state for unchanged
    // items and never touching manual ones.
    const newRecipeIds = [...keptRecipeIds];
    const ingredientRows =
      newRecipeIds.length > 0
        ? tx
            .select()
            .from(recipeIngredients)
            .where(inArray(recipeIngredients.recipeId, newRecipeIds))
            .all()
        : [];
    const aggregated = aggregateIngredients(
      ingredientRows.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        section: row.section as StoreSection,
      })),
    );

    const existingItems = tx
      .select()
      .from(groceryItems)
      .where(and(eq(groceryItems.planId, plan.id), eq(groceryItems.isManual, false)))
      .all();
    const existingByKey = new Map(existingItems.map((item) => [item.normalizedKey, item]));
    const newKeys = aggregated.map((item) => item.normalizedKey);

    for (const item of aggregated) {
      const current = existingByKey.get(item.normalizedKey);
      if (current) {
        tx.update(groceryItems)
          .set({
            name: item.name,
            quantityText: item.quantityText,
            section: item.section,
            sortOrder: item.sortOrder,
          })
          .where(eq(groceryItems.id, current.id))
          .run();
      } else {
        tx.insert(groceryItems)
          .values({
            planId: plan.id,
            name: item.name,
            normalizedKey: item.normalizedKey,
            quantityText: item.quantityText,
            section: item.section,
            sortOrder: item.sortOrder,
          })
          .run();
      }
    }
    const staleFilter = and(
      eq(groceryItems.planId, plan.id),
      eq(groceryItems.isManual, false),
      ...(newKeys.length > 0 ? [notInArray(groceryItems.normalizedKey, newKeys)] : []),
    );
    tx.delete(groceryItems).where(staleFilter).run();

    tx.update(mealPlans).set({ updatedAt: new Date() }).where(eq(mealPlans.id, plan.id)).run();

    const groceryItemCount = tx
      .select()
      .from(groceryItems)
      .where(eq(groceryItems.planId, plan.id))
      .all().length;

    return {
      planId: plan.id,
      weekStart: input.weekStart,
      created: existing === undefined,
      meals: pushedMeals.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
      groceryItemCount,
    };
  });
}

export function getPlanByWeek(db: Db, weekStart: string): PlanSummary | null {
  const plan = db.select().from(mealPlans).where(eq(mealPlans.weekStart, weekStart)).get();
  if (!plan) return null;
  return { planId: plan.id, weekStart: plan.weekStart, meals: mealsForPlan(db, plan.id) };
}

export function getRecentPlans(db: Db, limit: number): PlanSummary[] {
  const plans = db.select().from(mealPlans).orderBy(desc(mealPlans.weekStart)).limit(limit).all();
  return plans.map((plan) => ({
    planId: plan.id,
    weekStart: plan.weekStart,
    meals: mealsForPlan(db, plan.id),
  }));
}

function mealsForPlan(db: Db, planId: number): PushedMeal[] {
  return db
    .select({
      dayOfWeek: meals.dayOfWeek,
      mealType: meals.mealType,
      recipeId: meals.recipeId,
      title: recipes.title,
    })
    .from(meals)
    .innerJoin(recipes, eq(meals.recipeId, recipes.id))
    .where(eq(meals.planId, planId))
    .orderBy(meals.dayOfWeek)
    .all();
}
