import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { trpcServer } from '@hono/trpc-server';
import { appRouter, createContext } from './trpc';
import { authRoutes } from './auth/authRoutes';
import { errorHandler } from './middleware/errorHandler';

const app = new Hono();

app.onError(errorHandler);

// Mount auth routes
app.route('/api/auth', authRoutes);

// Mount tRPC
app.use(
  '/trpc/*',
  trpcServer({
    router: appRouter,
    createContext,
  }),
);

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});

export default app;
