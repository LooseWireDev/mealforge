import { MEAL_TYPE_LABELS, MEAL_TYPES } from '@mealforge/shared/schemas';
import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { RecipeCard } from '../recipes/RecipeCard';
import { formatPlanDate, type PlanData } from './planTypes';

interface PlanViewProps {
  plan: PlanData;
}

function statusLine(plan: PlanData): string {
  const cookedCount = plan.meals.filter((meal) => meal.cookedAt !== null).length;
  const parts = [`${plan.meals.length} ${plan.meals.length === 1 ? 'meal' : 'meals'}`];
  if (cookedCount > 0) {
    parts.push(`${cookedCount} cooked`);
  }
  if (plan.status === 'completed' && plan.completedAt !== null) {
    parts.push(`completed ${formatPlanDate(plan.completedAt)}`);
  } else {
    parts.push(plan.status);
  }
  return parts.join(' · ');
}

export function PlanView({ plan }: PlanViewProps): React.ReactElement {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  const recipeIds = plan.meals.map((m) => m.recipeId);
  const { data: recipes } = trpc.recipes.list.useQuery(
    { limit: 200 },
    { enabled: recipeIds.length > 0 },
  );

  const invalidate = (): void => {
    void utils.plans.invalidate();
    void utils.grocery.invalidate();
  };
  const rename = trpc.plans.rename.useMutation({
    onSuccess: () => {
      setEditing(false);
      setHint(null);
      invalidate();
    },
    onError: (error) => setHint(error.message),
  });
  const toggleFavorite = trpc.plans.toggleFavorite.useMutation({
    onSettled: invalidate,
  });
  const complete = trpc.plans.complete.useMutation({ onSettled: invalidate });
  const activate = trpc.plans.activate.useMutation({
    onSuccess: () => setHint(null),
    onError: (error) => setHint(error.message),
    onSettled: invalidate,
  });
  const setCooked = trpc.plans.setMealCooked.useMutation({
    // optimistic: flip immediately, like the grocery list — the plan lives in
    // both the `active` and `byId` caches, so patch whichever holds it
    onMutate: async ({ mealId, cooked }) => {
      await Promise.all([
        utils.plans.active.cancel(),
        utils.plans.byId.cancel({ planId: plan.planId }),
      ]);
      const cookedAt = cooked ? new Date().toISOString() : null;
      utils.plans.active.setData(undefined, (old) =>
        old && old.planId === plan.planId
          ? { ...old, meals: old.meals.map((m) => (m.mealId === mealId ? { ...m, cookedAt } : m)) }
          : old,
      );
      utils.plans.byId.setData({ planId: plan.planId }, (old) =>
        old
          ? { ...old, meals: old.meals.map((m) => (m.mealId === mealId ? { ...m, cookedAt } : m)) }
          : old,
      );
    },
    onSettled: invalidate,
  });

  const startEditing = (message: string | null = null): void => {
    setDraftName(plan.name ?? '');
    setHint(message);
    setEditing(true);
  };

  const saveName = (): void => {
    const trimmed = draftName.trim();
    rename.mutate({ planId: plan.planId, name: trimmed.length > 0 ? trimmed : null });
  };

  const onFavoriteTap = (): void => {
    if (!plan.isFavorite && plan.name === null) {
      startEditing('Name this plan to favorite it.');
      return;
    }
    toggleFavorite.mutate({ planId: plan.planId });
  };

  const groups = MEAL_TYPES.map((type) => ({
    type,
    meals: plan.meals.filter((meal) => meal.mealType === type),
  })).filter((group) => group.meals.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
          >
            <input
              // biome-ignore lint/a11y/noAutofocus: the field appears on explicit user intent (rename tap)
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={`Meal Plan ${plan.planId}`}
              aria-label="Plan name"
              maxLength={80}
              className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 font-display text-lg font-bold focus:border-leaf focus:outline-none"
            />
            <button
              type="submit"
              disabled={rename.isPending}
              className="shrink-0 rounded-lg bg-leaf px-3 py-2 text-sm font-semibold text-paper disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setHint(null);
              }}
              className="shrink-0 rounded-lg px-2 py-2 text-sm font-semibold text-ink-soft"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="min-w-0">
            <h1 className="flex items-baseline gap-2 font-display text-2xl font-bold leading-tight">
              <span className="min-w-0 truncate">{plan.displayName}</span>
              <button
                type="button"
                onClick={() => startEditing()}
                aria-label="Rename plan"
                className="shrink-0 text-base text-ink-soft"
              >
                ✎
              </button>
            </h1>
            <p className="mt-1 font-quant text-xs text-ink-soft">{statusLine(plan)}</p>
          </div>
        )}
        <button
          type="button"
          onClick={onFavoriteTap}
          aria-pressed={plan.isFavorite}
          aria-label={plan.isFavorite ? 'Remove plan from favorites' : 'Save plan to favorites'}
          className={`-m-2 mt-0 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-xl leading-none transition-transform active:scale-90 ${
            plan.isFavorite ? 'text-butter' : 'text-check'
          }`}
        >
          {plan.isFavorite ? '★' : '☆'}
        </button>
      </header>

      {hint !== null && (
        <p role="alert" className="rounded-xl bg-butter-soft px-4 py-3 text-sm font-medium">
          {hint}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.type}>
          <h2 className="mb-1.5 px-1 font-quant text-[0.65rem] font-semibold uppercase tracking-widest text-ink-soft">
            {MEAL_TYPE_LABELS[group.type]}
          </h2>
          <ul className="flex flex-col gap-2.5">
            {group.meals.map((meal) => {
              const recipe = recipes?.find((r) => r.id === meal.recipeId);
              const cooked = meal.cookedAt !== null;
              return (
                <li
                  key={meal.mealId}
                  className={`transition-opacity ${cooked ? 'opacity-60' : ''}`}
                >
                  <RecipeCard
                    recipe={
                      recipe ?? {
                        id: meal.recipeId,
                        title: meal.title,
                        tags: [],
                        prepMinutes: null,
                        cookMinutes: null,
                        isFavorite: false,
                      }
                    }
                    action={
                      // nothing has been cooked from a queued plan, so
                      // upcoming plans don't get the Complete button
                      plan.status !== 'upcoming' ? (
                        <button
                          type="button"
                          onClick={() => setCooked.mutate({ mealId: meal.mealId, cooked: !cooked })}
                          aria-pressed={cooked}
                          aria-label={
                            cooked
                              ? `Mark ${meal.title} as not cooked`
                              : `Mark ${meal.title} as cooked`
                          }
                          className={`w-full rounded-lg py-2 text-sm font-semibold transition-colors ${
                            cooked ? 'bg-leaf text-paper' : 'border border-line text-ink-soft'
                          }`}
                        >
                          {cooked ? 'Completed ✓' : 'Complete'}
                        </button>
                      ) : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {plan.status === 'active' ? (
        <button
          type="button"
          onClick={() => complete.mutate({ planId: plan.planId })}
          disabled={complete.isPending}
          className="rounded-xl bg-butter py-3.5 text-center text-base font-bold text-ink disabled:opacity-40"
        >
          Complete this plan
        </button>
      ) : (
        <button
          type="button"
          onClick={() => activate.mutate({ planId: plan.planId })}
          disabled={activate.isPending}
          className="rounded-xl bg-leaf py-3.5 text-center text-base font-bold text-paper disabled:opacity-40"
        >
          {plan.status === 'completed'
            ? 'Cook it again — make active'
            : 'Make this the active plan'}
        </button>
      )}
    </div>
  );
}
