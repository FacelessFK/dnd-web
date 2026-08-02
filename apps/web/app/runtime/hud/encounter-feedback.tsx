'use client';

/**
 * What just happened, and what it means for the next click.
 *
 * Movement, encounter status and target feedback all read from summaries the
 * pure helpers derived. None of them decides availability - a blocked reason
 * arrives already computed, and the server still refuses the command whatever
 * these render.
 */
import type {
  ActionTargetFeedbackSummary,
  EncounterStatusSummary,
  MovementFeedbackSummary,
  RuntimeNoticeTone,
} from '../../../lib/runtime-cockpit-helpers';
import {
  localizeActorLabel,
  localizeRuntimeCharacterStatus,
  type RuntimeTranslator,
} from '../../../lib/runtime-localization';
import { StatusBadge } from './hud-primitives';

export function MovementFeedback({
  summary,
  t,
}: {
  summary: MovementFeedbackSummary;
  t: RuntimeTranslator;
}) {
  const currentPositionLabel = summary.currentPosition
    ? `${summary.currentPosition.x},${summary.currentPosition.y}`
    : t('runtime.movementFeedback.noPosition');
  const distanceLabel =
    summary.distanceFeet === null
      ? t('runtime.movementFeedback.distanceUnknown')
      : t('runtime.movementFeedback.distance', {
          distance: String(summary.distanceFeet),
        });
  const budgetLabel =
    summary.movementUsedFeet === null ||
    summary.movementSpeedFeet === null ||
    summary.movementRemainingFeet === null
      ? t('runtime.movementFeedback.explorationBudget')
      : t('runtime.movementFeedback.budget', {
          remaining: String(summary.movementRemainingFeet),
          speed: String(summary.movementSpeedFeet),
          used: String(summary.movementUsedFeet),
        });
  const afterMoveLabel =
    summary.movementAfterMoveFeet === null ||
    summary.movementRemainingAfterMoveFeet === null
      ? t('runtime.movementFeedback.afterUnknown')
      : t('runtime.movementFeedback.after', {
          after: String(summary.movementAfterMoveFeet),
          remaining: String(summary.movementRemainingAfterMoveFeet),
        });

  return (
    <div className="mb-4 grid gap-2 rounded-2xl border border-emerald-300/15 bg-emerald-950/15 p-3 text-xs text-emerald-50 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1.2fr)] lg:items-center">
      <div className="min-w-0">
        <p className="font-black uppercase text-emerald-200/80">
          {t('runtime.movementFeedback.title')}
        </p>
        <p className="mt-1 truncate text-sm font-black text-white">
          {localizeActorLabel(summary.actorLabel, t)}
        </p>
        {summary.moveBlockedReason ? (
          <p className="mt-1 text-amber-100/80">{summary.moveBlockedReason}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge
          label={
            summary.moveReady
              ? t('runtime.movementFeedback.ready')
              : t('runtime.movementFeedback.blocked')
          }
          tone={summary.moveReady ? 'success' : 'warning'}
        />
        <StatusBadge
          label={t('runtime.movementFeedback.current', {
            cell: currentPositionLabel,
          })}
          tone="info"
        />
        <StatusBadge
          label={t('runtime.movementFeedback.destination', {
            cell: `${summary.destination.x},${summary.destination.y}`,
          })}
          tone="info"
        />
        <StatusBadge label={distanceLabel} tone="info" />
        <StatusBadge label={budgetLabel} tone="warning" />
        <StatusBadge label={afterMoveLabel} tone="info" />
      </div>
    </div>
  );
}

export function EncounterStatusFeedback({
  showEncounterId = false,
  summary,
  t,
}: {
  /**
   * GM surfaces only. The encounter ID is a record handle the GM's tools are
   * built out of; on a player's screen it is an identifier they could not have
   * invented, which is exactly what the role projection exists to withhold.
   */
  showEncounterId?: boolean;
  summary: EncounterStatusSummary;
  t: RuntimeTranslator;
}) {
  const statusLabel = getEncounterStatusLabel(summary.status, t);
  const progressLabel =
    summary.roundNumber === null || summary.turnNumber === null
      ? t('runtime.encounterStatus.noProgress')
      : t('runtime.encounterStatus.progress', {
          round: String(summary.roundNumber),
          turn: String(summary.turnNumber),
          turnCount: String(summary.turnCount),
        });
  const latestEncounterLabel = summary.latestEncounterUpdate
    ? t('runtime.encounterStatus.latestEncounter', {
        reason: summary.latestEncounterUpdate.reason,
        round: String(summary.latestEncounterUpdate.roundNumber),
        turn: String(summary.latestEncounterUpdate.turnNumber),
      })
    : t('runtime.encounterStatus.noEncounterUpdate');
  const latestCombatLabel = summary.latestCombatResult
    ? t('runtime.encounterStatus.latestCombat', {
        attacker: summary.latestCombatResult.attackerLabel,
        damage: String(summary.latestCombatResult.damage),
        result: summary.latestCombatResult.hit
          ? t('runtime.encounterStatus.hit')
          : t('runtime.encounterStatus.miss'),
        target: summary.latestCombatResult.targetLabel,
      })
    : t('runtime.encounterStatus.noCombatResult');

  return (
    <div className="grid gap-2 rounded-2xl border border-sky-300/15 bg-sky-950/10 p-3 text-xs text-sky-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-black uppercase tracking-[0.14em] text-sky-200/80">
            {t('runtime.encounterStatus.title')}
          </p>
          <p className="mt-1 truncate text-sm font-black text-white">
            {summary.currentActorLabel ??
              t('runtime.encounterStatus.noCurrentActor')}
          </p>
        </div>
        <StatusBadge
          label={statusLabel}
          tone={getEncounterStatusTone(summary.status)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge label={progressLabel} tone="info" />
        {showEncounterId && summary.encounterId ? (
          <StatusBadge
            label={t('runtime.encounterStatus.id', {
              id: summary.encounterId,
            })}
            tone="info"
          />
        ) : null}
        {summary.nextActorLabel ? (
          <StatusBadge
            label={t('runtime.encounterStatus.nextActor', {
              actor: summary.nextActorLabel,
            })}
            tone="warning"
          />
        ) : null}
      </div>
      <div className="grid gap-1 text-sky-100/75">
        <p>{latestEncounterLabel}</p>
        <p>{latestCombatLabel}</p>
      </div>
    </div>
  );
}

export function getEncounterStatusLabel(
  status: EncounterStatusSummary['status'],
  t: RuntimeTranslator,
) {
  switch (status) {
    case 'active':
      return t('runtime.encounterStatus.active');
    case 'ended':
      return t('runtime.encounterStatus.ended');
    case 'not_loaded':
      return t('runtime.encounterStatus.notLoaded');
  }
}

export function getEncounterStatusTone(
  status: EncounterStatusSummary['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'ended':
      return 'warning';
    case 'not_loaded':
      return 'info';
  }
}

export function ActionTargetFeedback({
  summary,
  t,
}: {
  summary: ActionTargetFeedbackSummary;
  t: RuntimeTranslator;
}) {
  const target = summary.selectedTarget;
  const targetKindLabel =
    target?.kind === 'combatant'
      ? t('runtime.actionFeedback.targetKind.combatant')
      : t('runtime.actionFeedback.targetKind.character');
  const hpLabel =
    target && target.hpCurrent !== null && target.hpMax !== null
      ? t('runtime.actionFeedback.hp', {
          current: String(target.hpCurrent),
          max: String(target.hpMax),
          temp: String(target.hpTemp ?? 0),
        })
      : t('runtime.actionFeedback.hpUnknown');
  const armorClassLabel =
    target?.armorClass === null || target?.armorClass === undefined
      ? t('runtime.actionFeedback.acUnknown')
      : t('runtime.actionFeedback.ac', {
          armorClass: String(target.armorClass),
        });
  const attackTone = summary.attackReady
    ? 'success'
    : summary.attackBlockedReason
      ? 'warning'
      : 'info';
  const attackLabel = summary.attackReady
    ? t('runtime.actionFeedback.attackReady')
    : summary.attackBlockedReason
      ? t('runtime.actionFeedback.attackBlocked')
      : t('runtime.actionFeedback.noTarget');
  const result = summary.lastCombatResult;

  return (
    <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-200 lg:grid-cols-2">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold uppercase tracking-[0.12em] text-slate-400">
            {t('runtime.actionFeedback.targetTitle')}
          </span>
          <StatusBadge label={attackLabel} tone={attackTone} />
        </div>
        {target ? (
          <>
            <p className="truncate text-sm font-black text-white">
              {target.label}
            </p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={targetKindLabel} tone="info" />
              <StatusBadge label={hpLabel} tone="warning" />
              <StatusBadge label={armorClassLabel} tone="info" />
              <StatusBadge
                label={t('runtime.actionFeedback.status', {
                  status: localizeRuntimeCharacterStatus(target.status, t),
                })}
                tone={target.status === 'defeated' ? 'danger' : 'success'}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            {t('runtime.actionFeedback.noTargetDetail')}
          </p>
        )}
        {summary.attackBlockedReason ? (
          <p className="text-amber-100/75">{summary.attackBlockedReason}</p>
        ) : null}
      </div>
      <div className="grid gap-2 border-t border-white/10 pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
        <span className="font-bold uppercase tracking-[0.12em] text-slate-400">
          {t('runtime.actionFeedback.resultTitle')}
        </span>
        {result ? (
          <>
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                label={
                  result.hit
                    ? t('runtime.actionFeedback.hit')
                    : t('runtime.actionFeedback.miss')
                }
                tone={result.hit ? 'danger' : 'warning'}
              />
              <StatusBadge
                label={t('runtime.actionFeedback.roll', {
                  roll: String(result.rollTotal),
                })}
                tone="info"
              />
              <StatusBadge
                label={t('runtime.actionFeedback.damage', {
                  damage: String(result.damage),
                })}
                tone={result.damage > 0 ? 'danger' : 'info'}
              />
            </div>
            <p className="text-sm text-slate-200">
              {t('runtime.actionFeedback.resultSummary', {
                attacker: result.attackerLabel,
                current: String(result.targetHpCurrent),
                previous: String(result.targetHpPrevious),
                target: result.targetLabel,
              })}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            {t('runtime.actionFeedback.noResult')}
          </p>
        )}
      </div>
    </div>
  );
}
