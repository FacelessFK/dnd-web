'use client';

/**
 * The GM side of M1: ask for a roll, decide a note, apply a condition, and
 * conceal or reveal a creature.
 *
 * Every control submits a command and then renders whatever the server sends
 * back. Nothing here is optimistic, and nothing decides authority - the panel
 * hides a withdraw button on an answered request because offering it would be a
 * lie, not because hiding it is the check. The server refuses it either way.
 */
import { useState } from 'react';

import type {
  AbilityKey,
  PlayerIntentStatus,
  ResolutionRequest,
  RollStance,
} from '@dnd/protocol';
import { skillIds } from '@dnd/protocol';

import { useI18n, type MessageKey } from '../../lib/i18n';
import {
  describePlayerIntent,
  describeResolutionRequest,
} from '../../lib/m1-resolution-view';
import type { M1TableState } from '../../lib/m1-table-state';
import { findResolutionForRequest } from '../../lib/m1-table-state';
import { M1DiceResult } from './m1-dice-result';
import { isSceneEntityHidden } from '../../lib/runtime-scene-view';
import type { RuntimeSceneEntity } from '../../lib/runtime-scene-view';

const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STANCES: RollStance[] = ['normal', 'advantage', 'disadvantage'];

export type M1ResolutionTarget = {
  participantId: string;
  displayName: string;
  activeConditions: readonly string[];
  characterId: string;
};

type M1GmPanelProps = {
  busyLabel: string | null;
  combatants: RuntimeSceneEntity[];
  errorKey: string | null;
  onCancelRequest: (request: ResolutionRequest) => void;
  onRequestResolution: (input: {
    ability: AbilityKey;
    dc: number;
    kind: 'ability_check' | 'saving_throw';
    reason: string;
    skill: string;
    stance: RollStance;
    targetParticipantId: string;
  }) => void;
  onSetCombatantHidden: (combatantId: string, hidden: boolean) => void;
  onSetPoisoned: (target: M1ResolutionTarget, poisoned: boolean) => void;
  onUpdateIntentStatus: (
    intentId: string,
    status: Exclude<PlayerIntentStatus, 'pending'>,
  ) => void;
  participantId: string;
  table: M1TableState;
  targets: M1ResolutionTarget[];
};

