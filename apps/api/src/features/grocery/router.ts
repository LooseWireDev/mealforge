import { z } from 'zod';

import { sectionSchema } from '@mealforge/shared/schemas';

import { publicProcedure, router } from '../../trpcInit';
import { addManualItem, itemsForPlan, removeManualItem, setChecked } from './service';

export const groceryRouter = router({
  itemsForPlan: publicProcedure
    .input(z.object({ planId: z.number().int().positive() }))
    .query(({ ctx, input }) => itemsForPlan(ctx.db, input.planId)),
  setChecked: publicProcedure
    .input(z.object({ itemId: z.number().int().positive(), checked: z.boolean() }))
    .mutation(({ ctx, input }) => setChecked(ctx.db, input.itemId, input.checked)),
  addManualItem: publicProcedure
    .input(
      z.object({
        planId: z.number().int().positive(),
        name: z.string().min(1),
        quantityText: z.string().optional(),
        section: sectionSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) => addManualItem(ctx.db, input)),
  removeManualItem: publicProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      removeManualItem(ctx.db, input.itemId);
      return { ok: true };
    }),
});
