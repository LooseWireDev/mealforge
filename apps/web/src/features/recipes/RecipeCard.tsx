import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { FavoriteButton } from './FavoriteButton';

export interface RecipeCardData {
  id: number;
  title: string;
  description: string;
  tags: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  isFavorite: boolean;
}

interface RecipeCardProps {
  recipe: RecipeCardData;
  /** e.g. "Monday" on the week view; omitted in favorites/history lists */
  dayLabel?: string;
  highlight?: boolean;
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

export function RecipeCard({ recipe, dayLabel, highlight }: RecipeCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const time = totalTime(recipe);

  return (
    <article
      className={`rounded-xl border bg-card transition-shadow ${
        highlight ? 'border-butter shadow-[0_0_0_3px_var(--butter-soft)]' : 'border-line'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        {dayLabel !== undefined && (
          <span className="w-11 shrink-0 pt-0.5 font-display text-lg font-semibold italic leading-none text-leaf">
            {dayLabel.slice(0, 3)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[1.05rem] font-semibold leading-snug">
            {recipe.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
            {time && <span className="font-quant">{time}</span>}
            {recipe.tags.slice(0, 3).map((tag) => (
              <span key={tag}>· {tag}</span>
            ))}
          </span>
        </span>
        <FavoriteButton recipeId={recipe.id} isFavorite={recipe.isFavorite} />
      </button>

      {expanded && (
        <div className="border-t border-line px-4 py-3">
          {recipe.description.length > 0 && (
            <p className="text-sm leading-relaxed text-ink-soft">{recipe.description}</p>
          )}
          <Link
            to="/recipes/$recipeId"
            params={{ recipeId: String(recipe.id) }}
            className="mt-3 inline-block rounded-lg bg-leaf px-4 py-2 text-sm font-semibold text-paper"
          >
            Open recipe
          </Link>
        </div>
      )}
    </article>
  );
}
