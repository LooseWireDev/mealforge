import { createFileRoute } from '@tanstack/react-router';

import { EmptyState } from '../components/EmptyState';
import { PlanCard } from '../features/plans/PlanCard';
import { PlanSubTabs } from '../features/plans/PlanSubTabs';
import { PlanView } from '../features/plans/PlanView';
import { trpc } from '../lib/trpc';

export const Route = createFileRoute('/plans/')({
  component: ActivePlanPage,
});

function ActivePlanPage(): React.ReactElement {
  const { data: active, isLoading } = trpc.plans.active.useQuery();
  const { data: upcoming } = trpc.plans.list.useQuery(
    { status: 'upcoming', limit: 20 },
    { enabled: !isLoading && !active },
  );
  const utils = trpc.useUtils();
  const activate = trpc.plans.activate.useMutation({
    onSettled: () => {
      void utils.plans.invalidate();
      void utils.grocery.invalidate();
    },
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="pt-2">
        <h1 className="font-display text-2xl font-bold">Meal plans</h1>
      </header>
      <PlanSubTabs />

      {isLoading ? (
        <p className="p-8 text-center text-sm text-ink-soft">Loading your plan…</p>
      ) : active ? (
        <PlanView plan={active} />
      ) : (
        <>
          <EmptyState
            glyph="an empty stove"
            title="No active meal plan"
            hint={
              upcoming !== undefined && upcoming.length > 0
                ? 'Pick an upcoming plan below to start cooking from it, or plan something new with your assistant in chat.'
                : 'Plan meals with your assistant in chat — push a plan and it lands here, grocery list included.'
            }
          />
          {upcoming !== undefined && upcoming.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {upcoming.map((plan) => (
                <li key={plan.planId}>
                  <PlanCard
                    plan={plan}
                    action={
                      <button
                        type="button"
                        onClick={() => activate.mutate({ planId: plan.planId })}
                        disabled={activate.isPending}
                        className="w-full rounded-lg bg-leaf py-2.5 text-sm font-semibold text-paper disabled:opacity-40"
                      >
                        Set active
                      </button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
