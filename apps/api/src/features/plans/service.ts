import type {
  MealType,
  PlanStatus,
  PushMealPlanInput,
  StoreSection,
} from '@mealforge/shared/schemas';
import { planDisplayName } from '@mealforge/shared/utils';
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { groceryItems, mealPlans, meals, recipeIngredients, recipes } from '../../db/schema';
import { aggregateIngredients } from '../grocery/aggregate';

export interface PlanMeal {
  mealId: number;
  mealType: MealType;
  recipeId: number;
  title: string;
  // null = not cooked yet; the check-off that shows what's been made
  cookedAt: Date | null;
}

export interface PlanSummary {
  planId: number;
  name: string | null;
  displayName: string;
  status: PlanStatus;
  isFavorite: boolean;
  createdAt: Date;
  completedAt: Date | null;
  meals: PlanMeal[];
}

export interface PushMealPlanResult extends PlanSummary {
  created: boolean;
  groceryItemCount: number;
}

type PlanRow = typeof mealPlans.$inferSelect;

// Accepts either the db or a transaction handle so helpers work inside
// db.transaction callbacks without casting.
type Queryable = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

function toSummary(plan: PlanRow, planMeals: PlanMeal[]): PlanSummary {
  return {
    planId: plan.id,
    name: plan.name,
    displayName: planDisplayName(plan.name, plan.id),
    status: plan.status as PlanStatus,
    isFavorite: plan.isFavorite,
    createdAt: plan.createdAt,
    completedAt: plan.completedAt,
    meals: planMeals,
  };
}

function getPlanRow(db: Queryable, planId: number): PlanRow {
  const plan = db.select().from(mealPlans).where(eq(mealPlans.id, planId)).get();
  if (!plan) {
    throw new Error(`Meal plan ${planId} does not exist. Use list_meal_plans to find valid ids.`);
  }
  return plan;
}

