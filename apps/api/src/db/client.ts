import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Run pending migrations with foreign-key enforcement disabled.
 *
 * The migrator wraps each migration in a transaction, and inside a
 * transaction `PRAGMA foreign_keys=OFF` (which drizzle-kit emits into the
 * migration SQL) is a silent no-op. With enforcement still on, a table
 * rebuild's DROP TABLE fires ON DELETE CASCADE on child tables and destroys
 * their rows. Toggling the pragma here — on the connection, outside any
 * transaction — actually disables it for the duration of the migration.
 */
export function migrateDb(db: Db, migrationsFolder: string): void {
  db.$client.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder });
  } finally {
    db.$client.pragma('foreign_keys = ON');
  }
}

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
