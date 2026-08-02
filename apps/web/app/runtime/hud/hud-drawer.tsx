'use client';

/**
 * A side region that becomes a sheet on a narrow screen.
 *
 * One component for both presentations, because they are the same panel: the
 * open/closed state is owned by the shell and survives the switch, so resizing
 * a window never closes what the person had open or resets anything behind it.
 *
 * As a drawer it is a real dialog - labelled, modal, Escape closes it, and
 * focus goes into it on open and back to the control that opened it on close.
 * As a column it is a plain `<aside>` with none of that, because a panel that
 * is simply part of the page should not trap anyone.
 */
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

import { createFocusRestorer } from '../../../lib/runtime-hud-layout';

type HudDrawerProps = {
  asDrawer: boolean;
  children: ReactNode;
  /** Where focus returns when the drawer closes. */
  openerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
  /** Localized. Names the region for assistive technology. */
  title: string;
  /** `complementary` in column form; the drawer form is always a dialog. */
  side?: 'end' | 'start';
};

export function HudDrawer({
  asDrawer,
  children,
  onClose,
  open,
  openerRef,
  side = 'end',
  title,
}: HudDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    if (!asDrawer || !open) {
      return undefined;
    }

    const restoreFocus = createFocusRestorer(openerRef.current);
    const panel = panelRef.current;

    // Focus the panel itself rather than hunting for the first control: the
    // contents differ per shell, and a heading-level landing point is what a
    // screen reader user expects from a newly opened dialog.
    panel?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      restoreFocus();
    };
  }, [asDrawer, onClose, open, openerRef]);

  if (!open) {
    return null;
  }

  if (!asDrawer) {
    return (
      <aside
        aria-labelledby={headingId}
        className="grid content-start gap-4"
        data-hud-region="inspector"
      >
        <h2 className="sr-only" id={headingId}>
          {title}
        </h2>
        {children}
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex" data-hud-region="drawer">
      <button
        aria-label={title}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={headingId}
        aria-modal="true"
        className={`relative ms-auto flex h-full w-full max-w-[min(26rem,92vw)] flex-col overflow-y-auto border-amber-400/25 bg-[#140d09] p-4 shadow-2xl shadow-black/60 focus:outline-none ${
          side === 'end' ? 'border-s' : 'me-auto ms-0 border-e'
        }`}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            className="text-sm font-black uppercase tracking-[0.16em] text-amber-200"
            id={headingId}
          >
            {title}
          </h2>
          <button
            className="min-h-10 min-w-10 rounded-xl border border-amber-300/30 px-3 text-sm font-bold text-amber-100 transition hover:border-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
            data-testid="hud-drawer-close"
            onClick={onClose}
            type="button"
          >
            ✕<span className="sr-only"> {title}</span>
          </button>
        </div>
        <div className="grid content-start gap-4">{children}</div>
      </div>
    </div>
  );
}
