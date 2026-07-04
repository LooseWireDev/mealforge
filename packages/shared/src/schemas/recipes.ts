import { z } from 'zod';

import { sectionSchema } from './grocery';

// An ingredient as authored by the agent. quantity: null means "to taste";
// unit: null means a bare count ("2 eggs").
export const ingredientInputSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().nullable(),
  unit: z.string().min(1).nullable(),
  section: sectionSchema,
});

export type IngredientInput = z.infer<typeof ingredientInputSchema>;

// A full recipe as authored by the agent (no id — it doesn't exist yet).
export const recipeInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  servings: z.number().int().positive(),
  prepMinutes: z.number().int().nonnegative().nullable(),
  cookMinutes: z.number().int().nonnegative().nullable(),
  tags: z.array(z.string()).default([]),
  stepsMarkdown: z.string().min(1),
  ingredients: z.array(ingredientInputSchema).min(1),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
