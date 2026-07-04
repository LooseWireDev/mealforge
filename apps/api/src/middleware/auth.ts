import type { MiddlewareHandler } from 'hono';
import { auth } from '../auth/auth';

export function authMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    c.set('session', session);
    await next();
  };
}
