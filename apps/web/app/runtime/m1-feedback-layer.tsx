'use client';

/**
 * The transient callout strip.
 *
 * Renders feedback items and, when motion is welcome, schedules their
 * dismissal. Under `prefers-reduced-motion` no timer is scheduled at all: the
 * messages stay until newer ones push them out, because someone who asked for
 * less motion did not ask for less information.
 *
 * `aria-live="polite"` rather than `assertive` - a hit landing is worth
 * announcing and not worth interrupting a screen reader mid-sentence.
 */
import { useEffect, useState } from 'react';

import { useI18n, type MessageKey } from '../../lib/i18n';
import {
  m1FeedbackDismissDelayMs,
  type M1FeedbackItem,
} from '../../lib/m1-feedback';

type M1FeedbackLayerProps = {
  items: M1FeedbackItem[];
  onDismiss: (id: string) => void;
  prefersReducedMotion: boolean;
  statusKey: MessageKey;
};

const TONE_CLASS: Record<M1FeedbackItem['tone'], string> = {
  danger: 'border-rose-400/60 text-rose-100',
  info: 'border-amber-400/40 text-amber-100',
  success: 'border-emerald-400/50 text-emerald-100',
  warning: 'border-orange-400/50 text-orange-100',
};

export function M1FeedbackLayer({
  items,
  onDismiss,
  prefersReducedMotion,
  statusKey,
}: M1FeedbackLayerProps) {
  const { t } = useI18n();
  const delayMs = m1FeedbackDismissDelayMs(prefersReducedMotion);

  useEffect(() => {
    if (delayMs === null || items.length === 0) {
      return undefined;
    }

    // One timer per mounted item, cleared on unmount, so a burst cannot leave
    // an orphan timer holding a reference to a stale list.
    const timers = items.map((item) =>
      setTimeout(() => onDismiss(item.id), delayMs),
    );

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [delayMs, items, onDismiss]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none grid gap-1"
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
      data-testid="m1-feedback-layer"
    >
      <p
        className="text-xs font-bold text-amber-200/80"
        data-testid="m1-status"
      >
        {t(statusKey)}
      </p>
      {items.map((item) => (
        <p
          key={item.id}
          className={`rounded-xl border bg-black/40 px-3 py-1 text-sm ${TONE_CLASS[item.tone]} ${
            prefersReducedMotion ? '' : 'transition-opacity duration-300'
          }`}
          data-feedback-id={item.id}
        >
          {t(
            item.messageKey,
            Object.fromEntries(
              Object.entries(item.values ?? {}).map(([name, value]) => [
                name,
                value.startsWith('runtime.m1.')
                  ? t(value as MessageKey)
                  : value,
              ]),
            ),
          )}
        </p>
      ))}
    </div>
  );
}

/** Tracks the media query, defaulting to "motion is fine" before it resolves. */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => setPrefersReducedMotion(query.matches);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  return prefersReducedMotion;
}
