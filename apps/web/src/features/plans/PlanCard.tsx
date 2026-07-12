import { Link } from '@tanstack/react-router';

import { formatPlanDate, type PlanData } from './planTypes';

const PREVIEW_COUNT = 4;

interface PlanCardProps {
  plan: PlanData;
  /** rendered below the card body, outside the link (e.g. a "Set active" button) */
  action?: React.ReactNode;
}

function metaLine(plan: PlanData): string {
  const meals = `${plan.meals.length} ${plan.meals.length === 1 ? 'meal' : 'meals'}`;
  if (plan.status === 'completed' && plan.completedAt !== null) {
    return `${meals} · completed ${formatPlanDate(plan.completedAt)}`;
  }
  if (plan.status === 'active') {
    return `${meals} · active now`;
  }
  return `${meals} · added ${formatPlanDate(plan.createdAt)}`;
}

export function PlanCard({ plan, action }: PlanCardProps): React.ReactElement {
  const preview = plan.meals.slice(0, PREVIEW_COUNT);
  const overflow = plan.meals.length - preview.length;

  return (
    <article className="rounded-xl border border-line bg-card">
      <Link
        to="/plans/$planId"
        params={{ planId: String(plan.planId) }}
        className="block p-4"
        aria-label={`Open ${plan.displayName}${plan.isFavorite ? ' (favorite)' : ''}`}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-display text-[1.05rem] font-semibold">
            {plan.isFavorite && (
              <span aria-hidden className="mr-1 text-butter">
                ★
              </span>
            )}
            {plan.displayName}
          </span>
          <span className="shrink-0 font-quant text-xs text-ink-soft">{metaLine(plan)}</span>
        </span>
        <span className="mt-2 block">
          {preview.map((meal, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: static preview list, never reordered
              key={i}
              className="block truncate text-sm text-ink-soft"
            >
              · {meal.title}
            </span>
          ))}
          {overflow > 0 && (
            <span className="block text-sm italic text-check">
              + {overflow} more {overflow === 1 ? 'meal' : 'meals'}
            </span>
          )}
        </span>
      </Link>
      {action !== undefined && <div className="border-t border-line px-4 py-3">{action}</div>}
    </article>
  );
}
