'use client';

/**
 * What the player can do about M1: answer the rolls addressed to them, tell the
 * GM what they want to try, and see what their condition is doing to them.
 *
 * The player never computes anything. "Roll it" submits a command and the
 * server decides the dice; the result that comes back is rendered by
 * `M1DiceResult` from the audit record. There is no field here that could carry
 * a client-chosen total, because there is no such field in the command.
 */
import { useState } from 'react';

import type { DiceResolution, ResolutionRequest } from '@dnd/protocol';

import { useI18n, type MessageKey } from '../../lib/i18n';
import {
  describeMechanicalCondition,
  describePlayerIntent,
  describeResolutionRequest,
} from '../../lib/m1-resolution-view';
import type { M1TableState } from '../../lib/m1-table-state';
import { findResolutionForRequest } from '../../lib/m1-table-state';
import { M1DiceResult } from './m1-dice-result';

type M1PlayerPanelProps = {
  activeConditions: readonly string[];
  busyRequestId: string | null;
  errorKey: string | null;
  intentBusy: boolean;
  onSubmitIntent: (text: string) => void;
  onSubmitResolution: (request: ResolutionRequest) => void;
  participantId: string;
  table: M1TableState;
};

export function M1PlayerPanel({
  activeConditions,
  busyRequestId,
  errorKey,
  intentBusy,
  onSubmitIntent,
  onSubmitResolution,
  participantId,
  table,
}: M1PlayerPanelProps) {
  const { t } = useI18n();
  const [intentText, setIntentText] = useState('');

  const requests = table.requests
    .filter((request) => request.targetParticipantId === participantId)
    .map((request) => ({
      request,
      resolution: findResolutionForRequest(table, request.id),
      view: describeResolutionRequest({
        request,
        viewerParticipantId: participantId,
        viewerRole: 'player',
      }),
    }));
  const pending = requests.filter((entry) => entry.view.canSubmit);
  const answered = requests.filter((entry) => entry.resolution !== null);
  const intents = table.intents
    .filter((intent) => intent.authorParticipantId === participantId)
    .map((intent) =>
      describePlayerIntent({
        intent,
        viewerParticipantId: participantId,
        viewerRole: 'player',
      }),
    );
  const conditionEffects = activeConditions
    .map((condition) => ({
      condition,
      described: describeMechanicalCondition(condition),
    }))
    .filter((entry) => entry.described !== null);

  return (
    <section
      aria-labelledby="m1-player-heading"
      className="grid gap-4 rounded-3xl border border-amber-500/25 bg-[#24160f]/90 p-4"
      data-testid="m1-player-panel"
    >
      <h3 id="m1-player-heading" className="text-lg font-black text-amber-50">
        {t('runtime.m1.player.title')}
      </h3>

      {errorKey ? (
        <p role="alert" className="text-amber-200">
          {t(errorKey as MessageKey)}
        </p>
      ) : null}

      {/* Conditions come from authoritative overlay state, so a duplicate
          apply renders once and a refresh renders the same thing. */}
      {conditionEffects.length ? (
        <div data-testid="m1-player-conditions">
          <h4 className="font-bold text-amber-100">
            {t('runtime.m1.player.conditions')}
          </h4>
          <ul className="list-none">
            {conditionEffects.map((entry) => (
              <li key={entry.condition} data-condition={entry.condition}>
                <strong className="text-amber-50">
                  {t(`runtime.m1.condition.${entry.condition}` as MessageKey)}
                </strong>{' '}
                <span className="text-amber-200/80">
                  {t(entry.described!.key)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div data-testid="m1-player-pending">
        <h4 className="font-bold text-amber-100">
          {t('runtime.m1.player.pending')}
        </h4>
        {pending.length === 0 ? (
          <p className="text-amber-200/70">
            {t('runtime.m1.player.noPending')}
          </p>
        ) : (
          <ul className="grid list-none gap-3">
            {pending.map(({ request, view }) => (
              <li
                key={request.id}
                className="rounded-2xl border border-amber-500/25 bg-black/25 p-3"
              >
                <p className="font-bold text-amber-50">
                  {t(view.kindKey)} — {t(view.abilityKey)}
                  {view.skillKey ? ` · ${t(view.skillKey)}` : ''}
                </p>
                <p className="text-amber-200/80" dir="ltr">
                  {t('runtime.m1.gm.dc')} {view.dc} · {t(view.stanceKey)}
                </p>
                {/* GM prose, shown as text and never translated. */}
                {view.reason ? (
                  <p className="text-amber-100">{view.reason}</p>
                ) : null}
                <button
                  type="button"
                  className="mt-2 rounded-xl bg-amber-400 px-3 py-1 font-black text-black disabled:opacity-50"
                  disabled={busyRequestId !== null}
                  onClick={() => onSubmitResolution(request)}
                >
                  {busyRequestId === request.id
                    ? t('runtime.m1.player.rolling')
                    : t('runtime.m1.player.roll')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-testid="m1-player-results">
        <h4 className="font-bold text-amber-100">
          {t('runtime.m1.player.recent')}
        </h4>
        {answered.length === 0 ? (
          <p className="text-amber-200/70">{t('runtime.m1.player.noRecent')}</p>
        ) : (
          <ul className="grid list-none gap-2">
            {answered.map(({ request, resolution }) => (
              <li key={request.id}>
                <M1DiceResult resolution={resolution as DiceResolution} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="grid gap-2"
        data-testid="m1-player-intent-form"
        onSubmit={(event) => {
          event.preventDefault();

          const text = intentText.trim();

          if (!text || intentBusy) {
            return;
          }

          onSubmitIntent(text);
          setIntentText('');
        }}
      >
        <label
          className="font-bold text-amber-100"
          htmlFor="m1-player-intent-text"
        >
          {t('runtime.m1.player.intentTitle')}
        </label>
        <input
          id="m1-player-intent-text"
          className="rounded-xl border border-amber-500/30 bg-black/30 px-3 py-2 text-amber-50"
          maxLength={280}
          onChange={(event) => setIntentText(event.target.value)}
          placeholder={t('runtime.m1.player.intentPlaceholder')}
          type="text"
          value={intentText}
        />
        <button
          type="submit"
          className="justify-self-start rounded-xl bg-amber-400 px-3 py-1 font-black text-black disabled:opacity-50"
          disabled={intentBusy || intentText.trim().length === 0}
        >
          {intentBusy
            ? t('runtime.m1.player.intentSending')
            : t('runtime.m1.player.intentSubmit')}
        </button>
      </form>

      <div data-testid="m1-player-intents">
        <h4 className="font-bold text-amber-100">
          {t('runtime.m1.player.intents')}
        </h4>
        {intents.length === 0 ? (
          <p className="text-amber-200/70">
            {t('runtime.m1.player.noIntents')}
          </p>
        ) : (
          <ul className="grid list-none gap-1">
            {intents.map((intent) => (
              <li key={intent.id} data-intent-status={intent.statusKey}>
                {/* Author prose. React escapes it; it is never markup. */}
                <span className="text-amber-50">{intent.text}</span>{' '}
                <span className="text-amber-200/70">
                  — {t(intent.statusKey)}
                </span>
                {intent.gmNote ? (
                  <span className="block text-amber-200/80">
                    {intent.gmNote}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
