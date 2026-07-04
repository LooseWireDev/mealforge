// tRPC primitives live in trpcInit.ts so feature routers can import them from
// here without a circular-evaluation trap: the trpcInit import below runs
// before any feature router, and the re-exports resolve through to it.
import { publicProcedure, router } from './trpcInit';
import { plansRouter } from './features/plans/router';
import { recipesRouter } from './features/recipes/router';
import { groceryRouter } from './features/grocery/router';
// forge:feature-imports — the feature generator inserts router imports above this line

export { publicProcedure, router } from './trpcInit';
export type { Context } from './trpcInit';

export const appRouter = router({
  health: publicProcedure.query((): { status: string } => {
    return { status: 'ok' };
  }),
  plans: plansRouter,
  recipes: recipesRouter,
  grocery: groceryRouter,
  // forge:feature-routers — the feature generator registers feature routers above this line
});

export type AppRouter = typeof appRouter;
