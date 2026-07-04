import { DAY_NAMES } from '@mealforge/shared/schemas';
import { weekStartOf } from '@mealforge/shared/utils';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { EmptyState } from '../components/EmptyState';
import { RecipeCard } from '../features/recipes/RecipeCard';
import { trpc } from '../lib/trpc';
import { weekRangeLabel, weekTitle } from '../lib/weekLabel';

export const Route = createFileRoute('/')({
  component: WeekPage,
});

interface PlanListItem {
  planId: number;
  weekStart: string;
}

/**
 * The plan a household means by "current": this week's if it exists, else the
 * nearest upcoming one, else the most recent past one. Plans arrive newest
 * first from plans.list.
 */
function currentWeekOf(plans: PlanListItem[]): string | undefined {
  const thisWeek = weekStartOf();
  const upcoming = [...plans].reverse().find((p) => p.weekStart >= thisWeek);
  return (upcoming ?? plans[0])?.weekStart;
}

function WeekPage(): React.ReactElement {
  const thisWeek = weekStartOf();
  const today = (new Date().getDay() + 6) % 7; // 0 = Monday
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const { data: plans, isLoading } = trpc.plans.list.useQuery({ limit: 52 });

  const weekStart = selectedWeek ?? (plans ? currentWeekOf(plans) : undefined);
  const plan = plans?.find((p) => p.weekStart === weekStart);
  const recipeIds = plan?.meals.map((m) => m.recipeId) ?? [];
  const { data: recipes } = trpc.recipes.list.useQuery(
    { limit: 200 },
    { enabled: recipeIds.length > 0 },
  );

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-ink-soft">Loading your week…</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between pt-2">
        {plans !== undefined && plans.length > 0 && weekStart !== undefined ? (
          <label className="relative inline-flex items-baseline gap-1.5">
            <span className="sr-only">Week</span>
            <select
              value={weekStart}
              onChange={(e) => setSelectedWeek(e.target.value)}
              aria-label="Choose a week"
              className="appearance-none bg-transparent pr-6 font-display text-2xl font-bold focus:outline-none"
            >
              {plans.map((p) => (
                <option key={p.planId} value={p.weekStart}>
                  {weekTitle(p.weekStart)}
                </option>
              ))}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-0 top-1 text-sm text-ink-soft">
              ▾
            </span>
          </label>
        ) : (
          <h1 className="font-display text-2xl font-bold">This week</h1>
        )}
        {weekStart !== undefined && (
          <p className="font-quant text-xs text-ink-soft">{weekRangeLabel(weekStart)}</p>
        )}
      </header>

      {!plan ? (
        <EmptyState
          glyph="mise en place"
          title="No plan for this week yet"
          hint="Plan the week with your assistant in chat — the meals, recipes, and grocery list will land here."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {plan.meals.map((meal) => {
            const recipe = recipes?.find((r) => r.id === meal.recipeId);
            return (
              <li key={`${meal.dayOfWeek}-${meal.mealType}`}>
                <RecipeCard
                  dayLabel={DAY_NAMES[meal.dayOfWeek] ?? `Day ${meal.dayOfWeek + 1}`}
                  highlight={plan.weekStart === thisWeek && meal.dayOfWeek === today}
                  recipe={
                    recipe ?? {
                      id: meal.recipeId,
                      title: meal.title,
                      description: '',
                      tags: [],
                      prepMinutes: null,
                      cookMinutes: null,
                      isFavorite: false,
                    }
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
