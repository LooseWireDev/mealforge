import { serve } from '@hono/node-server';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { buildApp } from './app';
import { getDb } from './db/client';

const db = getDb();
migrate(db, {
  migrationsFolder:
    process.env.MIGRATIONS_DIR ?? new URL('../src/db/migrations', import.meta.url).pathname,
});

const app = buildApp(db);
const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`mealforge running at http://localhost:${info.port}`);
});
