import {
  type PushMealPlanInput,
  pushMealPlanSchema,
  type RecipeInput,
  recipeInputSchema,
  STORE_SECTIONS,
} from '@mealforge/shared/schemas';
import { z } from 'zod';

/*
 * Wire-format schemas for the MCP boundary.
 *
 * MCP clients like LibreChat validate tool arguments against the published
 * schema *client-side*; when that fails the model only sees a generic
 * "Received tool input did not match expected schema" with no field detail,
 * and the call never reaches this server. Small models malform nested
 * payloads constantly (numbers as strings, double-wrapped arrays, wrong-case
 * enums, missing fields), so the published schema is deliberately permissive
 * — nearly any structurally plausible payload passes the client — and ALL
 * real validation happens here, where failures come back with exact field
 * paths, the received value, and a valid example the model can imitate.
 */

const wireNumber = z.union([z.number(), z.string()]).nullable();

// Models double-wrap arrays in tool args (tags: [["a","b"]]). Accept an item
// or a nested array of items at each position and flatten one level.
function tolerantArray<T extends z.ZodType>(item: T) {
  return z.array(z.union([item, z.array(item)]));
}

function flattenOnce<T>(values: Array<T | T[]>): T[] {
  return values.flatMap((value) => (Array.isArray(value) ? value : [value]));
}

// Loose objects: unknown extra keys are ignored, every field optional at the
// wire layer — "required" is enforced by the strict schema server-side so the
// model gets a useful error instead of a client-side rejection.
const wireIngredient = z.looseObject({
  name: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Ingredient name; use identical names across recipes so the grocery list merges them',
    ),
  quantity: wireNumber
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
  section: z
    .string()
    .nullable()
    .optional()
    .describe(`Store section, one of: ${STORE_SECTIONS.join(', ')}`),
});

const wireRecipe = z.looseObject({
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  servings: wireNumber.optional().describe('Defaults to 4'),
  prepMinutes: wireNumber.optional(),
  cookMinutes: wireNumber.optional(),
  tags: tolerantArray(z.string()).nullable().optional(),
  stepsMarkdown: z
    .string()
    .nullable()
    .optional()
    .describe('Numbered cooking steps as markdown: "1. …\\n2. …" (required)'),
  ingredients: tolerantArray(wireIngredient)
    .nullable()
    .optional()
    .describe('All ingredients (required, at least 1)'),
});

export const recipeWireShape = wireRecipe.shape;

const wireMeal = z.looseObject({
  dayOfWeek: wireNumber.optional().describe('0 = Monday … 6 = Sunday (required)'),
  mealType: z.string().nullable().optional().describe('Defaults to "dinner"'),
  recipeId: wireNumber
    .optional()
    .describe('Reuse a saved recipe by id (from create_recipe, search_recipes, or list_favorites)'),
  recipe: wireRecipe
    .nullable()
    .optional()
    .describe('A complete new recipe. Provide exactly one of recipe or recipeId per meal.'),
});

export const pushWireShape = {
  weekStart: z.string().describe("ISO date (YYYY-MM-DD) of the week's Monday"),
  meals: tolerantArray(wireMeal).min(1),
};

/** A minimal valid payload, echoed with every validation error — models imitate examples better than schemas. */
export const PUSH_EXAMPLE =
  '{"weekStart":"2026-07-06","meals":[{"dayOfWeek":0,"recipeId":12},{"dayOfWeek":2,"recipe":{"title":"Salmon with Zucchini","servings":4,"prepMinutes":10,"cookMinutes":20,"tags":["quick"],"stepsMarkdown":"1. Sear salmon.\\n2. Sauté zucchini.","ingredients":[{"name":"salmon fillets","quantity":1.5,"unit":"lb","section":"meat-seafood"},{"name":"zucchini","quantity":3,"unit":null,"section":"produce"},{"name":"salt","quantity":null,"unit":null,"section":"spices"}]}}]}';

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

function trimmed(value: string | null | undefined): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** "Meat & Seafood" / "DAIRY EGGS" → "meat-seafood" / "dairy-eggs"; unknown values survive for the enum error to list options. */
function canonicalSection(value: string | null | undefined): unknown {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*[&/]\s*/g, '-')
    .replace(/[\s_]+/g, '-');
}

