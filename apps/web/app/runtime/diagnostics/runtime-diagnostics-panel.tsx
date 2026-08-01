'use client';

/**
 * Raw protocol payloads, for whoever is debugging the table.
 *
 * This module is the whole of the runtime's diagnostic UI, and it lives in its
 * own directory for one reason: **the Player shell must not be able to reach
 * it, and that has to be provable by looking at imports.** A test walks the
 * Player shell's import graph and fails if anything under `diagnostics/`
 * appears in it. That check is worth more than any amount of care at the call
 * site, because it keeps working when someone later adds a panel in a hurry.
 *
 * Nothing here is deleted to satisfy a layout. A GM debugging a live table
 * genuinely needs the last response and the frame log; it simply is not part of
 * playing the game, so it is closed by default and never rendered for a player.
 */
import { useId } from 'react';

import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import { EmptyState, Panel } from '../hud/hud-primitives';

export type DiagnosticsEntry = {
  at: string;
  id: string;
  label: string;
  payload: unknown;
};

type RuntimeDiagnosticsPanelProps = {
  entries: DiagnosticsEntry[];
  lastResponse: { label: string; payload: unknown } | null;
  /** Controlled so the shell owns the "advanced tools" disclosure. */
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sessionSnapshot: unknown;
  t: RuntimeTranslator;
};

export function RuntimeDiagnosticsPanel({
  entries,
  lastResponse,
  onOpenChange,
  open,
  sessionSnapshot,
  t,
}: RuntimeDiagnosticsPanelProps) {
  const regionId = useId();

  return (
    <Panel
      description={t('runtime.debug.description')}
      eyebrow={t('runtime.debug.eyebrow')}
      title={t('runtime.debug.title')}
    >
      <button
        aria-controls={regionId}
        aria-expanded={open}
        className="min-h-10 w-full rounded-xl border border-amber-300/25 bg-black/25 px-3 py-2 text-start text-sm font-semibold text-amber-200 transition hover:border-amber-200/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
        data-testid="runtime-diagnostics-toggle"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        {t('runtime.debug.summary')}
      </button>
      {open ? (
        <div
          className="mt-3 grid gap-3 lg:grid-cols-2"
          data-testid="runtime-diagnostics-body"
          id={regionId}
        >
          <JsonPreview value={lastResponse ?? { status: 'No command yet' }} />
          <JsonPreview value={sessionSnapshot} />
          <div className="max-h-96 overflow-auto rounded-2xl border border-amber-500/15 bg-black/50 p-3 text-xs text-amber-50 lg:col-span-2">
            {entries.length ? (
              entries.map((entry) => (
                <details
                  className="border-b border-amber-500/10 py-2"
                  key={entry.id}
                >
                  <summary className="cursor-pointer text-amber-200">
                    {entry.at} {entry.label}
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-amber-100/80">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                </details>
              ))
            ) : (
              <EmptyState
                detail={t('runtime.debug.emptyDetail')}
                title={t('runtime.debug.emptyTitle')}
              />
            )}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

export function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-2xl border border-amber-500/15 bg-black/50 p-3 text-xs text-amber-100/85">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
