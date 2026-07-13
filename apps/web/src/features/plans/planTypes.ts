import type { MealType, PlanStatus } from '@mealforge/shared/schemas';

// Shape of a plan as the tRPC plans router returns it. Timestamps are typed
// Date server-side but arrive as ISO strings over the wire (no transformer),
// so consumers always re-wrap them in `new Date(...)`.
export interface PlanData {
  planId: number;
  name: string | null;
  displayName: string;
  status: PlanStatus;
  isFavorite: boolean;
  createdAt: Date | string;
  completedAt: Date | string | null;
  meals: Array<{
    mealId: number;
    mealType: MealType;
    recipeId: number;
    title: string;
    cookedAt: Date | string | null;
  }>;
}

/** "Jul 8" */
export function formatPlanDate(value: Date | string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
