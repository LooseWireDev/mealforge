import type { StoreSection } from '@mealforge/shared/schemas';
import { asc, eq } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { groceryItems } from '../../db/schema';

export interface GroceryItemRow {
  id: number;
  planId: number;
  name: string;
  quantityText: string;
  section: string;
  checked: boolean;
  isManual: boolean;
  sortOrder: number;
}

function toRow(row: typeof groceryItems.$inferSelect): GroceryItemRow {
  return {
    id: row.id,
    planId: row.planId,
    name: row.name,
    quantityText: row.quantityText,
    section: row.section,
    checked: row.checked,
    isManual: row.isManual,
    sortOrder: row.sortOrder,
  };
}

export function itemsForPlan(db: Db, planId: number): GroceryItemRow[] {
  return db
    .select()
    .from(groceryItems)
    .where(eq(groceryItems.planId, planId))
    .orderBy(asc(groceryItems.sortOrder), asc(groceryItems.name))
    .all()
    .map(toRow);
}

export function setChecked(db: Db, itemId: number, checked: boolean): GroceryItemRow {
  const updated = db
    .update(groceryItems)
    .set({ checked })
    .where(eq(groceryItems.id, itemId))
    .returning()
    .get();
  if (!updated) {
    throw new Error(`Grocery item ${itemId} does not exist.`);
  }
  return toRow(updated);
}

export function addManualItem(
  db: Db,
  input: {
    planId: number;
    name: string;
    quantityText?: string | undefined;
    section?: StoreSection | undefined;
  },
): GroceryItemRow {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error('Item name must not be empty.');
  }
  const inserted = db
    .insert(groceryItems)
    .values({
      planId: input.planId,
      name,
      // manual items never collide with aggregated keys
      normalizedKey: `manual:${name.toLowerCase()}:${Date.now()}`,
      quantityText: input.quantityText ?? '',
      section: input.section ?? 'other',
      isManual: true,
      // manual items go to the end of their section's list
      sortOrder: 10_000,
    })
    .returning()
    .get();
  return toRow(inserted);
}

export function removeManualItem(db: Db, itemId: number): void {
  const item = db.select().from(groceryItems).where(eq(groceryItems.id, itemId)).get();
  if (!item) return;
  if (!item.isManual) {
    throw new Error('Only manually added items can be removed from the list.');
  }
  db.delete(groceryItems).where(eq(groceryItems.id, itemId)).run();
}
