import { weekStartSchema } from '@mealforge/shared/schemas';
import { z } from 'zod';

import { publicProcedure, router } from '../../trpcInit';
import { getCurrentPlan, getPlanByWeek, getRecentPlans } from './service';

export const plansRouter = router({
  byWeek: publicProcedure
    .input(z.object({ weekStart: weekStartSchema }))
    .query(({ ctx, input }) => getPlanByWeek(ctx.db, input.weekStart)),
  // `from` is the client's local week start — the container's clock may be in
  // a different timezone, so the browser decides what "this week" means.
  current: publicProcedure
    .input(z.object({ from: weekStartSchema }))
    .query(({ ctx, input }) => getCurrentPlan(ctx.db, input.from)),
  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(52).default(12) }).default({ limit: 12 }))
    .query(({ ctx, input }) => getRecentPlans(ctx.db, input.limit)),
});
