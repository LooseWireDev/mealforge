import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

export function createDb(
  url: string = process.env.DATABASE_URL?.replace('file:', '') ?? './data/mealforge.db',
): ReturnType<typeof drizzle<typeof schema>> {
  const sqlite = new Database(url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export const db = createDb();
