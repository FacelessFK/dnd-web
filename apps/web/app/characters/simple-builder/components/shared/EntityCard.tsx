import type { GenderedImageUrls } from '../../types';

interface Props {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  imageUrls?: GenderedImageUrls;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function EntityCard({
  id,
  name,
  tagline,
  imageUrl,
  imageUrls,
  selected,
  onSelect,
}: Props) {
  const images = imageUrls
    ? [
        { alt: `${name} male`, src: imageUrls.male },
        { alt: `${name} female`, src: imageUrls.female },
      ]
    : [{ alt: name, src: imageUrl }];

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
        className={[
          'w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border',
          imageUrls ? 'grid grid-cols-2' : '',
        ].join(' ')}
        style={{
          borderColor: selected ? 'var(--color-gold)' : 'var(--color-border)',
          background: 'var(--color-surface-elevated)',
        }}
      >
        {images.map((image) => (
          <img
            src={image.src}
            alt={image.alt}
            className="w-full h-full object-cover object-top"
            key={image.src}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ))}
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
