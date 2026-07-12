import { createFileRoute, Link } from '@tanstack/react-router';

import { PlanView } from '../features/plans/PlanView';
import { trpc } from '../lib/trpc';

export const Route = createFileRoute('/plans/$planId')({
  component: PlanDetailPage,
});

function PlanDetailPage(): React.ReactElement {
  const { planId } = Route.useParams();
  const id = Number(planId);
  const validId = Number.isInteger(id) && id > 0;
  const { data: plan, isLoading } = trpc.plans.byId.useQuery(
    { planId: validId ? id : 1 },
    { enabled: validId },
  );

  if (validId && isLoading) {
    return <p className="p-8 text-center text-sm text-ink-soft">Loading…</p>;
  }
  if (!validId || !plan) {
    return (
      <div className="p-8 text-center text-sm text-ink-soft">
        <p>This meal plan doesn't exist.</p>
        <Link to="/plans" className="mt-3 inline-block font-semibold text-leaf">
          Back to plans
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="pt-2">
        <Link to="/plans" className="font-quant text-xs font-semibold text-leaf">
          ← All plans
        </Link>
      </div>
      <PlanView plan={plan} />
    </div>
  );
}
