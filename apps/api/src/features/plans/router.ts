import { z } from 'zod';

import { weekStartSchema } from '@mealforge/shared/schemas';

import { publicProcedure, router } from '../../trpcInit';
import { getPlanByWeek, getRecentPlans } from './service';

export const plansRouter = router({
  byWeek: publicProcedure
    .input(z.object({ weekStart: weekStartSchema }))
    .query(({ ctx, input }) => getPlanByWeek(ctx.db, input.weekStart)),
  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(52).default(12) }).default({ limit: 12 }))
    .query(({ ctx, input }) => getRecentPlans(ctx.db, input.limit)),
});
