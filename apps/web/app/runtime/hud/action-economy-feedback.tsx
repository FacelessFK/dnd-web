'use client';

/**
 * The action, bonus action and reaction a turn still has, and whose turn it is.
 */
import type {
  ActionEconomyFeedbackSummary,
  CurrentTurnRailSummary,
  RuntimeEventSummary,
  RuntimeNoticeTone,
} from '../../../lib/runtime-cockpit-helpers';
import {
  localizeActorLabel,
  type RuntimeTranslator,
} from '../../../lib/runtime-localization';
import { EmptyState, Panel, StatusBadge } from './hud-primitives';

/**
 * One already-summarised live event.
 *
 * The feed renders summaries, never payloads: `summary` arrives localized from
 * `describeSessionStreamEvent`, and the raw frame it came from is not carried
 * here at all. That is what keeps this component safe to render for a player.
 */
export type RuntimeFeedEntry = {
  at: string;
  id: string;
  summary: RuntimeEventSummary;
};

export function ActionEconomyFeedback({
  summary,
  t,
}: {
  summary: ActionEconomyFeedbackSummary;
  t: RuntimeTranslator;
}) {
  const statusTone: RuntimeNoticeTone =
    summary.overallStatus === 'ready'
      ? 'success'
      : summary.overallStatus === 'no_encounter'
        ? 'info'
        : 'warning';
  const statusLabel =
    summary.overallStatus === 'ready'
      ? t('runtime.actionEconomy.ready')
      : summary.overallStatus === 'spent'
        ? t('runtime.actionEconomy.spent')
        : summary.overallStatus === 'no_encounter'
          ? t('runtime.actionEconomy.noEncounter')
          : t('runtime.actionEconomy.blocked');
  const latestLabel = summary.latestEncounterUpdate
    ? t('runtime.actionEconomy.latest', {
        reason: summary.latestEncounterUpdate.reason,
        round: String(summary.latestEncounterUpdate.roundNumber),
        turn: String(summary.latestEncounterUpdate.turnNumber),
      })
    : t('runtime.actionEconomy.noLatest');
  const actorLabel =
    summary.overallStatus === 'no_encounter'
      ? t('runtime.actionEconomy.noEncounter')
      : localizeActorLabel(summary.actorLabel, t);

  return (
    <div className="grid gap-2 rounded-xl border border-amber-300/15 bg-amber-950/10 p-3 text-xs text-amber-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-[0.12em] text-amber-200/80">
            {t('runtime.actionEconomy.title')}
          </p>
          <p className="mt-1 truncate text-sm font-black text-white">
            {actorLabel}
          </p>
        </div>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </div>
      <div className="flex flex-wrap gap-2">
        {summary.resources.map((resource) => {
          const stateLabel = resource.used
            ? t('runtime.actionEconomy.used')
            : resource.ready
              ? t('runtime.actionEconomy.available')
              : t('runtime.actionEconomy.blocked');
          const resourceLabel = t('runtime.actionEconomy.resource', {
            name: getActionEconomyResourceName(resource.id, t),
            state: stateLabel,
          });

          return (
            <StatusBadge
              key={resource.id}
              label={resourceLabel}
              tone={
                resource.ready ? 'success' : resource.used ? 'warning' : 'info'
              }
            />
          );
        })}
      </div>
      <p className="text-amber-100/70">{latestLabel}</p>
      {summary.blockedReason ? (
        <p className="text-amber-100/80">{summary.blockedReason}</p>
      ) : null}
    </div>
  );
}

export function getActionEconomyResourceName(
  resourceId: ActionEconomyFeedbackSummary['resources'][number]['id'],
  t: RuntimeTranslator,
) {
  switch (resourceId) {
    case 'action':
      return t('runtime.actionEconomy.action');
    case 'bonusAction':
      return t('runtime.actionEconomy.bonusAction');
    case 'reaction':
      return t('runtime.actionEconomy.reaction');
  }
}

