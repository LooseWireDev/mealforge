import {
  type PushMealPlanInput,
  pushMealPlanSchema,
  STORE_SECTIONS,
} from '@mealforge/shared/schemas';
import { z } from 'zod';

/*
 * Wire-format schemas for the MCP boundary.
 *
 * Models — especially smaller ones — routinely send numbers as strings inside
 * nested tool arguments ("prepMinutes": "10"), and MCP clients like LibreChat
 * validate arguments against the published schema *client-side*, so a strict
 * schema rejects those calls before they ever reach this server. The wire
 * schema therefore accepts number-or-string wherever a number is expected and
 * tolerates null/omitted interchangeably for optional fields; normalizePush()
 * coerces to the strict shared schema and any remaining problem is reported
 * back with its exact field path so the model can self-correct.
 */

const wireNumber = z.union([z.number(), z.string()]);
const wireNumberish = z.union([z.number(), z.string(), z.null()]);

const wireIngredient = z.object({
  name: z
    .string()
    .describe(
      'Ingredient name; use identical names across recipes so the grocery list merges them',
    ),
  quantity: wireNumberish
    .optional()
    .describe(
      'Amount as a number (numeric strings like "1.5" or "1/2" are tolerated). Omit or null for to-taste items.',
    ),
  unit: z
    .string()
    .nullable()
    .optional()
    .describe(
      '"lb", "oz", "g", "kg", "cup", "tbsp", "tsp", "clove", "can", "bunch"… Omit or null for countable items ("3 zucchini").',
    ),
  section: z.enum(STORE_SECTIONS).describe('Grocery store section'),
});

const wireRecipe = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  servings: wireNumberish.optional().describe('Defaults to 4'),
  prepMinutes: wireNumberish.optional(),
  cookMinutes: wireNumberish.optional(),
  tags: z.array(z.string()).nullable().optional(),
  stepsMarkdown: z.string().describe('Numbered cooking steps as markdown: "1. …\\n2. …"'),
  ingredients: z.array(wireIngredient).min(1),
});

const wireMeal = z.object({
  dayOfWeek: wireNumber.describe('0 = Monday … 6 = Sunday'),
  mealType: z.string().nullable().optional().describe('Defaults to "dinner"'),
  recipeId: wireNumberish
    .optional()
    .describe(
      'Reuse a past recipe by id (from search_recipes / list_favorites) instead of sending a full recipe',
    ),
  recipe: wireRecipe
    .nullable()
    .optional()
    .describe('A complete new recipe. Provide exactly one of recipe or recipeId.'),
});

export const pushWireShape = {
  weekStart: z.string().describe("ISO date (YYYY-MM-DD) of the week's Monday"),
  meals: z.array(wireMeal).min(1),
};

/** "1.5", "1/2", "1 1/2", 2 → number; ""/null/undefined → null; junk survives for the strict validator to name. */
function toNumberish(value: number | string | null | undefined): number | null | unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const s = value.trim();
  if (s === '') return null;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s);
  return Number.isNaN(n) ? value : n;
}

type WireMeal = z.infer<typeof wireMeal>;

/** Coerce a wire-format payload into the strict shared schema, reporting field paths on failure. */
export function normalizePush(input: { weekStart: string; meals: WireMeal[] }): PushMealPlanInput {
  const normalized = {
    weekStart: input.weekStart.trim(),
    meals: input.meals.map((meal) => ({
      dayOfWeek: toNumberish(meal.dayOfWeek),
      ...(meal.mealType != null && meal.mealType.trim() !== ''
        ? { mealType: meal.mealType.trim() }
        : {}),
      ...(meal.recipeId != null ? { recipeId: toNumberish(meal.recipeId) } : {}),
      ...(meal.recipe != null
        ? {
            recipe: {
              title: meal.recipe.title.trim(),
              ...(meal.recipe.description != null ? { description: meal.recipe.description } : {}),
              servings: meal.recipe.servings != null ? toNumberish(meal.recipe.servings) : 4,
              prepMinutes:
                meal.recipe.prepMinutes != null ? toNumberish(meal.recipe.prepMinutes) : null,
              cookMinutes:
                meal.recipe.cookMinutes != null ? toNumberish(meal.recipe.cookMinutes) : null,
              ...(meal.recipe.tags != null ? { tags: meal.recipe.tags } : {}),
              stepsMarkdown: meal.recipe.stepsMarkdown,
              ingredients: meal.recipe.ingredients.map((ingredient) => ({
                name: ingredient.name.trim(),
                quantity: ingredient.quantity != null ? toNumberish(ingredient.quantity) : null,
                unit:
                  ingredient.unit != null && ingredient.unit.trim() !== ''
                    ? ingredient.unit.trim()
                    : null,
                section: ingredient.section,
              })),
            },
          }
        : {}),
    })),
  };
  return pushMealPlanSchema.parse(normalized);
}

/** One line per invalid field, path included, so the model can fix and retry. */
export function formatZodIssues(error: z.ZodError): string {
  const lines = error.issues
    .slice(0, 8)
    .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  return `Invalid meal plan payload — fix these fields and retry:\n${lines}`;
}

/** Lenient id/limit coercion for the read tools. */
export function toInt(value: number | string, fallback?: number): number {
  const n = typeof value === 'number' ? value : Number(value.trim());
  if (Number.isNaN(n)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Expected a number, got "${value}"`);
  }
  return Math.trunc(n);
}
