interface Props {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function EntityCard({
  id,
  name,
  tagline,
  imageUrl,
  selected,
  onSelect,
}: Props) {
  return (
    <button
      onClick={() => onSelect(id)}
      className="flex flex-col items-center gap-3 p-4 rounded-2xl border text-left w-full transition-all duration-150 active:scale-[0.97]"
      style={{
        background: selected ? 'var(--color-gold-dim)' : 'var(--color-surface)',
        borderColor: selected ? 'var(--color-gold)' : 'var(--color-border)',
        boxShadow: selected
          ? '0 0 20px rgba(201,168,76,0.25)'
          : '0 1px 4px rgba(0,0,0,0.2)',
      }}
    >
      <div
        className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border"
        style={{
          borderColor: selected ? 'var(--color-gold)' : 'var(--color-border)',
          background: 'var(--color-surface-elevated)',
        }}
      >
        <img
          alt={name}
          className="h-full w-full object-cover object-top"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
          src={imageUrl}
        />
      </div>
      <div className="flex-1 min-w-0 text-center">
        <div
          className="font-semibold text-sm truncate"
          style={{
            color: selected ? 'var(--color-gold)' : 'var(--color-text)',
          }}
        >
          {name}
        </div>
        <div
          className="text-[11px] mt-0.5 line-clamp-2"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {tagline}
        </div>
      </div>
    </button>
  );
}
