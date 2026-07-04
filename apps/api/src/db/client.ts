import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(
  url: string = process.env.DATABASE_URL?.replace('file:', '') ?? './data/mealforge.db',
): Db {
  if (url !== ':memory:') {
    mkdirSync(dirname(url), { recursive: true });
  }
  const sqlite = new Database(url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

let instance: Db | null = null;

export function getDb(): Db {
  instance ??= createDb();
  return instance;
}
