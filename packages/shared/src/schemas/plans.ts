import { z } from 'zod';

import { mealTypeSchema } from './mealTypes';
import { recipeInputSchema } from './recipes';

// A plan's life: pushed as upcoming (or straight to active when nothing else
// is active), promoted to active — only one at a time — then completed.
export const PLAN_STATUSES = ['upcoming', 'active', 'completed'] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const planStatusSchema = z.enum(PLAN_STATUSES);

// Unnamed plans display as "Meal Plan {id}"; a name is required to favorite.
export const planNameSchema = z.string().trim().min(1).max(80);

// One meal in a pushed plan: either a brand-new recipe authored by the
// agent, or a reference to a past recipe (recipeId). Exactly one must be set;
// the service enforces this so the MCP tool can report a friendly error.
export const mealInputSchema = z.object({
  mealType: mealTypeSchema.default('dinner'),
  recipeId: z.number().int().positive().optional(),
  recipe: recipeInputSchema.optional(),
});

export type MealInput = z.infer<typeof mealInputSchema>;

export const pushMealPlanSchema = z.object({
  // Set planId to revise an existing plan; omit it to create a new one.
  planId: z.number().int().positive().optional(),
  name: planNameSchema.optional(),
  meals: z.array(mealInputSchema).min(1),
});

export type PushMealPlanInput = z.infer<typeof pushMealPlanSchema>;
