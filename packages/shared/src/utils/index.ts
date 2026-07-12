// Shared utility functions go here.

/**
 * What a plan is called everywhere it's shown: its given name, or
 * "Meal Plan {id}" while it's unnamed.
 */
export function planDisplayName(name: string | null, planId: number): string {
  return name ?? `Meal Plan ${planId}`;
}
