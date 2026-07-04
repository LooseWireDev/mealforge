import { SECTION_LABELS, STORE_SECTIONS, type StoreSection } from '@mealforge/shared/schemas';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { FavoriteButton } from '../features/recipes/FavoriteButton';
import { splitSteps, stepsToHtml } from '../lib/steps';
import { trpc } from '../lib/trpc';

interface RecipeSearch {
  cook?: boolean;
}

export const Route = createFileRoute('/recipes/$recipeId')({
  validateSearch: (search: Record<string, unknown>): RecipeSearch =>
    search['cook'] === true || search['cook'] === 'true' ? { cook: true } : {},
  component: RecipeDetailPage,
});

function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return '';
  const num = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  return unit ? `${num} ${unit}` : num;
}

function RecipeDetailPage(): React.ReactElement {
  const { recipeId } = Route.useParams();
  const { cook } = Route.useSearch();
  const { data: recipe, isLoading } = trpc.recipes.byId.useQuery({ id: Number(recipeId) });

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-ink-soft">Loading…</p>;
  }
  if (!recipe) {
    return (
      <div className="p-8 text-center text-sm text-ink-soft">
        <p>This recipe doesn't exist (it may have been replaced in a plan revision).</p>
        <Link to="/recipes" className="mt-3 inline-block font-semibold text-leaf">
          Back to recipes
        </Link>
      </div>
    );
  }

  if (cook) {
    return <CookMode title={recipe.title} stepsMarkdown={recipe.stepsMarkdown} />;
  }

  const bySection = new Map<string, typeof recipe.ingredients>();
  for (const ingredient of recipe.ingredients) {
    const list = bySection.get(ingredient.section) ?? [];
    list.push(ingredient);
    bySection.set(ingredient.section, list);
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight">{recipe.title}</h1>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-quant text-xs text-ink-soft">
            <span>serves {recipe.servings}</span>
            {recipe.prepMinutes !== null && <span>prep {recipe.prepMinutes}m</span>}
            {recipe.cookMinutes !== null && <span>cook {recipe.cookMinutes}m</span>}
          </p>
        </div>
        <FavoriteButton recipeId={recipe.id} isFavorite={recipe.isFavorite} />
      </header>

      {recipe.description.length > 0 && (
        <p className="text-sm leading-relaxed text-ink-soft">{recipe.description}</p>
      )}

      <Link
        to="/recipes/$recipeId"
        params={{ recipeId }}
        search={{ cook: true }}
        className="rounded-xl bg-leaf py-3.5 text-center text-base font-bold text-paper active:bg-leaf-deep"
      >
        Start cooking
      </Link>

      <section>
        <h2 className="mb-2 font-quant text-xs font-semibold uppercase tracking-widest text-ink-soft">
          Ingredients
        </h2>
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {[
            ...STORE_SECTIONS.filter((s) => bySection.has(s)),
            ...[...bySection.keys()].filter((s) => !STORE_SECTIONS.includes(s as StoreSection)),
          ].map((section) => (
            <div key={section} className="border-b border-line last:border-b-0">
              {bySection.size > 1 && (
                <p className="border-b border-line bg-paper px-4 py-1.5 font-quant text-[0.65rem] font-semibold uppercase tracking-widest text-ink-soft">
                  {SECTION_LABELS[section as StoreSection] ?? section}
                </p>
              )}
              <ul>
                {(bySection.get(section) ?? []).map((ingredient) => (
                  <li
                    key={ingredient.id}
                    className="flex justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span>{ingredient.name}</span>
                    <span className="shrink-0 font-quant text-ink-soft">
                      {formatQuantity(ingredient.quantity, ingredient.unit) || 'to taste'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-quant text-xs font-semibold uppercase tracking-widest text-ink-soft">
          Steps
        </h2>
        <div
          className="steps-md rounded-xl border border-line bg-card p-4 text-[0.95rem]"
          // recipe markdown comes from the household's own agent pushes
          dangerouslySetInnerHTML={{ __html: stepsToHtml(recipe.stepsMarkdown) }}
        />
      </section>

      {recipe.usedInWeeks.length > 0 && (
        <p className="pb-2 text-center font-quant text-xs text-check">
          cooked {recipe.usedInWeeks.length === 1 ? 'once' : `${recipe.usedInWeeks.length}×`} · last
          week of {recipe.usedInWeeks[0]}
        </p>
      )}
    </div>
  );
}

function CookMode({
  title,
  stepsMarkdown,
}: {
  title: string;
  stepsMarkdown: string;
}): React.ReactElement {
  const navigate = useNavigate();
  const { recipeId } = Route.useParams();
  const steps = splitSteps(stepsMarkdown);
  const [index, setIndex] = useState(0);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    // keep the screen on while cooking (best effort — not all browsers)
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request('screen')
      .then((lock) => {
        wakeLock.current = lock;
      })
      .catch(() => undefined);
    return () => {
      void wakeLock.current?.release().catch(() => undefined);
    };
  }, []);

  const step = steps[index] ?? '';
  const done = (): void => {
    void navigate({ to: '/recipes/$recipeId', params: { recipeId }, search: {} });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="min-w-0 truncate font-display text-sm italic text-ink-soft">{title}</p>
        <button
          type="button"
          onClick={done}
          className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-leaf"
        >
          Exit
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-4 overflow-y-auto px-6">
        <p className="font-display text-5xl font-semibold italic text-leaf">
          {index + 1}
          <span className="text-xl text-check"> / {steps.length}</span>
        </p>
        <p className="text-2xl font-medium leading-snug">{step}</p>
      </div>

      <div className="flex gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex-1 rounded-xl border border-line bg-card py-4 text-base font-bold text-ink disabled:opacity-40"
        >
          Back
        </button>
        {index < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
            className="flex-[2] rounded-xl bg-leaf py-4 text-base font-bold text-paper active:bg-leaf-deep"
          >
            Next step
          </button>
        ) : (
          <button
            type="button"
            onClick={done}
            className="flex-[2] rounded-xl bg-butter py-4 text-base font-bold text-ink"
          >
            Done — serve it
          </button>
        )}
      </div>
    </div>
  );
}
