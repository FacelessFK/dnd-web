'use client';

/**
 * The page both shells sit inside.
 *
 * Owns the landmarks (`header`, `nav`, `main`), the seat controls, the panel
 * toggles and the two notices that outrank gameplay - a failed command and a
 * partial recovery. Everything role-specific is `children`.
 *
 * It is shared rather than duplicated because the parts it owns are the ones
 * that must behave identically for both roles: a GM and a player recovering
 * from the same dropped connection should be looking at the same control in the
 * same place. What it deliberately does *not* own is anything about the game -
 * no map, no character, no tools - so neither shell can leak into the other
 * through it.
 */
import type { ReactNode, RefObject } from 'react';
import Link from 'next/link';

import { LanguageSwitcher } from '../../../lib/i18n';
import type { RuntimeHudModel } from '../../../lib/use-runtime-hud';
import { Notice } from '../hud/hud-primitives';
import { RuntimeSessionBar } from './runtime-session-bar';

export type RuntimeShellFrameProps = {
  children: ReactNode;
  hud: RuntimeHudModel;
  inspectorLabel: string;
  inspectorOpen: boolean;
  inspectorOpenerRef: RefObject<HTMLButtonElement | null>;
  onToggleInspector: () => void;
  onToggleTools: () => void;
  role: 'gm' | 'player';
  toolsLabel: string;
  toolsOpen: boolean;
  toolsOpenerRef: RefObject<HTMLButtonElement | null>;
};

export function RuntimeShellFrame({
  children,
  hud,
  inspectorLabel,
  inspectorOpen,
  inspectorOpenerRef,
  onToggleInspector,
  onToggleTools,
  role,
  toolsLabel,
  toolsOpen,
  toolsOpenerRef,
}: RuntimeShellFrameProps) {
  const { runtime, seats, session, t } = hud;

  return (
    <main
      className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100"
      data-runtime-shell={role}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(245,158,11,0.12),transparent_30%),linear-gradient(135deg,#0b1020_0%,#111827_52%,#0f172a_100%)]" />

      <div className="relative mx-auto flex max-w-[1800px] flex-col gap-4 px-3 py-4 sm:px-5 lg:px-6">
        <header className="grid gap-3 rounded-3xl border border-slate-700/70 bg-slate-900/85 p-3 shadow-xl shadow-black/25 backdrop-blur sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-3">
              <h1 className="truncate text-lg font-black tracking-tight text-slate-50 sm:text-xl">
                {t('runtime.title')}
              </h1>
              <p className="hidden text-xs text-slate-400 sm:block">
                {role === 'gm'
                  ? t('runtime.mode.dm')
                  : t('runtime.mode.player')}
              </p>
            </div>
            <nav
              aria-label={t('runtime.nav.label')}
              className="flex flex-wrap items-center gap-2 text-sm font-bold"
            >
              <Link
                className="min-h-10 rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-slate-300 transition hover:border-slate-500 hover:text-slate-50"
                href="/"
              >
                {t('common.dashboard')}
              </Link>
              <Link
                className="min-h-10 rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-slate-300 transition hover:border-slate-500 hover:text-slate-50"
                href="/characters"
              >
                {t('runtime.nav.characters')}
              </Link>
              <LanguageSwitcher />
              <button
                aria-expanded={toolsOpen}
                className="min-h-10 rounded-xl border border-amber-400/35 bg-amber-950/30 px-3 py-2 text-amber-100 transition hover:border-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                data-testid="hud-toggle-tools"
                onClick={onToggleTools}
                ref={toolsOpenerRef}
                type="button"
              >
                {toolsLabel}
              </button>
              <button
                aria-expanded={inspectorOpen}
                className="min-h-10 rounded-xl border border-sky-300/35 bg-sky-950/30 px-3 py-2 text-sky-100 transition hover:border-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                data-testid="hud-toggle-inspector"
                onClick={onToggleInspector}
                ref={inspectorOpenerRef}
                type="button"
              >
                {inspectorLabel}
              </button>
            </nav>
          </div>

          <RuntimeSessionBar
            busyReason={hud.scene.busyReason}
            joinDisabledReason={hud.table.disabledReasons.joinPlayer}
            mode={hud.mode}
            onCreateSession={hud.actions.createSession}
            onJoinSession={hud.actions.joinCurrentPlayer}
            onLocalReset={() => {
              session.actions.resetLocal();
              hud.draftActions.resetCharacter(seats.playerDisplayName);
            }}
            onRecover={() => void session.actions.recover()}
            onSessionIdChange={(sessionId) =>
              session.actions.switchIdentity({ sessionId })
            }
            onSwitchMode={(mode) => session.actions.switchIdentity({ mode })}
            onToggleSubscription={() =>
              session.streamEnabled
                ? session.actions.unsubscribe()
                : session.actions.resubscribe()
            }
            recoverDisabledReason={hud.table.disabledReasons.recover}
            sessionId={seats.sessionId}
            streamEnabled={session.streamEnabled}
            t={t}
          />
        </header>

        {/*
          A live region: a command failing and a recovery landing short are both
          things that happen without the person having moved focus.
        */}
        <div aria-live="polite" className="grid gap-3">
          {runtime.commandError ? (
            <Notice title={t('runtime.notice.commandFailed')} tone="danger">
              {runtime.commandError}
            </Notice>
          ) : null}
          {runtime.recoveryNotes.length ? (
            <Notice
              title={t('runtime.notice.recoveryWithNotes')}
              tone="warning"
            >
              <ul className="list-disc space-y-1 ps-5">
                {runtime.recoveryNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>

        {children}
      </div>
    </main>
  );
}
