import { createFileRoute } from '@tanstack/react-router';

import { EmptyState } from '../components/EmptyState';
import { PlanCard } from '../features/plans/PlanCard';
import { PlanSubTabs } from '../features/plans/PlanSubTabs';
import { trpc } from '../lib/trpc';

export const Route = createFileRoute('/plans/favorites')({
  component: FavoritePlansPage,
});

function FavoritePlansPage(): React.ReactElement {
  const { data: plans, isLoading } = trpc.plans.list.useQuery({ favoritesOnly: true, limit: 50 });

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="pt-2">
        <h1 className="font-display text-2xl font-bold">Meal plans</h1>
      </header>
      <PlanSubTabs />

      {isLoading ? (
        <p className="p-8 text-center text-sm text-ink-soft">Loading…</p>
      ) : !plans || plans.length === 0 ? (
        <EmptyState
          glyph="the keepers"
          title="No favorite plans yet"
          hint="Name a plan and tap its star to keep it here — your assistant can bring a favorite back any time."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {plans.map((plan) => (
            <li key={plan.planId}>
              <PlanCard plan={plan} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
