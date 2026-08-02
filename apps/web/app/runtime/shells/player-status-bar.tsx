'use client';

/**
 * Who the player is at this table, and whether the table can hear them.
 *
 * Deliberately short. This is the strip a player glances at, not a panel they
 * read: identity, connection, and the round they are in. Everything with a
 * number behind it that is not one of those three belongs further down.
 *
 * Nothing here renders an identifier. The portrait falls back to the initial of
 * a display name the player chose - never to a participant ID, which is the
 * fallback a "just show something unique" instinct reaches for and the one that
 * puts a correlation handle on screen.
 */
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import type { RuntimeNoticeTone } from '../../../lib/runtime-cockpit-helpers';
import { StatusBadge } from '../hud/hud-primitives';

export type PlayerStatusBarProps = {
  characterName: string | null;
  conditions: string[];
  connectionLabel: string;
  connectionTone: RuntimeNoticeTone;
  displayName: string;
  hp: { current: number; max: number; temp: number } | null;
  roundNumber: number | null;
  sessionCode: string;
  t: RuntimeTranslator;
  turnNumber: number | null;
};

export function PlayerStatusBar({
  characterName,
  conditions,
  connectionLabel,
  connectionTone,
  displayName,
  hp,
  roundNumber,
  sessionCode,
  t,
  turnNumber,
}: PlayerStatusBarProps) {
  const initial = (characterName ?? displayName).trim().slice(0, 1) || '?';
  const healthShare = hp && hp.max > 0 ? hp.current / hp.max : 0;

  return (
    <section
      aria-label={t('runtime.playerStatus.title')}
      className="grid gap-3 rounded-3xl border border-amber-500/20 bg-gradient-to-r from-[#1b120c]/95 to-slate-950/85 p-3 shadow-xl shadow-black/30 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
      data-hud-region="player-status"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-300/35 bg-amber-950/60 text-xl font-black text-amber-100"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p
            className="truncate text-base font-black text-amber-50"
            dir="auto"
            data-testid="player-identity"
          >
            {characterName ?? displayName}
          </p>
          <p className="truncate text-xs text-amber-100/60" dir="auto">
            {sessionCode
              ? t('runtime.playerStatus.atTable', { code: sessionCode })
              : t('runtime.playerStatus.noTable')}
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        {hp ? (
          <div>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-bold uppercase tracking-[0.14em] text-amber-200/75">
                {t('runtime.characterSummary.hitPoints')}
              </span>
              <span className="font-black text-amber-50">
                {hp.current}/{hp.max}
                {hp.temp > 0
                  ? ` (+${hp.temp} ${t('runtime.playerStatus.tempHp')})`
                  : ''}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="mt-1 h-2 overflow-hidden rounded-full bg-black/60"
            >
              <div
                className={`h-full rounded-full ${
                  healthShare > 0.5
                    ? 'bg-emerald-400'
                    : healthShare > 0.25
                      ? 'bg-amber-400'
                      : 'bg-red-500'
                }`}
                style={{
                  width: `${Math.max(0, Math.min(1, healthShare)) * 100}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        <p className="text-xs text-amber-100/70" dir="auto">
          <span className="font-bold uppercase tracking-[0.12em] text-amber-200/70">
            {t('runtime.characterSummary.conditions')}
          </span>{' '}
          {conditions.length ? conditions.join(', ') : t('common.none')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={connectionLabel} tone={connectionTone} />
        <StatusBadge
          label={
            roundNumber === null
              ? t('runtime.playerStatus.noEncounter')
              : t('runtime.playerStatus.round', {
                  round: String(roundNumber),
                  turn: String(turnNumber ?? 0),
                })
          }
          tone={roundNumber === null ? 'info' : 'warning'}
        />
      </div>
    </section>
  );
}
