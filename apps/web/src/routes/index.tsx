import { createFileRoute } from '@tanstack/react-router';

import { DAY_NAMES } from '@mealforge/shared/schemas';
import { weekStartOf } from '@mealforge/shared/utils';

import { trpc } from '../lib/trpc';

export const Route = createFileRoute('/')({
  component: WeekPage,
});

function WeekPage(): React.ReactElement {
  const weekStart = weekStartOf();
  const { data: plan, isLoading } = trpc.plans.byWeek.useQuery({ weekStart });

  if (isLoading) {
    return <p className="p-6 text-center text-sm opacity-60">Loading…</p>;
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center">
        <p className="text-4xl">🍳</p>
        <h2 className="text-lg font-semibold">No plan for this week yet</h2>
        <p className="max-w-xs text-sm opacity-70">
          Ask your assistant to plan a week of meals — it will show up here with recipes and a
          grocery list.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">Week of {plan.weekStart}</h1>
      <ul className="flex flex-col gap-2">
        {plan.meals.map((meal) => (
          <li
            key={`${meal.dayOfWeek}-${meal.mealType}`}
            className="rounded-lg border border-gray-300 p-3"
          >
            <p className="text-xs font-medium uppercase opacity-60">
              {DAY_NAMES[meal.dayOfWeek] ?? `Day ${meal.dayOfWeek}`}
            </p>
            <p className="font-semibold">{meal.title}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