type WireMeal = z.infer<typeof wireMeal>;
type WireRecipe = z.infer<typeof wireRecipe>;
type WirePushInput = { weekStart: string; meals: Array<WireMeal | WireMeal[]> };

function normalizeRecipeFields(recipe: WireRecipe): Record<string, unknown> {
  return {
    title: trimmed(recipe.title),
    ...(recipe.description != null ? { description: recipe.description } : {}),
    servings: recipe.servings != null ? toNumberish(recipe.servings) : 4,
    prepMinutes: recipe.prepMinutes != null ? toNumberish(recipe.prepMinutes) : null,
    cookMinutes: recipe.cookMinutes != null ? toNumberish(recipe.cookMinutes) : null,
    ...(recipe.tags != null ? { tags: flattenOnce(recipe.tags) } : {}),
    stepsMarkdown: recipe.stepsMarkdown,
    ingredients:
      recipe.ingredients != null
        ? flattenOnce(recipe.ingredients).map((ingredient) => ({
            name: trimmed(ingredient.name),
            quantity: ingredient.quantity != null ? toNumberish(ingredient.quantity) : null,
            unit:
              typeof ingredient.unit === 'string' && ingredient.unit.trim() !== ''
                ? ingredient.unit.trim()
                : null,
            section: canonicalSection(ingredient.section),
          }))
        : undefined,
  };
}

/** A minimal valid recipe, echoed with create_recipe validation errors. */
export const RECIPE_EXAMPLE =
  '{"title":"Salmon with Zucchini","servings":4,"prepMinutes":10,"cookMinutes":20,"tags":["quick"],"stepsMarkdown":"1. Sear salmon.\\n2. Sauté zucchini.","ingredients":[{"name":"salmon fillets","quantity":1.5,"unit":"lb","section":"meat-seafood"},{"name":"zucchini","quantity":3,"unit":null,"section":"produce"}]}';

/** Coerce a wire-format recipe into the strict shared schema, reporting field paths on failure. */
export function normalizeRecipe(recipe: WireRecipe): RecipeInput {
  const normalized = normalizeRecipeFields(recipe);
  const result = recipeInputSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(formatZodIssues(result.error, normalized, RECIPE_EXAMPLE));
  }
  return result.data;
}

/** Coerce a wire-format payload into the strict shared schema, reporting field paths on failure. */
export function normalizePush(input: WirePushInput): PushMealPlanInput {
  const normalized = {
    weekStart: input.weekStart.trim(),
    meals: flattenOnce(input.meals).map((meal) => ({
      dayOfWeek: toNumberish(meal.dayOfWeek),
      ...(typeof meal.mealType === 'string' && meal.mealType.trim() !== ''
        ? { mealType: meal.mealType.trim() }
        : {}),
      ...(meal.recipeId != null ? { recipeId: toNumberish(meal.recipeId) } : {}),
      ...(meal.recipe != null ? { recipe: normalizeRecipeFields(meal.recipe) } : {}),
    })),
  };
  const result = pushMealPlanSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(formatZodIssues(result.error, normalized, PUSH_EXAMPLE));
  }
  return result.data;
}

/** One line per invalid field — path, problem, and what arrived — plus a valid example to imitate. */
function formatZodIssues(error: z.ZodError, received: unknown, example: string): string {
  const byPath = (issue: z.core.$ZodIssue): string => {
    const path = issue.path.join('.');
    const value = issue.path.reduce<unknown>(
      (acc, key) =>
        acc != null && typeof acc === 'object'
          ? (acc as Record<string, unknown>)[key as string]
          : undefined,
      received,
    );
    const got = value === undefined ? 'missing' : `got ${JSON.stringify(value)?.slice(0, 80)}`;
    return `- ${path}: ${issue.message} (${got})`;
  };
  const lines = error.issues.slice(0, 10).map(byPath).join('\n');
  return `Invalid payload — fix these fields and retry:\n${lines}\n\nValid example:\n${example}`;
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
