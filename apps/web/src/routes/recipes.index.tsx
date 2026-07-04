import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { EmptyState } from '../components/EmptyState';
import { RecipeCard } from '../features/recipes/RecipeCard';
import { trpc } from '../lib/trpc';

export const Route = createFileRoute('/recipes/')({
  component: RecipesPage,
});

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function RecipesPage(): React.ReactElement {
  const [tab, setTab] = useState<'favorites' | 'history'>('favorites');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);

  const { data: recipes, isLoading } = trpc.recipes.list.useQuery({
    favoritesOnly: tab === 'favorites',
    ...(debouncedQuery.trim().length > 0 ? { query: debouncedQuery.trim() } : {}),
    limit: 100,
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="pt-2">
        <h1 className="font-display text-2xl font-bold">Recipes</h1>
      </header>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search title, tag, or ingredient"
        className="w-full rounded-xl border border-line bg-card px-4 py-3 text-[16px] placeholder:text-check focus:border-leaf focus:outline-none"
      />

      <div role="tablist" aria-label="Recipe lists" className="flex rounded-xl border border-line bg-card p-1">
        {(['favorites', 'history'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors ${
              tab === t ? 'bg-leaf text-paper' : 'text-ink-soft'
            }`}
          >
            {t === 'favorites' ? '★ Favorites' : 'History'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="p-8 text-center text-sm text-ink-soft">Loading…</p>
      ) : !recipes || recipes.length === 0 ? (
        query.trim().length > 0 ? (
          <EmptyState
            glyph="nothing simmering"
            title="No matches"
            hint={`Nothing in ${tab} matches “${query.trim()}”. Try an ingredient — “pork”, “zucchini” — or clear the search.`}
          />
        ) : tab === 'favorites' ? (
          <EmptyState
            glyph="the keepers"
            title="No favorites yet"
            hint="Tap the star on any recipe you'd cook again. Favorites stay forever, and your assistant can bring them back next week."
          />
        ) : (
          <EmptyState
            glyph="a blank page"
            title="No recipes yet"
            hint="Every recipe from your weekly plans collects here automatically."
          />
        )
      ) : (
        <ul className="flex flex-col gap-2.5">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <RecipeCard recipe={recipe} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
