import { and, desc, eq, inArray, like, or } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { mealPlans, meals, recipeIngredients, recipes } from '../../db/schema';

export interface RecipeSummary {
  id: number;
  title: string;
  description: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  tags: string[];
  isFavorite: boolean;
  createdAt: Date;
}

export interface RecipeIngredientRow {
  id: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  section: string;
  sortOrder: number;
}

export interface RecipeDetail extends RecipeSummary {
  stepsMarkdown: string;
  ingredients: RecipeIngredientRow[];
  usedInWeeks: string[];
}

function toSummary(row: typeof recipes.$inferSelect): RecipeSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    tags: row.tags,
    isFavorite: row.isFavorite,
    createdAt: row.createdAt,
  };
}

export function listRecipes(
  db: Db,
  options: {
    query?: string | undefined;
    favoritesOnly?: boolean | undefined;
    limit?: number | undefined;
  } = {},
): RecipeSummary[] {
  const limit = options.limit ?? 50;
  const query = options.query?.trim();

  let matchingIds: number[] | null = null;
  if (query && query.length > 0) {
    const pattern = `%${query}%`;
    const byIngredient = db
      .select({ recipeId: recipeIngredients.recipeId })
      .from(recipeIngredients)
      .where(like(recipeIngredients.name, pattern))
      .all()
      .map((r) => r.recipeId);
    const byText = db
      .select({ id: recipes.id })
      .from(recipes)
      .where(or(like(recipes.title, pattern), like(recipes.tags, pattern)))
      .all()
      .map((r) => r.id);
    matchingIds = [...new Set([...byText, ...byIngredient])];
    if (matchingIds.length === 0) return [];
  }

  const conditions = [
    ...(options.favoritesOnly ? [eq(recipes.isFavorite, true)] : []),
    ...(matchingIds !== null ? [inArray(recipes.id, matchingIds)] : []),
  ];

  return db
    .select()
    .from(recipes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(recipes.createdAt))
    .limit(limit)
    .all()
    .map(toSummary);
}

export function getRecipe(db: Db, id: number): RecipeDetail | null {
  const recipe = db.select().from(recipes).where(eq(recipes.id, id)).get();
  if (!recipe) return null;
  const ingredients = db
    .select({
      id: recipeIngredients.id,
      name: recipeIngredients.name,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      section: recipeIngredients.section,
      sortOrder: recipeIngredients.sortOrder,
    })
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(recipeIngredients.sortOrder)
    .all();
  const usedInWeeks = db
    .select({ weekStart: mealPlans.weekStart })
    .from(meals)
    .innerJoin(mealPlans, eq(meals.planId, mealPlans.id))
    .where(eq(meals.recipeId, id))
    .orderBy(desc(mealPlans.weekStart))
    .all()
    .map((r) => r.weekStart);
  return { ...toSummary(recipe), stepsMarkdown: recipe.stepsMarkdown, ingredients, usedInWeeks };
}

export function toggleFavorite(db: Db, id: number): RecipeSummary {
  const recipe = db.select().from(recipes).where(eq(recipes.id, id)).get();
  if (!recipe) {
    throw new Error(`Recipe ${id} does not exist.`);
  }
  const updated = db
    .update(recipes)
    .set({ isFavorite: !recipe.isFavorite, updatedAt: new Date() })
    .where(eq(recipes.id, id))
    .returning()
    .get();
  return toSummary(updated);
}

export function listFavorites(db: Db): RecipeSummary[] {
  return listRecipes(db, { favoritesOnly: true, limit: 200 });
}