export function pushMealPlan(db: Db, input: PushMealPlanInput): PushMealPlanResult {
  input.meals.forEach((meal, i) => {
    const hasRecipe = meal.recipe !== undefined;
    const hasRecipeId = meal.recipeId !== undefined;
    if (hasRecipe === hasRecipeId) {
      throw new Error(
        `Meal ${i + 1}: provide exactly one of "recipe" (a full new recipe) or "recipeId" (a past recipe to reuse).`,
      );
    }
  });

  return db.transaction((tx) => {
    let plan: PlanRow;
    const created = input.planId === undefined;
    if (input.planId !== undefined) {
      plan = getPlanRow(tx, input.planId);
    } else {
      // The first plan of an empty kitchen goes straight to active; after
      // that, new plans queue as upcoming until the household promotes them.
      const activeExists =
        tx.select().from(mealPlans).where(eq(mealPlans.status, 'active')).get() !== undefined;
      plan = tx
        .insert(mealPlans)
        .values({ name: input.name ?? null, status: activeExists ? 'upcoming' : 'active' })
        .returning()
        .get();
    }

    const oldMealRows = tx.select().from(meals).where(eq(meals.planId, plan.id)).all();
    const oldRecipeIds = [...new Set(oldMealRows.map((m) => m.recipeId))];
    if (oldMealRows.length > 0) {
      tx.delete(meals).where(eq(meals.planId, plan.id)).run();
    }
    // Meals that survive the revision (same recipe, same slot) keep their
    // cooked check-off — mirrors how grocery items keep their checked state.
    // Each old meal is consumed at most once so duplicates carry over 1:1.
    const unclaimedOldMeals = [...oldMealRows];
    const claimCookedAt = (recipeId: number, mealType: MealType): Date | null => {
      const matches = (m: (typeof oldMealRows)[number]): boolean =>
        m.recipeId === recipeId && m.mealType === mealType;
      // prefer a cooked match so shrinking duplicates never drops a check-off
      let i = unclaimedOldMeals.findIndex((m) => matches(m) && m.cookedAt !== null);
      if (i < 0) i = unclaimedOldMeals.findIndex(matches);
      return i >= 0 ? (unclaimedOldMeals.splice(i, 1)[0]?.cookedAt ?? null) : null;
    };

    const pushedMeals: PlanMeal[] = [];
    input.meals.forEach((meal, i) => {
      let recipeId: number;
      let title: string;
      if (meal.recipeId !== undefined) {
        const recipe = tx.select().from(recipes).where(eq(recipes.id, meal.recipeId)).get();
        if (!recipe) {
          throw new Error(
            `Meal ${i + 1}: recipeId ${meal.recipeId} does not exist. Use search_recipes or list_favorites to find valid ids.`,
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
            mealTypes: meal.recipe.mealTypes,
            stepsMarkdown: meal.recipe.stepsMarkdown,
            source: 'agent',
          })
          .returning()
          .get();
        tx.insert(recipeIngredients)
          .values(
            meal.recipe.ingredients.map((ingredient, j) => ({
              recipeId: inserted.id,
              name: ingredient.name,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
              section: ingredient.section,
              sortOrder: j,
            })),
          )
          .run();
        recipeId = inserted.id;
        title = inserted.title;
      } else {
        throw new Error('unreachable');
      }
      const cookedAt = claimCookedAt(recipeId, meal.mealType);
      const insertedMeal = tx
        .insert(meals)
        .values({ planId: plan.id, recipeId, mealType: meal.mealType, sortOrder: i, cookedAt })
        .returning()
        .get();
      pushedMeals.push({
        mealId: insertedMeal.id,
        mealType: meal.mealType,
        recipeId,
        title,
        cookedAt,
      });
    });

    // Planning a recipe as a meal type tags the recipe with it, so "one of
    // our breakfasts" keeps working without anyone curating tags.
    const typesByRecipe = new Map<number, Set<string>>();
    for (const meal of pushedMeals) {
      const set = typesByRecipe.get(meal.recipeId) ?? new Set();
      set.add(meal.mealType);
      typesByRecipe.set(meal.recipeId, set);
    }
    for (const [recipeId, types] of typesByRecipe) {
      const recipe = tx.select().from(recipes).where(eq(recipes.id, recipeId)).get();
      if (!recipe) continue;
      const merged = [...new Set([...recipe.mealTypes, ...types])].sort();
      if (merged.length !== recipe.mealTypes.length) {
        tx.update(recipes)
          .set({ mealTypes: merged, updatedAt: new Date() })
          .where(eq(recipes.id, recipeId))
          .run();
      }
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

    const updatedPlan = tx
      .update(mealPlans)
      .set({
        updatedAt: new Date(),
        ...(input.name !== undefined ? { name: input.name } : {}),
      })
      .where(eq(mealPlans.id, plan.id))
      .returning()
      .get() as PlanRow;

    const groceryItemCount = tx
      .select()
      .from(groceryItems)
      .where(eq(groceryItems.planId, plan.id))
      .all().length;

    return { ...toSummary(updatedPlan, pushedMeals), created, groceryItemCount };
  });
}

export function getPlan(db: Db, planId: number): PlanSummary | null {
  const plan = db.select().from(mealPlans).where(eq(mealPlans.id, planId)).get();
  if (!plan) return null;
  return toSummary(plan, mealsForPlan(db, plan.id));
}

/** The plan the household is cooking from right now, if any. */
export function getActivePlan(db: Db): PlanSummary | null {
  const plan = db.select().from(mealPlans).where(eq(mealPlans.status, 'active')).get();
  if (!plan) return null;
  return toSummary(plan, mealsForPlan(db, plan.id));
}

export function listPlans(
  db: Db,
  options: {
    status?: PlanStatus | undefined;
    favoritesOnly?: boolean | undefined;
    limit?: number | undefined;
  } = {},
): PlanSummary[] {
  const limit = options.limit ?? 20;
  const conditions = [
    ...(options.status !== undefined ? [eq(mealPlans.status, options.status)] : []),
    ...(options.favoritesOnly ? [eq(mealPlans.isFavorite, true)] : []),
  ];
  // Upcoming plans queue oldest-first (next in line on top); completed plans
  // read newest-first like history; mixed lists follow creation, newest first.
  const order =
    options.status === 'upcoming'
      ? [asc(mealPlans.createdAt), asc(mealPlans.id)]
      : options.status === 'completed'
        ? [desc(mealPlans.completedAt), desc(mealPlans.id)]
        : [desc(mealPlans.createdAt), desc(mealPlans.id)];
  const plans = db
    .select()
    .from(mealPlans)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...order)
    .limit(limit)
    .all();
  return plans.map((plan) => toSummary(plan, mealsForPlan(db, plan.id)));
}

