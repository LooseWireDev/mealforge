import { createFileRoute } from '@tanstack/react-router';

import { DAY_NAMES } from '@mealforge/shared/schemas';
import { weekStartOf } from '@mealforge/shared/utils';

import { EmptyState } from '../components/EmptyState';
import { RecipeCard } from '../features/recipes/RecipeCard';
import { trpc } from '../lib/trpc';

export const Route = createFileRoute('/')({
  component: WeekPage,
});

function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date): string => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function WeekPage(): React.ReactElement {
  const weekStart = weekStartOf();
  const today = (new Date().getDay() + 6) % 7; // 0 = Monday
  const { data: plan, isLoading } = trpc.plans.byWeek.useQuery({ weekStart });
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
        <h1 className="font-display text-2xl font-bold">This week</h1>
        {plan && <p className="font-quant text-xs text-ink-soft">{weekRangeLabel(weekStart)}</p>}
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
                  highlight={meal.dayOfWeek === today}
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
