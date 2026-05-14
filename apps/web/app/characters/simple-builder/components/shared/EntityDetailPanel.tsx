import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  imageUrl: string;
  children: ReactNode;
  onSelect: () => void;
  selectLabel?: string;
  selectDisabled?: boolean;
}

export function EntityDetailPanel({
  open,
  onClose,
  title,
  imageUrl,
  children,
  onSelect,
  selectLabel = 'Select',
  selectDisabled = false,
}: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[100] lg:hidden"
        onClick={onClose}
      />
      <div
        className="fixed inset-0 bg-black/40 z-[100] hidden lg:block"
        onClick={onClose}
      />

      {/* Panel — bottom sheet on mobile, right sidebar on desktop */}
      <div
        className={[
          'fixed z-[200] flex flex-col',
          'bottom-0 left-0 right-0 rounded-t-3xl max-h-[85vh]',
          'lg:bottom-0 lg:top-0 lg:left-auto lg:right-0 lg:w-[440px] lg:rounded-none lg:max-h-screen',
        ].join(' ')}
        style={{
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          borderLeft: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-4 p-5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-surface-elevated)',
            }}
          >
            <img
              alt={title}
              className="h-full w-full object-cover object-top"
              src={imageUrl}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="text-xl font-bold"
              style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>

        {/* Footer */}
        <div
          className="p-5 border-t flex-shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={() => {
              onSelect();
              onClose();
            }}
            disabled={selectDisabled}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            style={{
              background: selectDisabled
                ? 'var(--color-border)'
                : 'var(--color-gold)',
              color: selectDisabled ? 'var(--color-text-muted)' : '#0f1117',
              boxShadow: selectDisabled
                ? 'none'
                : '0 0 16px rgba(201,168,76,0.3)',
            }}
          >
            {selectLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/** Reusable section inside the panel */
export function PanelSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3
        className="text-[11px] font-bold tracking-widest uppercase mb-2"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

export function TraitCard({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div
      className="rounded-xl p-3 mb-2"
      style={{
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        className="text-sm font-semibold mb-1"
        style={{ color: 'var(--color-gold)' }}
      >
        {name}
      </div>
      <div
        className="text-xs leading-relaxed"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {description}
      </div>
    </div>
  );
}

export function StatPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full mr-2 mb-2"
      style={{
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text)',
      }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
