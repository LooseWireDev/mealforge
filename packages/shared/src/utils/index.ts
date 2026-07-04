// Shared utility functions go here.

/**
 * ISO date (YYYY-MM-DD) of the Monday of the week containing `date`,
 * in local time. Weeks run Monday–Sunday by mealforge convention.
 */
export function weekStartOf(date: Date = new Date()): string {
  const monday = new Date(date);
  const offset = (monday.getDay() + 6) % 7; // Sunday=0 -> 6, Monday=1 -> 0
  monday.setDate(monday.getDate() - offset);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