export function getActionEconomyResource(
  summary: ActionEconomyFeedbackSummary,
  resourceId: ActionEconomyFeedbackSummary['resources'][number]['id'],
  unavailableReason: string,
): ActionEconomyFeedbackSummary['resources'][number] {
  const resource = summary.resources.find(
    (candidate) => candidate.id === resourceId,
  );

  if (resource) {
    return resource;
  }

  return {
    blockedReason: unavailableReason,
    commandType:
      resourceId === 'bonusAction'
        ? 'use_bonus_action'
        : resourceId === 'reaction'
          ? 'use_reaction'
          : 'use_action',
    id: resourceId,
    ready: false,
    used: false,
  };
}

export function CurrentTurnRail({
  summary,
  t,
}: {
  summary: CurrentTurnRailSummary | null;
  t: RuntimeTranslator;
}) {
  if (!summary) {
    return null;
  }

  const movementLabel =
    summary.movementSpeedFeet === null || summary.movementRemainingFeet === null
      ? t('runtime.turnRail.movementUnknown', {
          used: String(summary.movementUsedFeet),
        })
      : t('runtime.turnRail.movementRemaining', {
          remaining: String(summary.movementRemainingFeet),
          speed: String(summary.movementSpeedFeet),
          used: String(summary.movementUsedFeet),
        });
  const actorKindLabel =
    summary.actorKind === 'combatant'
      ? t('runtime.turnRail.actorKind.combatant')
      : t('runtime.turnRail.actorKind.character');

  return (
    <div className="mb-4 grid gap-3 rounded-2xl border border-amber-300/20 bg-amber-950/20 p-3 shadow-lg shadow-black/20 lg:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300/80">
          {t('runtime.turnRail.title')}
        </p>
        <p className="mt-1 truncate text-base font-black text-amber-50">
          {summary.actorLabel}
        </p>
        <p className="mt-1 text-xs text-amber-100/60">
          {t('runtime.turnRail.roundInitiative', {
            initiative: String(summary.initiative),
            round: String(summary.roundNumber),
          })}
        </p>
      </div>
      <div className="grid gap-1 rounded-xl border border-sky-200/15 bg-sky-950/20 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-sky-200/80">
          {t('runtime.turnRail.movement')}
        </span>
        <span className="text-sm font-semibold text-sky-50">
          {movementLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge label={actorKindLabel} tone="info" />
        <StatusBadge
          label={t('runtime.turnRail.action', {
            state: summary.actionUsed
              ? t('runtime.turnRail.used')
              : t('runtime.turnRail.available'),
          })}
          tone={summary.actionUsed ? 'warning' : 'success'}
        />
        <StatusBadge
          label={t('runtime.turnRail.bonus', {
            state: summary.bonusActionUsed
              ? t('runtime.turnRail.used')
              : t('runtime.turnRail.available'),
          })}
          tone={summary.bonusActionUsed ? 'warning' : 'success'}
        />
        <StatusBadge
          label={t('runtime.turnRail.reaction', {
            state: summary.reactionUsed
              ? t('runtime.turnRail.used')
              : t('runtime.turnRail.available'),
          })}
          tone={summary.reactionUsed ? 'warning' : 'success'}
        />
      </div>
    </div>
  );
}

export function LatestEventFeed({
  entries,
  t,
}: {
  entries: RuntimeFeedEntry[];
  t: RuntimeTranslator;
}) {
  return (
    <Panel
      description={t('runtime.eventFeed.description')}
      eyebrow={t('runtime.eventFeed.eyebrow')}
      title={t('runtime.eventFeed.title')}
    >
      {/*
        Named so the acceptance can read the feed on its own rather than the
        whole page. A leak here used to be found by a whole-surface text audit,
        which says a rule broke without saying which surface broke it.
      */}
      <div className="grid gap-2" data-hud-region="event-feed">
        {entries.length ? (
          entries.map((entry) => (
            <div
              className="rounded-2xl border border-amber-500/15 bg-black/25 p-3"
              key={entry.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-amber-50">
                    {entry.summary.title}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-amber-100/70">
                    {entry.summary.detail}
                  </p>
                </div>
                <StatusBadge label={entry.at} tone={entry.summary.tone} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            detail={t('runtime.eventFeed.emptyDetail')}
            title={t('runtime.eventFeed.emptyTitle')}
          />
        )}
      </div>
    </Panel>
  );
}
