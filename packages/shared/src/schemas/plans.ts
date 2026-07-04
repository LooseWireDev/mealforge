import { z } from 'zod';

import { recipeInputSchema } from './recipes';

// ISO date (YYYY-MM-DD). By convention this is the Monday of the week.
export const weekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart must be an ISO date (YYYY-MM-DD)');

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

// One meal slot in a pushed plan: either a brand-new recipe authored by the
// agent, or a reference to a past recipe (recipeId). Exactly one must be set;
// the service enforces this so the MCP tool can report a friendly error.
export const mealInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.string().min(1).default('dinner'),
  recipeId: z.number().int().positive().optional(),
  recipe: recipeInputSchema.optional(),
});

export type MealInput = z.infer<typeof mealInputSchema>;

export const pushMealPlanSchema = z.object({
  weekStart: weekStartSchema,
  meals: z.array(mealInputSchema).min(1),
});

export type PushMealPlanInput = z.infer<typeof pushMealPlanSchema>;