export function M1GmPanel({
  busyLabel,
  combatants,
  errorKey,
  onCancelRequest,
  onRequestResolution,
  onSetCombatantHidden,
  onSetPoisoned,
  onUpdateIntentStatus,
  participantId,
  table,
  targets,
}: M1GmPanelProps) {
  const { t } = useI18n();
  const [targetParticipantId, setTargetParticipantId] = useState('');
  const [kind, setKind] = useState<'ability_check' | 'saving_throw'>(
    'ability_check',
  );
  const [ability, setAbility] = useState<AbilityKey>('dex');
  const [skill, setSkill] = useState('');
  const [dc, setDc] = useState('12');
  const [stance, setStance] = useState<RollStance>('normal');
  const [reason, setReason] = useState('');

  const selectedTarget =
    targets.find(
      (candidate) => candidate.participantId === targetParticipantId,
    ) ?? targets[0];
  const requests = table.requests.map((request) => ({
    request,
    resolution: findResolutionForRequest(table, request.id),
    view: describeResolutionRequest({
      request,
      viewerParticipantId: participantId,
      viewerRole: 'dm',
    }),
  }));
  const intents = table.intents.map((intent) =>
    describePlayerIntent({
      intent,
      viewerParticipantId: participantId,
      viewerRole: 'dm',
    }),
  );
  const parsedDc = Number.parseInt(dc, 10);
  const dcIsValid =
    Number.isInteger(parsedDc) && parsedDc >= 1 && parsedDc <= 50;

  return (
    <section
      aria-labelledby="m1-gm-heading"
      className="grid gap-4 rounded-3xl border border-amber-500/25 bg-[#24160f]/90 p-4"
      data-testid="m1-gm-panel"
    >
      <h3 id="m1-gm-heading" className="text-lg font-black text-amber-50">
        {t('runtime.m1.gm.title')}
      </h3>

      {errorKey ? (
        <p role="alert" className="text-amber-200">
          {t(errorKey as MessageKey)}
        </p>
      ) : null}

      {targets.length === 0 ? (
        <p className="text-amber-200/70">{t('runtime.m1.gm.noTargets')}</p>
      ) : (
        <form
          className="grid gap-2 sm:grid-cols-2"
          data-testid="m1-gm-request-form"
          onSubmit={(event) => {
            event.preventDefault();

            if (!selectedTarget || !dcIsValid || busyLabel) {
              return;
            }

            onRequestResolution({
              ability,
              dc: parsedDc,
              kind,
              reason: reason.trim(),
              // A saving throw has no skill. Sending one would be a request the
              // server would have to reason about and the rules would ignore.
              skill: kind === 'ability_check' ? skill : '',
              stance,
              targetParticipantId: selectedTarget.participantId,
            });
            setReason('');
          }}
        >
          <label className="grid gap-1" htmlFor="m1-gm-target">
            <span className="font-bold text-amber-100">
              {t('runtime.m1.gm.target')}
            </span>
            <select
              id="m1-gm-target"
              className="rounded-xl border border-amber-500/30 bg-black/30 px-2 py-1 text-amber-50"
              onChange={(event) => setTargetParticipantId(event.target.value)}
              value={selectedTarget?.participantId ?? ''}
            >
              {targets.map((target) => (
                <option key={target.participantId} value={target.participantId}>
                  {target.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1" htmlFor="m1-gm-kind">
            <span className="font-bold text-amber-100">
              {t('runtime.m1.gm.kind')}
            </span>
            <select
              id="m1-gm-kind"
              className="rounded-xl border border-amber-500/30 bg-black/30 px-2 py-1 text-amber-50"
              onChange={(event) =>
                setKind(event.target.value as 'ability_check' | 'saving_throw')
              }
              value={kind}
            >
              <option value="ability_check">
                {t('runtime.m1.kind.ability_check')}
              </option>
              <option value="saving_throw">
                {t('runtime.m1.kind.saving_throw')}
              </option>
            </select>
          </label>

          <label className="grid gap-1" htmlFor="m1-gm-ability">
            <span className="font-bold text-amber-100">
              {t('runtime.m1.gm.ability')}
            </span>
            <select
              id="m1-gm-ability"
              className="rounded-xl border border-amber-500/30 bg-black/30 px-2 py-1 text-amber-50"
              onChange={(event) => setAbility(event.target.value as AbilityKey)}
              value={ability}
            >
              {ABILITIES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {t(`runtime.m1.ability.${candidate}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>

          {kind === 'ability_check' ? (
            <label className="grid gap-1" htmlFor="m1-gm-skill">
              <span className="font-bold text-amber-100">
                {t('runtime.m1.gm.skill')}
              </span>
              {/* The value is the canonical ID; only the label is localized. */}
              <select
                id="m1-gm-skill"
                className="rounded-xl border border-amber-500/30 bg-black/30 px-2 py-1 text-amber-50"
                onChange={(event) => setSkill(event.target.value)}
                value={skill}
              >
                <option value="">{t('runtime.m1.gm.skillNone')}</option>
                {skillIds.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {t(`runtime.m1.skill.${candidate}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="grid gap-1" htmlFor="m1-gm-dc">
            <span className="font-bold text-amber-100">
              {t('runtime.m1.gm.dc')}
            </span>
            <input
              id="m1-gm-dc"
              className="rounded-xl border border-amber-500/30 bg-black/30 px-2 py-1 text-amber-50"
              dir="ltr"
              max={50}
              min={1}
              onChange={(event) => setDc(event.target.value)}
              type="number"
              value={dc}
            />
          </label>

          <label className="grid gap-1" htmlFor="m1-gm-stance">
            <span className="font-bold text-amber-100">
              {t('runtime.m1.gm.stance')}
            </span>
            <select
              id="m1-gm-stance"
              className="rounded-xl border border-amber-500/30 bg-black/30 px-2 py-1 text-amber-50"
              onChange={(event) => setStance(event.target.value as RollStance)}
              value={stance}
            >
              {STANCES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {t(`runtime.m1.stance.${candidate}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 sm:col-span-2" htmlFor="m1-gm-reason">
            <span className="font-bold text-amber-100">
              {t('runtime.m1.gm.reason')}
            </span>
            <input
              id="m1-gm-reason"
              className="rounded-xl border border-amber-500/30 bg-black/30 px-2 py-1 text-amber-50"
              maxLength={240}
              onChange={(event) => setReason(event.target.value)}
              type="text"
              value={reason}
            />
          </label>

          <button
            type="submit"
            className="justify-self-start rounded-xl bg-amber-400 px-3 py-1 font-black text-black disabled:opacity-50 sm:col-span-2"
            disabled={!dcIsValid || busyLabel !== null}
          >
            {busyLabel === 'request_resolution'
              ? t('runtime.m1.gm.submitting')
              : t('runtime.m1.gm.submit')}
          </button>
        </form>
      )}

      <div data-testid="m1-gm-requests">
        <h4 className="font-bold text-amber-100">
          {t('runtime.m1.gm.requests')}
        </h4>
        {requests.length === 0 ? (
          <p className="text-amber-200/70">{t('runtime.m1.gm.noRequests')}</p>
        ) : (
          <ul className="grid list-none gap-2">
            {requests.map(({ request, resolution, view }) => (
              <li
                key={request.id}
                className="rounded-2xl border border-amber-500/20 bg-black/20 p-2"
                data-request-status={request.status}
              >
                <p className="text-amber-50">
                  {t(view.kindKey)} — {t(view.abilityKey)}
                  {view.skillKey ? ` · ${t(view.skillKey)}` : ''}{' '}
                  <span className="text-amber-200/70">
                    ({t(view.statusKey)})
                  </span>
                </p>
                {view.canCancel ? (
                  <button
                    type="button"
                    className="mt-1 rounded-lg border border-amber-400/50 px-2 py-0.5 text-amber-100 disabled:opacity-50"
                    disabled={busyLabel !== null}
                    onClick={() => onCancelRequest(request)}
                  >
                    {t('runtime.m1.gm.cancel')}
                  </button>
                ) : null}
                {resolution ? <M1DiceResult resolution={resolution} /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedTarget ? (
        <div data-testid="m1-gm-conditions">
          <h4 className="font-bold text-amber-100">
            {t('runtime.m1.gm.conditions')}
          </h4>
          <p className="text-amber-200/80">
            {selectedTarget.activeConditions.length
              ? selectedTarget.activeConditions.join(', ')
              : t('runtime.m1.gm.conditionNone')}
          </p>
          <button
            type="button"
            className="mt-1 rounded-lg border border-amber-400/50 px-2 py-0.5 text-amber-100 disabled:opacity-50"
            disabled={busyLabel !== null}
            onClick={() =>
              onSetPoisoned(
                selectedTarget,
                !selectedTarget.activeConditions.includes('poisoned'),
              )
            }
          >
            {selectedTarget.activeConditions.includes('poisoned')
              ? t('runtime.m1.gm.removePoisoned')
              : t('runtime.m1.gm.applyPoisoned')}
          </button>
        </div>
      ) : null}

      <div data-testid="m1-gm-visibility">
        <h4 className="font-bold text-amber-100">
          {t('runtime.m1.gm.visibility')}
        </h4>
        {combatants.length === 0 ? (
          <p className="text-amber-200/70">{t('runtime.m1.gm.noCombatants')}</p>
        ) : (
          <ul className="grid list-none gap-1">
            {combatants.map((entity) => (
              <li
                key={entity.id}
                className="flex items-center gap-2"
                data-combatant-hidden={
                  isSceneEntityHidden(entity) ? 'true' : 'false'
                }
              >
                <span className="text-amber-50">{entity.name}</span>
                <span className="text-amber-200/70">
                  {isSceneEntityHidden(entity)
                    ? t('runtime.m1.gm.concealed')
                    : t('runtime.m1.gm.visible')}
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-amber-400/50 px-2 py-0.5 text-amber-100 disabled:opacity-50"
                  disabled={busyLabel !== null}
                  onClick={() =>
                    onSetCombatantHidden(
                      entity.id,
                      !isSceneEntityHidden(entity),
                    )
                  }
                >
                  {isSceneEntityHidden(entity)
                    ? t('runtime.m1.gm.reveal')
                    : t('runtime.m1.gm.conceal')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-testid="m1-gm-intents">
        <h4 className="font-bold text-amber-100">
          {t('runtime.m1.gm.intents')}
        </h4>
        {intents.length === 0 ? (
          <p className="text-amber-200/70">{t('runtime.m1.gm.noIntents')}</p>
        ) : (
          <ul className="grid list-none gap-2">
            {intents.map((intent) => (
              <li
                key={intent.id}
                className="rounded-2xl border border-amber-500/20 bg-black/20 p-2"
                // Mirrors the Player row's attribute so a harness can compare
                // the two subscribers' convergence without reading translated
                // text, which differs per locale and would make the assertion a
                // statement about the phrase book rather than about state.
                data-intent-status={intent.statusKey}
                data-intent-terminal={intent.isTerminal ? 'true' : 'false'}
              >
                <p className="text-amber-50">{intent.text}</p>
                <p className="text-amber-200/70">{t(intent.statusKey)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {intent.availableTransitions.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className="rounded-lg border border-amber-400/50 px-2 py-0.5 text-amber-100 disabled:opacity-50"
                      disabled={busyLabel !== null}
                      onClick={() => onUpdateIntentStatus(intent.id, status)}
                    >
                      {t(
                        status === 'acknowledged'
                          ? 'runtime.m1.gm.acknowledge'
                          : status === 'resolved'
                            ? 'runtime.m1.gm.resolve'
                            : 'runtime.m1.gm.dismiss',
                      )}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
