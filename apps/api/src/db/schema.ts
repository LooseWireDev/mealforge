import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const recipes = sqliteTable('recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  servings: integer('servings').notNull().default(4),
  prepMinutes: integer('prep_minutes'),
  cookMinutes: integer('cook_minutes'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  // which meal slots the recipe suits ('breakfast' | 'lunch' | 'dinner' |
  // 'snack'); grown automatically from the meal types it gets planned as
  mealTypes: text('meal_types', { mode: 'json' }).$type<string[]>().notNull().default([]),
  stepsMarkdown: text('steps_markdown').notNull(),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  // 'agent' = pushed over MCP, 'manual' = created in the app UI
  source: text('source').notNull().default('agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // null quantity = "to taste"; null unit = bare count ("2 eggs")
  quantity: real('quantity'),
  unit: text('unit'),
  section: text('section').notNull().default('other'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const mealPlans = sqliteTable(
  'meal_plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // null = unnamed; the app shows "Meal Plan {id}". A name is required to
    // favorite a plan.
    name: text('name'),
    // 'upcoming' | 'active' | 'completed'
    status: text('status').notNull().default('upcoming'),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // the household cooks from exactly one plan at a time
    uniqueIndex('meal_plans_one_active').on(t.status).where(sql`${t.status} = 'active'`),
  ],
);

export const meals = sqliteTable('meals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: integer('plan_id')
    .notNull()
    .references(() => mealPlans.id, { onDelete: 'cascade' }),
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipes.id),
  // 'breakfast' | 'lunch' | 'dinner' | 'snack'
  mealType: text('meal_type').notNull().default('dinner'),
  // display order within the plan (the UI groups by meal_type first)
  sortOrder: integer('sort_order').notNull().default(0),
  // null = not cooked yet; set when the household checks the meal off
  cookedAt: integer('cooked_at', { mode: 'timestamp_ms' }),
});

export const groceryItems = sqliteTable(
  'grocery_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    planId: integer('plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // aggregation identity: normalized name + unit family; re-pushes merge on
    // this key so checked-off state survives plan revisions
    normalizedKey: text('normalized_key').notNull(),
    // pre-formatted display quantity ("2 ¼ cups"); empty = "to taste"
    quantityText: text('quantity_text').notNull().default(''),
    section: text('section').notNull().default('other'),
    checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
    isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [unique().on(t.planId, t.normalizedKey)],
);
