import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import {
  SECTION_LABELS,
  STORE_SECTIONS,
  sectionSchema,
  type StoreSection,
} from '@mealforge/shared/schemas';
import { weekStartOf } from '@mealforge/shared/utils';

import { EmptyState } from '../components/EmptyState';
import { trpc } from '../lib/trpc';

export const Route = createFileRoute('/grocery')({
  component: GroceryPage,
});

function GroceryPage(): React.ReactElement {
  const weekStart = weekStartOf();
  const { data: plan, isLoading: planLoading } = trpc.plans.byWeek.useQuery({ weekStart });
  const planId = plan?.planId;
  const utils = trpc.useUtils();
  const { data: items, isLoading: itemsLoading } = trpc.grocery.itemsForPlan.useQuery(
    { planId: planId ?? 0 },
    { enabled: planId !== undefined },
  );

  const setChecked = trpc.grocery.setChecked.useMutation({
    // optimistic: flip immediately, the store aisle has no patience for spinners
    onMutate: async ({ itemId, checked }) => {
      if (planId === undefined) return;
      await utils.grocery.itemsForPlan.cancel({ planId });
      utils.grocery.itemsForPlan.setData({ planId }, (old) =>
        old?.map((item) => (item.id === itemId ? { ...item, checked } : item)),
      );
    },
    onSettled: () => {
      if (planId !== undefined) void utils.grocery.itemsForPlan.invalidate({ planId });
    },
  });

  const removeItem = trpc.grocery.removeManualItem.useMutation({
    onSettled: () => {
      if (planId !== undefined) void utils.grocery.itemsForPlan.invalidate({ planId });
    },
  });

  if (planLoading || (planId !== undefined && itemsLoading)) {
    return <p className="p-8 text-center text-sm text-ink-soft">Loading the list…</p>;
  }

  if (!plan || !items) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <header className="pt-2">
          <h1 className="font-display text-2xl font-bold">Grocery</h1>
        </header>
        <EmptyState
          glyph="an empty basket"
          title="No list yet"
          hint="The grocery list builds itself from this week's meal plan. Plan the week in chat first."
        />
      </div>
    );
  }

  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);
  const sections = STORE_SECTIONS.filter((s) => open.some((i) => i.section === s));
  const otherSections = [...new Set(open.map((i) => i.section))].filter(
    (s) => !STORE_SECTIONS.includes(s as StoreSection),
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between pt-2">
        <h1 className="font-display text-2xl font-bold">Grocery</h1>
        <p className="font-quant text-xs text-ink-soft">
          {done.length}/{items.length} in the cart
        </p>
      </header>

      {[...sections, ...otherSections].map((section) => (
        <section key={section}>
          <h2 className="mb-1.5 px-1 font-quant text-[0.65rem] font-semibold uppercase tracking-widest text-ink-soft">
            {SECTION_LABELS[section as StoreSection] ?? section}
          </h2>
          <ul className="overflow-hidden rounded-xl border border-line bg-card">
            {open
              .filter((item) => item.section === section)
              .map((item) => (
                <GroceryRow
                  key={item.id}
                  item={item}
                  onToggle={() => setChecked.mutate({ itemId: item.id, checked: true })}
                  onRemove={item.isManual ? () => removeItem.mutate({ itemId: item.id }) : undefined}
                />
              ))}
          </ul>
        </section>
      ))}

      {open.length === 0 && items.length > 0 && (
        <p className="rounded-xl bg-butter-soft p-4 text-center text-sm font-medium">
          Everything's in the cart. Go home and cook. 🍳
        </p>
      )}

      {planId !== undefined && <AddItemForm planId={planId} />}

      {done.length > 0 && (
        <section className="opacity-70">
          <h2 className="mb-1.5 px-1 font-quant text-[0.65rem] font-semibold uppercase tracking-widest text-check">
            In the cart
          </h2>
          <ul className="overflow-hidden rounded-xl border border-line bg-card">
            {done.map((item) => (
              <GroceryRow
                key={item.id}
                item={item}
                onToggle={() => setChecked.mutate({ itemId: item.id, checked: false })}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface GroceryRowProps {
  item: {
    id: number;
    name: string;
    quantityText: string;
    checked: boolean;
    isManual: boolean;
  };
  onToggle: () => void;
  onRemove?: (() => void) | undefined;
}

function GroceryRow({ item, onToggle, onRemove }: GroceryRowProps): React.ReactElement {
  return (
    <li className="flex items-center border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-13 flex-1 items-center gap-3 px-4 py-2 text-left"
      >
        <span
          aria-hidden
          className={`flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
            item.checked ? 'border-leaf bg-leaf text-paper' : 'border-check text-transparent'
          }`}
        >
          ✓
        </span>
        <span className={`flex-1 text-[0.95rem] ${item.checked ? 'text-check line-through' : ''}`}>
          {item.name}
          {item.isManual && <span className="ml-1.5 font-quant text-[0.6rem] uppercase text-check">added</span>}
        </span>
        {item.quantityText.length > 0 && (
          <span className="shrink-0 font-quant text-sm text-ink-soft">{item.quantityText}</span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="px-3 py-3 text-lg text-check active:text-tomato"
        >
          ×
        </button>
      )}
    </li>
  );
}

function AddItemForm({ planId }: { planId: number }): React.ReactElement {
  const [name, setName] = useState('');
  const [section, setSection] = useState<StoreSection>('other');
  const utils = trpc.useUtils();
  const add = trpc.grocery.addManualItem.useMutation({
    onSuccess: () => {
      setName('');
      void utils.grocery.itemsForPlan.invalidate({ planId });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed.length === 0) return;
        add.mutate({ planId, name: trimmed, section });
      }}
      className="flex gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an item…"
        aria-label="Add a grocery item"
        className="min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-3 text-[16px] placeholder:text-check focus:border-leaf focus:outline-none"
      />
      <select
        value={section}
        onChange={(e) => setSection(sectionSchema.parse(e.target.value))}
        aria-label="Store section"
        className="rounded-xl border border-line bg-card px-2 py-3 text-sm text-ink-soft focus:border-leaf focus:outline-none"
      >
        {STORE_SECTIONS.map((s) => (
          <option key={s} value={s}>
            {SECTION_LABELS[s]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={name.trim().length === 0 || add.isPending}
        className="rounded-xl bg-leaf px-4 text-xl font-bold text-paper disabled:opacity-40"
      >
        +
      </button>
    </form>
  );
}
