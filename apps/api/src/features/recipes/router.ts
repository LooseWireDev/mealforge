import { z } from 'zod';

import { publicProcedure, router } from '../../trpcInit';
import { getRecipe, listRecipes, toggleFavorite } from './service';

export const recipesRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          query: z.string().optional(),
          favoritesOnly: z.boolean().default(false),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .default({ favoritesOnly: false, limit: 50 }),
    )
    .query(({ ctx, input }) => listRecipes(ctx.db, input)),
  byId: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => getRecipe(ctx.db, input.id)),
  toggleFavorite: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => toggleFavorite(ctx.db, input.id)),
});
