import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@mealforge/shared/types';

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient(): ReturnType<typeof trpc.createClient> {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/trpc',
      }),
    ],
  });
}
