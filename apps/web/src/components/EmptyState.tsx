interface EmptyStateProps {
  glyph: string;
  title: string;
  hint: string;
}

export function EmptyState({ glyph, title, hint }: EmptyStateProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      <p aria-hidden className="font-display text-5xl italic text-leaf opacity-80">
        {glyph}
      </p>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="max-w-70 text-sm leading-relaxed text-ink-soft">{hint}</p>
    </div>
  );
}
