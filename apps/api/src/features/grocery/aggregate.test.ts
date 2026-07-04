import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { IngredientInput } from '@mealforge/shared/schemas';
import { STORE_SECTIONS } from '@mealforge/shared/schemas';

import { aggregateIngredients, normalizedKey } from './aggregate';

function ing(partial: Partial<IngredientInput> & { name: string }): IngredientInput {
  return {
    quantity: 1,
    unit: null,
    section: 'other',
    ...partial,
  };
}

describe('normalizedKey', () => {
  it('is case- and whitespace-insensitive on the name', () => {
    expect(normalizedKey('Chicken  Breast', 'lb')).toBe(normalizedKey('chicken breast', 'lb'));
  });

  it('groups volume units into one family', () => {
    expect(normalizedKey('milk', 'cup')).toBe(normalizedKey('milk', 'tbsp'));
    expect(normalizedKey('milk', 'ml')).toBe(normalizedKey('milk', 'cups'));
  });

  it('groups weight units into one family', () => {
    expect(normalizedKey('flour', 'g')).toBe(normalizedKey('flour', 'lb'));
  });

  it('keeps volume and weight apart', () => {
    expect(normalizedKey('flour', 'cup')).not.toBe(normalizedKey('flour', 'g'));
  });

  it('treats singular and plural count units the same', () => {
    expect(normalizedKey('garlic', 'clove')).toBe(normalizedKey('garlic', 'cloves'));
  });

  it('keeps distinct count units apart', () => {
    expect(normalizedKey('tomatoes', 'can')).not.toBe(normalizedKey('tomatoes', null));
  });
});

describe('aggregateIngredients', () => {
  it('sums the same ingredient in the same unit', () => {
    const out = aggregateIngredients([
      ing({ name: 'rice', quantity: 2, unit: 'cups', section: 'pantry' }),
      ing({ name: 'rice', quantity: 1, unit: 'cup', section: 'pantry' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.quantityText).toBe('3 cups');
    expect(out[0]?.section).toBe('pantry');
  });

  it('sums across compatible volume units', () => {
    const out = aggregateIngredients([
      ing({ name: 'milk', quantity: 1, unit: 'cup', section: 'dairy-eggs' }),
      ing({ name: 'milk', quantity: 8, unit: 'tbsp', section: 'dairy-eggs' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.quantityText).toBe('1½ cups');
  });

  it('sums across compatible weight units', () => {
    const out = aggregateIngredients([
      ing({ name: 'ground beef', quantity: 1, unit: 'lb', section: 'meat-seafood' }),
      ing({ name: 'ground beef', quantity: 8, unit: 'oz', section: 'meat-seafood' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.quantityText).toBe('1½ lb');
  });

  it('displays metric when the first occurrence is metric', () => {
    const out = aggregateIngredients([
      ing({ name: 'butter', quantity: 300, unit: 'g', section: 'dairy-eggs' }),
      ing({ name: 'butter', quantity: 0.5, unit: 'lb', section: 'dairy-eggs' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.quantityText).toBe('527 g');
  });

  it('keeps incompatible unit families as separate line items', () => {
    const out = aggregateIngredients([
      ing({ name: 'flour', quantity: 1, unit: 'cup', section: 'pantry' }),
      ing({ name: 'flour', quantity: 200, unit: 'g', section: 'pantry' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('sums count units and pluralizes the display unit', () => {
    const out = aggregateIngredients([
      ing({ name: 'garlic', quantity: 2, unit: 'clove', section: 'produce' }),
      ing({ name: 'garlic', quantity: 1, unit: 'cloves', section: 'produce' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.quantityText).toBe('3 cloves');
  });

  it('sums bare counts with no unit', () => {
    const out = aggregateIngredients([
      ing({ name: 'eggs', quantity: 2, unit: null, section: 'dairy-eggs' }),
      ing({ name: 'eggs', quantity: 3, unit: null, section: 'dairy-eggs' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.quantityText).toBe('5');
  });

  it('dedupes "to taste" ingredients into one row with empty quantity', () => {
    const out = aggregateIngredients([
      ing({ name: 'salt', quantity: null, unit: null, section: 'spices' }),
      ing({ name: 'salt', quantity: null, unit: null, section: 'spices' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.quantityText).toBe('');
  });

  it('ignores null quantities when a numeric quantity exists on the same key', () => {
    const out = aggregateIngredients([
      ing({ name: 'eggs', quantity: null, unit: null, section: 'dairy-eggs' }),
      ing({ name: 'eggs', quantity: 2, unit: null, section: 'dairy-eggs' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.quantityText).toBe('2');
  });

  it('merges case/whitespace variants and keeps the first display name', () => {
    const out = aggregateIngredients([
      ing({ name: '  Chicken  Breast ', quantity: 1, unit: 'lb', section: 'meat-seafood' }),
      ing({ name: 'chicken breast', quantity: 1, unit: 'lb', section: 'meat-seafood' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe('Chicken Breast');
  });

  it('sorts by store-section order then by name', () => {
    const out = aggregateIngredients([
      ing({ name: 'rice', quantity: 1, unit: 'cup', section: 'pantry' }),
      ing({ name: 'apples', quantity: 3, unit: null, section: 'produce' }),
      ing({ name: 'salmon', quantity: 1, unit: 'lb', section: 'meat-seafood' }),
      ing({ name: 'bananas', quantity: 6, unit: null, section: 'produce' }),
    ]);
    expect(out.map((i) => i.name)).toEqual(['apples', 'bananas', 'salmon', 'rice']);
  });

  it('assigns sequential sortOrder', () => {
    const out = aggregateIngredients([
      ing({ name: 'rice', quantity: 1, unit: 'cup', section: 'pantry' }),
      ing({ name: 'apples', quantity: 3, unit: null, section: 'produce' }),
    ]);
    expect(out.map((i) => i.sortOrder)).toEqual([0, 1]);
  });

  const arbIngredient = fc.record({
    name: fc.constantFrom('flour', 'milk', 'eggs', 'salt', 'chicken', 'rice'),
    quantity: fc.oneof(
      fc.double({ min: 0.25, max: 20, noNaN: true }),
      fc.constant<number | null>(null),
    ),
    unit: fc.constantFrom<string | null>('cup', 'tbsp', 'tsp', 'g', 'lb', 'oz', null),
    section: fc.constantFrom(...STORE_SECTIONS),
  });

  it('property: never produces more rows than inputs', () => {
    fc.assert(
      fc.property(fc.array(arbIngredient, { minLength: 1, maxLength: 30 }), (ingredients) => {
        return aggregateIngredients(ingredients).length <= ingredients.length;
      }),
    );
  });

  it('property: the set of normalized keys is order-independent', () => {
    fc.assert(
      fc.property(fc.array(arbIngredient, { minLength: 1, maxLength: 30 }), (ingredients) => {
        const keys = (xs: IngredientInput[]): string =>
          aggregateIngredients(xs)
            .map((i) => i.normalizedKey)
            .sort()
            .join(',');
        return keys(ingredients) === keys([...ingredients].reverse());
      }),
    );
  });

  it('property: every input ingredient lands in exactly one output row', () => {
    fc.assert(
      fc.property(fc.array(arbIngredient, { minLength: 1, maxLength: 30 }), (ingredients) => {
        const out = aggregateIngredients(ingredients);
        const outKeys = new Set(out.map((i) => i.normalizedKey));
        return ingredients.every((i) => outKeys.has(normalizedKey(i.name, i.unit)));
      }),
    );
  });
});
