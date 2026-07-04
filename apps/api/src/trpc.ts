import { TRPCError, initTRPC } from '@trpc/server';
import { auth } from './auth/auth';
// forge:feature-imports — the feature generator inserts router imports above this line

type Session = typeof auth.$Infer.Session;

export interface Context {
  req: Request;
  session: Session | null;
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  const session = await auth.api.getSession({ headers: req.headers });
  return { req, session };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const appRouter = router({
  health: publicProcedure.query((): { status: string } => {
    return { status: 'ok' };
  }),
  // forge:feature-routers — the feature generator registers feature routers above this line
});

export type AppRouter = typeof appRouter;
