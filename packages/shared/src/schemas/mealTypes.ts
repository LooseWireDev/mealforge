import { z } from 'zod';

// The fixed set of meal slots a plan can hold and a recipe can be tagged with.
// Extending this list is a code change by design — free-form types would
// fragment grouping in the plan view and filtering in the recipe list.
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export const mealTypeSchema = z.enum(MEAL_TYPES);

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};
