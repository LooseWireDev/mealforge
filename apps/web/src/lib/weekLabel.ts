import { weekStartOf } from '@mealforge/shared/utils';

/** "This week" | "Next week" | "Week of Jul 20" for a plan's weekStart. */
export function weekTitle(weekStart: string): string {
  const thisWeek = weekStartOf();
  if (weekStart === thisWeek) return 'This week';
  const next = new Date(`${thisWeek}T00:00:00`);
  next.setDate(next.getDate() + 7);
  if (weekStart === weekStartOf(next)) return 'Next week';
  const start = new Date(`${weekStart}T00:00:00`);
  return `Week of ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** "Jul 6 – Jul 12" */
export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date): string =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}
