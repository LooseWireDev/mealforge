import { planNameSchema, planStatusSchema } from '@mealforge/shared/schemas';
import { z } from 'zod';

import { publicProcedure, router } from '../../trpcInit';
import {
  activatePlan,
  completePlan,
  getActivePlan,
  getPlan,
  listPlans,
  renamePlan,
  setMealCooked,
  togglePlanFavorite,
} from './service';

const planIdInput = z.object({ planId: z.number().int().positive() });

export const plansRouter = router({
  active: publicProcedure.query(({ ctx }) => getActivePlan(ctx.db)),
  byId: publicProcedure.input(planIdInput).query(({ ctx, input }) => getPlan(ctx.db, input.planId)),
  list: publicProcedure
    .input(
      z
        .object({
          status: planStatusSchema.optional(),
          favoritesOnly: z.boolean().default(false),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .default({ favoritesOnly: false, limit: 20 }),
    )
    .query(({ ctx, input }) => listPlans(ctx.db, input)),
  activate: publicProcedure
    .input(planIdInput)
    .mutation(({ ctx, input }) => activatePlan(ctx.db, input.planId)),
  complete: publicProcedure
    .input(planIdInput)
    .mutation(({ ctx, input }) => completePlan(ctx.db, input.planId)),
  // name: null clears the name (back to "Meal Plan {id}"); rejected while favorited
  rename: publicProcedure
    .input(planIdInput.extend({ name: planNameSchema.nullable() }))
    .mutation(({ ctx, input }) => renamePlan(ctx.db, input.planId, input.name)),
  toggleFavorite: publicProcedure
    .input(planIdInput)
    .mutation(({ ctx, input }) => togglePlanFavorite(ctx.db, input.planId)),
  setMealCooked: publicProcedure
    .input(z.object({ mealId: z.number().int().positive(), cooked: z.boolean() }))
    .mutation(({ ctx, input }) => setMealCooked(ctx.db, input.mealId, input.cooked)),
});
