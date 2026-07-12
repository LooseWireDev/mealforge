import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDb, migrateDb } from './client';

const MIGRATIONS = new URL('./migrations', import.meta.url).pathname;

/**
 * Regression test for the v2.0.0 upgrade wiping meals and grocery items.
 *
 * The migrator runs each migration inside a transaction, where the
 * `PRAGMA foreign_keys=OFF` emitted into the migration SQL is a no-op — so
 * 0001's meal_plans rebuild (DROP TABLE) cascade-deleted every meal and
 * grocery item on databases where enforcement was on. This walks real
 * old-model data through the REAL migrator (not hand-split SQL) exactly like
 * the app boot does, and asserts the household's data survives.
 */
describe('migrations on existing data', () => {
  let tmp: string;

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('0001 preserves meals and grocery items while converting weeks to plans', () => {
    // Stage 1: a migrations folder containing only 0000, so the migrator
    // records it and later applies 0001 as a pending upgrade.
    tmp = mkdtempSync(join(tmpdir(), 'mealforge-mig-'));
    mkdirSync(join(tmp, 'meta'), { recursive: true });
    cpSync(join(MIGRATIONS, '0000_young_glorian.sql'), join(tmp, '0000_young_glorian.sql'));
    cpSync(join(MIGRATIONS, 'meta/0000_snapshot.json'), join(tmp, 'meta/0000_snapshot.json'));
    const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as {
      entries: unknown[];
    };
    writeFileSync(
      join(tmp, 'meta/_journal.json'),
      JSON.stringify({ ...journal, entries: [journal.entries[0]] }),
    );

    const db = createDb(':memory:');
    migrateDb(db, tmp);

    db.$client.exec(`
      INSERT INTO recipes (id, title, steps_markdown, created_at, updated_at)
        VALUES (1, 'Roast Chicken', '1. Roast.', 1751000000000, 1751000000000);
      INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, section)
        VALUES (1, 'whole chicken', 4, 'lb', 'meat-seafood');
      INSERT INTO meal_plans (id, week_start, status, created_at, updated_at)
        VALUES (1, '2026-07-06', 'active', 1751600000000, 1751600000000);
      INSERT INTO meals (plan_id, recipe_id, day_of_week, meal_type) VALUES (1, 1, 0, 'dinner');
      INSERT INTO grocery_items (plan_id, name, normalized_key, checked)
        VALUES (1, 'whole chicken', 'whole chicken|g', 1);
    `);

    // Stage 2: the boot path — full migrations folder, 0001 pending.
    migrateDb(db, MIGRATIONS);

    const count = (table: string): number =>
      (db.$client.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
    expect(count('meal_plans')).toBe(1);
    expect(count('meals')).toBe(1);
    expect(count('grocery_items')).toBe(1);

    const plan = db.$client.prepare('SELECT name, status FROM meal_plans').get() as {
      name: string;
      status: string;
    };
    expect(plan.name).toBe('Week of 2026-07-06');

    const item = db.$client.prepare('SELECT checked FROM grocery_items').get() as {
      checked: number;
    };
    expect(item.checked).toBe(1);

    // foreign keys are re-enabled after migrating
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
