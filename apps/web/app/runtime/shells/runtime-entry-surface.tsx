'use client';

/**
 * The screen before there is a table.
 *
 * A focused surface rather than the full HUD with empty panels. Rendering the
 * game shell against no session was the old behaviour, and it meant the first
 * thing anyone saw was a board with nothing on it surrounded by controls that
 * all refused to work - which reads as broken rather than as "not started".
 *
 * The three ways in are stated as three ways in: a GM creates a table, a player
 * joins one with its code, and either can recover a seat they already hold.
 *
 * Failures here are the sensitive ones. A seat conflict and a bad credential
 * are both reported as safe bilingual sentences and neither is allowed to carry
 * a token or a participant ID, because this surface is reachable by anyone who
 * has a session code.
 */
import Link from 'next/link';

import { LanguageSwitcher } from '../../../lib/i18n';
import { getDemoScenarioById } from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeHudModel } from '../../../lib/use-runtime-hud';
import { selectConnectionPresentation } from '../../../lib/runtime-shell-view';
import {
  ActionButton,
  Notice,
  Panel,
  StatusBadge,
} from '../hud/hud-primitives';
import { RuntimeSessionBar } from './runtime-session-bar';

export function RuntimeEntrySurface({ hud }: { hud: RuntimeHudModel }) {
  const { runtime, seats, session, t } = hud;
  const connection = selectConnectionPresentation(runtime);

  return (
    <main
      className="relative grid min-h-screen place-items-start overflow-x-hidden bg-slate-950 text-slate-100"
      data-runtime-shell="entry"
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(245,158,11,0.16),transparent_45%),linear-gradient(135deg,#0b1020_0%,#111827_52%,#0f172a_100%)]" />

      <div className="relative mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
        <header className="mb-6 grid gap-4">
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
          </nav>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
              {t('runtime.eyebrow')}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-50 sm:text-4xl">
              {t('runtime.title')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              {t('runtime.entry.summary')}
            </p>
          </div>
        </header>

        <div aria-live="polite" className="mb-4 grid gap-3">
          {runtime.commandError ? (
            <Notice title={t('runtime.notice.commandFailed')} tone="danger">
              {runtime.commandError}
            </Notice>
          ) : null}
          {connection.needsUserAction ? (
            <Notice title={t(connection.labelKey)} tone="danger">
              {t('runtime.entry.seatBlocked')}
            </Notice>
          ) : null}
        </div>

        <Panel
          description={t('runtime.entry.description')}
          eyebrow={t('runtime.entry.eyebrow')}
          title={t('runtime.entry.title')}
          tone={hud.mode === 'dm' ? 'dm' : 'player'}
        >
          <div className="grid gap-4">
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

            <ol className="grid gap-2 text-sm leading-6 text-slate-300">
              <li>{t('runtime.entry.stepGm')}</li>
              <li>{t('runtime.entry.stepPlayer')}</li>
              <li>{t('runtime.entry.stepRecover')}</li>
            </ol>

            {/*
              The scenario shortcut belongs here rather than in the GM tools,
              because it is the one setup action that has to work *before* a
              table exists - it creates the session it then fills.
            */}
            {hud.mode === 'dm' ? (
              <div
                className="grid gap-2 rounded-2xl border border-amber-300/20 bg-black/25 p-3"
                data-runtime-demo-scenario
              >
                <p className="text-sm font-bold text-amber-50" dir="auto">
                  {getDemoScenarioById(hud.selectedDemoScenarioId).name}
                </p>
                <p className="text-xs leading-5 text-amber-100/65">
                  {t('runtime.entry.scenarioDetail')}
                </p>
                <ActionButton
                  disabled={Boolean(hud.scene.busyReason)}
                  disabledReason={hud.scene.busyReason ?? undefined}
                  label={t('runtime.demoSetup.runTrainingRoom')}
                  onClick={hud.actions.runFreshDemoSetup}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <StatusBadge
                label={t(connection.labelKey)}
                tone={connection.tone}
              />
              <StatusBadge
                label={
                  hud.mode === 'dm'
                    ? t('runtime.mode.dm')
                    : t('runtime.mode.player')
                }
                tone={hud.mode === 'dm' ? 'warning' : 'success'}
              />
            </div>
          </div>
        </Panel>
      </div>
    </main>
  );
}
