import { initTRPC } from '@trpc/server';

import type { Db } from './db/client';

export type Context = {
  req: Request;
  db: Db;
};

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
