import { Link } from '@tanstack/react-router';

import { FavoriteButton } from './FavoriteButton';

export interface RecipeCardData {
  id: number;
  title: string;
  tags: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  isFavorite: boolean;
}

interface RecipeCardProps {
  recipe: RecipeCardData;
  /** rendered below the card body, e.g. the plan view's per-meal Complete button */
  action?: React.ReactNode;
}

function totalTime(recipe: RecipeCardData): string | null {
  const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  if (total === 0) return null;
  if (total >= 90) {
    const hours = total / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
  }
  return `${total} min`;
}

export function RecipeCard({ recipe, action }: RecipeCardProps): React.ReactElement {
  const time = totalTime(recipe);

  return (
    <article className="rounded-xl border border-line bg-card">
      <div className="flex items-start gap-3 p-4">
        <Link
          to="/recipes/$recipeId"
          params={{ recipeId: String(recipe.id) }}
          className="min-w-0 flex-1"
        >
          <span className="block font-display text-[1.05rem] font-semibold leading-snug">
            {recipe.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
            {time && <span className="font-quant">{time}</span>}
            {recipe.tags.slice(0, 3).map((tag) => (
              <span key={tag}>· {tag}</span>
            ))}
          </span>
        </Link>
        <FavoriteButton recipeId={recipe.id} isFavorite={recipe.isFavorite} />
      </div>
      {action !== undefined && <div className="border-t border-line px-4 py-2.5">{action}</div>}
    </article>
  );
}
