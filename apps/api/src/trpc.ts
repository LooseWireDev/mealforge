import { initTRPC } from '@trpc/server';
import { type Db, db } from './db/client';
// forge:feature-imports — the feature generator inserts router imports above this line

export type Context = {
  req: Request;
  db: Db;
};

export async function createContext({ req }: { req: Request }): Promise<Context> {
  return { req, db };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({
  health: publicProcedure.query((): { status: string } => {
    return { status: 'ok' };
  }),
  // forge:feature-routers — the feature generator registers feature routers above this line
});

export type AppRouter = typeof appRouter;
