import { trpc } from '../../lib/trpc';

interface FavoriteButtonProps {
  recipeId: number;
  isFavorite: boolean;
}

export function FavoriteButton({ recipeId, isFavorite }: FavoriteButtonProps): React.ReactElement {
  const utils = trpc.useUtils();
  const toggle = trpc.recipes.toggleFavorite.useMutation({
    onSettled: () => {
      void utils.recipes.invalidate();
      void utils.plans.invalidate();
    },
  });

  return (
    // span with role=button: this control often sits inside the card's own
    // expand <button>, and nested <button>s are invalid HTML
    <span
      role="button"
      tabIndex={0}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggle.mutate({ id: recipeId });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          toggle.mutate({ id: recipeId });
        }
      }}
      className={`-m-2 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl leading-none transition-transform active:scale-90 ${
        isFavorite ? 'text-butter' : 'text-check'
      }`}
    >
      {isFavorite ? '★' : '☆'}
    </span>
  );
}
