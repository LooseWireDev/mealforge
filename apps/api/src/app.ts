import { StreamableHTTPTransport } from '@hono/mcp';
import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';

import type { Db } from './db/client';
import { createMcpServer } from './mcp/server';
import { errorHandler } from './middleware/errorHandler';
import { appRouter, type Context } from './trpc';

export function buildApp(db: Db): Hono {
  const app = new Hono();

  app.onError(errorHandler);

  // MCP endpoint (streamable http, stateless): a fresh server + transport per
  // request so concurrent LibreChat calls can't interleave.
  app.all('/mcp', async (c) => {
    const transport = new StreamableHTTPTransport();
    await createMcpServer(db).connect(transport);
    return transport.handleRequest(c);
  });

  // Mount tRPC
  app.use(
    '/trpc/*',
    trpcServer({
      router: appRouter,
      createContext: async ({ req }): Promise<Context> => ({ req, db }),
    }),
  );

  return app;
}
