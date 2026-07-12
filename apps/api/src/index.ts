import { serve } from '@hono/node-server';

import { buildApp } from './app';
import { getDb, migrateDb } from './db/client';

const db = getDb();
migrateDb(
  db,
  process.env.MIGRATIONS_DIR ?? new URL('../src/db/migrations', import.meta.url).pathname,
);

const app = buildApp(db);
const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`mealforge running at http://localhost:${info.port}`);
});
