import { useEffect, type ReactNode } from 'react';

type InfoButtonProps = {
  label: string;
  onClick: () => void;
};

export function InfoButton({ label, onClick }: InfoButtonProps) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition-colors hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]"
      onClick={onClick}
      style={{
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-muted)',
      }}
      title={label}
      type="button"
    >
      i
    </button>
  );
}

type InfoModalProps = {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function InfoModal({ children, onClose, open, title }: InfoModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <button
        aria-label="Dismiss information overlay"
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={onClose}
        type="button"
      />
      <div
        aria-modal="true"
        className="relative w-full max-w-sm rounded-2xl border p-5 shadow-2xl"
        role="dialog"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            aria-label="Close information"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]"
            onClick={onClose}
            style={{ color: 'var(--color-text-muted)' }}
            type="button"
          >
            x
          </button>
        </div>
        <div
          className="mt-3 text-sm leading-6"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
