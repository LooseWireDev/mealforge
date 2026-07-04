import { z } from 'zod';

// Store sections, in the order they appear in the grocery list UI.
export const STORE_SECTIONS = [
  'produce',
  'meat-seafood',
  'dairy-eggs',
  'bakery',
  'pantry',
  'frozen',
  'spices',
  'beverages',
  'other',
] as const;

export const sectionSchema = z.enum(STORE_SECTIONS);

export type StoreSection = z.infer<typeof sectionSchema>;

export const SECTION_LABELS: Record<StoreSection, string> = {
  produce: 'Produce',
  'meat-seafood': 'Meat & Seafood',
  'dairy-eggs': 'Dairy & Eggs',
  bakery: 'Bakery',
  pantry: 'Pantry',
  frozen: 'Frozen',
  spices: 'Spices',
  beverages: 'Beverages',
  other: 'Other',
};
