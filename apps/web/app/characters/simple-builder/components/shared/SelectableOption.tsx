import type { ReactNode } from 'react';

type SelectableOptionProps = {
  children: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  selected: boolean;
};

export function SelectableOption({
  children,
  description,
  disabled = false,
  onClick,
  selected,
}: SelectableOptionProps) {
  return (
    <button
      aria-pressed={selected}
      className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-xs transition-all duration-100 hover:border-[var(--color-gold-border)] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: selected
          ? 'var(--color-gold-dim)'
          : 'var(--color-surface-elevated)',
        border: `1px solid ${
          selected ? 'var(--color-gold)' : 'var(--color-border)'
        }`,
        color: selected ? 'var(--color-gold)' : 'var(--color-text)',
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold"
        style={{
          background: selected ? 'var(--color-gold)' : 'var(--color-border)',
          color: selected ? '#0f1117' : 'transparent',
        }}
      >
        {selected ? '\u2713' : ''}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{children}</span>
        {description ? (
          <span
            className="mt-0.5 block font-normal"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}
