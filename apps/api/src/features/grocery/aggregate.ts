import type { IngredientInput, StoreSection } from '@mealforge/shared/schemas';
import { STORE_SECTIONS } from '@mealforge/shared/schemas';

export interface AggregatedItem {
  name: string;
  normalizedKey: string;
  quantityText: string;
  section: StoreSection;
  sortOrder: number;
}

// Canonical factors: volume in ml, weight in g.
const ML_PER_TSP = 4.92892;
const ML_PER_TBSP = 14.7868;
const ML_PER_CUP = 236.588;
const G_PER_OZ = 28.3495;

const VOLUME_ML: Record<string, number> = {
  tsp: 4.92892,
  teaspoon: 4.92892,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  cup: 236.588,
  'fl oz': 29.5735,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
  ml: 1,
  milliliter: 1,
  millilitre: 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
};

const WEIGHT_G: Record<string, number> = {
  g: 1,
  gram: 1,
  kg: 1000,
  kilogram: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
};

const METRIC_UNITS = new Set([
  'ml',
  'milliliter',
  'millilitre',
  'l',
  'liter',
  'litre',
  'g',
  'gram',
  'kg',
  'kilogram',
]);

function normalizeUnit(unit: string): string {
  let u = unit.trim().toLowerCase().replace(/\.$/, '');
  if (u === 'lbs') return 'lb';
  // singularize: "cups" -> "cup", "cloves" -> "clove" — but not "glass" -> "glas"
  if (u.endsWith('s') && !u.endsWith('ss')) u = u.slice(0, -1);
  return u;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

type UnitFamily =
  | { kind: 'volume'; toCanonical: number; metric: boolean }
  | { kind: 'weight'; toCanonical: number; metric: boolean }
  | { kind: 'count'; unit: string };

function unitFamily(unit: string | null): UnitFamily {
  if (unit === null) return { kind: 'count', unit: '' };
  const u = normalizeUnit(unit);
  const vol = VOLUME_ML[u];
  if (vol !== undefined) return { kind: 'volume', toCanonical: vol, metric: METRIC_UNITS.has(u) };
  const wt = WEIGHT_G[u];
  if (wt !== undefined) return { kind: 'weight', toCanonical: wt, metric: METRIC_UNITS.has(u) };
  return { kind: 'count', unit: u };
}

export function normalizedKey(name: string, unit: string | null): string {
  const family = unitFamily(unit);
  const familyKey = family.kind === 'count' ? `count:${family.unit}` : family.kind;
  return `${normalizeName(name).toLowerCase()}|${familyKey}`;
}

const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

// "1.5" -> "1½", "3" -> "3", "1.13" -> "1.1"
function formatNumber(value: number): string {
  if (value >= 100) return String(Math.round(value));
  const whole = Math.floor(value);
  const frac = value - whole;
  if (frac < 0.03) return String(whole === 0 ? value.toFixed(1) : whole);
  if (frac > 0.97) return String(whole + 1);
  for (const [f, glyph] of FRACTIONS) {
    if (Math.abs(frac - f) <= 0.03) {
      return whole === 0 ? glyph : `${whole}${glyph}`;
    }
  }
  const rounded = value.toFixed(1);
  return rounded.endsWith('.0') ? String(Math.round(value)) : rounded;
}

function formatVolume(totalMl: number, metric: boolean): string {
  if (metric) {
    if (totalMl >= 1000) return `${formatNumber(totalMl / 1000)} l`;
    return `${Math.round(totalMl)} ml`;
  }
  const cups = totalMl / ML_PER_CUP;
  if (cups >= 1) return `${formatNumber(cups)} ${formatNumber(cups) === '1' ? 'cup' : 'cups'}`;
  const tbsp = totalMl / ML_PER_TBSP;
  if (tbsp >= 1) return `${formatNumber(tbsp)} tbsp`;
  return `${formatNumber(totalMl / ML_PER_TSP)} tsp`;
}

function formatWeight(totalG: number, metric: boolean): string {
  if (metric) {
    if (totalG >= 1000) return `${formatNumber(totalG / 1000)} kg`;
    return `${Math.round(totalG)} g`;
  }
  const oz = totalG / G_PER_OZ;
  if (oz >= 16) return `${formatNumber(oz / 16)} lb`;
  return `${formatNumber(oz)} oz`;
}

function formatCount(total: number, unit: string): string {
  const num = formatNumber(total);
  if (unit === '') return num;
  const plural = total > 1 && !unit.endsWith('s') ? `${unit}s` : unit;
  return `${num} ${plural}`;
}

interface Bucket {
  name: string;
  section: StoreSection;
  family: UnitFamily;
  total: number;
  hasQuantity: boolean;
}

export function aggregateIngredients(ingredients: IngredientInput[]): AggregatedItem[] {
  const buckets = new Map<string, Bucket>();

  for (const ingredient of ingredients) {
    const key = normalizedKey(ingredient.name, ingredient.unit);
    const family = unitFamily(ingredient.unit);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        name: normalizeName(ingredient.name),
        section: ingredient.section,
        family,
        total: 0,
        hasQuantity: false,
      };
      buckets.set(key, bucket);
    }
    if (ingredient.quantity !== null) {
      bucket.hasQuantity = true;
      bucket.total +=
        family.kind === 'count' ? ingredient.quantity : ingredient.quantity * family.toCanonical;
    }
  }

  const sectionRank = new Map<string, number>(STORE_SECTIONS.map((s, i) => [s, i]));
  const items = [...buckets.entries()]
    .map(([key, bucket]) => ({
      name: bucket.name,
      normalizedKey: key,
      quantityText: bucket.hasQuantity ? formatQuantity(bucket) : '',
      section: bucket.section,
      sortOrder: 0,
    }))
    .sort((a, b) => {
      const bySection = (sectionRank.get(a.section) ?? 99) - (sectionRank.get(b.section) ?? 99);
      if (bySection !== 0) return bySection;
      return a.name.localeCompare(b.name);
    });

  return items.map((item, i) => ({ ...item, sortOrder: i }));
}

function formatQuantity(bucket: Bucket): string {
  switch (bucket.family.kind) {
    case 'volume':
      return formatVolume(bucket.total, bucket.family.metric);
    case 'weight':
      return formatWeight(bucket.total, bucket.family.metric);
    case 'count':
      return formatCount(bucket.total, bucket.family.unit);
  }
}