/**
 * Promote an upcoming (or completed) plan to active. Fails while another
 * plan is active — complete that one first, so "what are we cooking?"
 * always has one answer.
 */
export function activatePlan(db: Db, planId: number): PlanSummary {
  return db.transaction((tx) => {
    const plan = getPlanRow(tx, planId);
    if (plan.status === 'active') {
      return toSummary(plan, mealsForPlan(tx, plan.id));
    }
    const active = tx.select().from(mealPlans).where(eq(mealPlans.status, 'active')).get();
    if (active) {
      throw new Error(
        `"${planDisplayName(active.name, active.id)}" is already active. Complete it before activating another plan.`,
      );
    }
    // "Cook it again" means a fresh run: a reactivated completed plan starts
    // with every meal unchecked.
    if (plan.status === 'completed') {
      tx.update(meals).set({ cookedAt: null }).where(eq(meals.planId, plan.id)).run();
    }
    const updated = tx
      .update(mealPlans)
      .set({ status: 'active', completedAt: null, updatedAt: new Date() })
      .where(eq(mealPlans.id, plan.id))
      .returning()
      .get() as PlanRow;
    return toSummary(updated, mealsForPlan(tx, plan.id));
  });
}

export function completePlan(db: Db, planId: number): PlanSummary {
  const plan = getPlanRow(db, planId);
  if (plan.status === 'completed') {
    return toSummary(plan, mealsForPlan(db, plan.id));
  }
  const updated = db
    .update(mealPlans)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(mealPlans.id, plan.id))
    .returning()
    .get() as PlanRow;
  return toSummary(updated, mealsForPlan(db, plan.id));
}

export function renamePlan(db: Db, planId: number, name: string | null): PlanSummary {
  const plan = getPlanRow(db, planId);
  if (name === null && plan.isFavorite) {
    throw new Error('A favorite plan needs a name. Remove it from favorites first.');
  }
  const updated = db
    .update(mealPlans)
    .set({ name, updatedAt: new Date() })
    .where(eq(mealPlans.id, plan.id))
    .returning()
    .get() as PlanRow;
  return toSummary(updated, mealsForPlan(db, plan.id));
}

/** Check a meal off as cooked (or uncheck it). Returns the meal's plan. */
export function setMealCooked(db: Db, mealId: number, cooked: boolean): PlanSummary {
  const meal = db.select().from(meals).where(eq(meals.id, mealId)).get();
  if (!meal) {
    throw new Error(`Meal ${mealId} does not exist.`);
  }
  return db.transaction((tx) => {
    tx.update(meals)
      .set({ cookedAt: cooked ? new Date() : null })
      .where(eq(meals.id, meal.id))
      .run();
    const plan = tx
      .update(mealPlans)
      .set({ updatedAt: new Date() })
      .where(eq(mealPlans.id, meal.planId))
      .returning()
      .get() as PlanRow;
    return toSummary(plan, mealsForPlan(tx, plan.id));
  });
}

export function togglePlanFavorite(db: Db, planId: number): PlanSummary {
  const plan = getPlanRow(db, planId);
  if (!plan.isFavorite && plan.name === null) {
    throw new Error('Name this plan before favoriting it.');
  }
  const updated = db
    .update(mealPlans)
    .set({ isFavorite: !plan.isFavorite, updatedAt: new Date() })
    .where(eq(mealPlans.id, plan.id))
    .returning()
    .get() as PlanRow;
  return toSummary(updated, mealsForPlan(db, plan.id));
}

function mealsForPlan(db: Queryable, planId: number): PlanMeal[] {
  return db
    .select({
      mealId: meals.id,
      mealType: meals.mealType,
      recipeId: meals.recipeId,
      title: recipes.title,
      cookedAt: meals.cookedAt,
    })
    .from(meals)
    .innerJoin(recipes, eq(meals.recipeId, recipes.id))
    .where(eq(meals.planId, planId))
    .orderBy(meals.sortOrder)
    .all()
    .map((row) => ({ ...row, mealType: row.mealType as MealType }));
}
