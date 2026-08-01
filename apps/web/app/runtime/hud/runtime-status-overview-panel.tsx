'use client';

/**
 * One line on what the table is waiting for, and who owns the next move.
 */
import type {
  DmTableSetupChecklist,
  PlayerReadinessSummary,
  RuntimeNoticeTone,
  RuntimeStatusOverview,
} from '../../../lib/runtime-cockpit-helpers';
import {
  localizeActorLabel,
  type RuntimeTranslator,
} from '../../../lib/runtime-localization';
import { Panel, StatusBadge, StatusRow } from './hud-primitives';
import { getDmTableSetupItemDetail } from './table-status-panels';
import { getPlayerReadinessItemDetail } from './player-readiness-panels';

export function RuntimeStatusOverviewPanel({
  overview,
  t,
}: {
  overview: RuntimeStatusOverview;
  t: RuntimeTranslator;
}) {
  const readinessLabel =
    overview.mode === 'dm'
      ? t('runtime.statusOverview.dmReadiness')
      : t('runtime.statusOverview.playerReadiness');
  const overviewActorLabel = localizeActorLabel(overview.turn.actorLabel, t);
  const turnLabel = overviewActorLabel
    ? t('runtime.statusOverview.turnActive', {
        actor: overviewActorLabel,
      })
    : t('runtime.statusOverview.turnInactive');
  const turnProgress =
    overview.turn.roundNumber !== null && overview.turn.turnNumber !== null
      ? t('runtime.encounterStatus.progress', {
          round: String(overview.turn.roundNumber),
          turnCount: String(overview.turn.turnCount),
          turn: String(overview.turn.turnNumber),
        })
      : t('runtime.encounterStatus.noProgress');

  return (
    <Panel
      description={t('runtime.statusOverview.description')}
      eyebrow={t('runtime.statusOverview.eyebrow')}
      title={t('runtime.statusOverview.title')}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={t('runtime.statusOverview.readinessProgress', {
              completed: String(overview.readiness.completedCount),
              total: String(overview.readiness.totalCount),
            })}
            tone={
              overview.readiness.completedCount ===
              overview.readiness.totalCount
                ? 'success'
                : overview.readiness.readyCount > 0
                  ? 'warning'
                  : 'info'
            }
          />
          {overview.readiness.waitingCount !== null ? (
            <StatusBadge
              label={t('runtime.statusOverview.waitingProgress', {
                count: String(overview.readiness.waitingCount),
              })}
              tone={overview.readiness.waitingCount > 0 ? 'info' : 'success'}
            />
          ) : null}
          <StatusBadge
            label={getRuntimeStatusOverviewOwnerLabel(
              overview.nextAction.owner,
              t,
            )}
            tone={getRuntimeStatusOverviewOwnerTone(overview.nextAction.owner)}
          />
        </div>

        <dl className="grid gap-2 text-sm">
          <StatusRow
            label={t('runtime.statusOverview.readiness')}
            value={`${readinessLabel} · ${overview.readiness.completedCount}/${overview.readiness.totalCount}`}
          />
          <StatusRow
            label={t('runtime.statusOverview.turn')}
            value={`${turnLabel} · ${turnProgress}`}
          />
          <StatusRow
            label={t('runtime.statusOverview.recovery')}
            value={t('runtime.statusOverview.recoveryModels', {
              loaded: String(overview.recovery.loadedCount),
              total: String(overview.recovery.totalCount),
            })}
          />
        </dl>

        <div className="rounded-xl border border-amber-300/15 bg-black/20 p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-200/80">
            {t('runtime.statusOverview.nextAction')}
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-50">
            {getRuntimeStatusOverviewNextActionDetail(overview, t)}
          </p>
          <StatusRow
            label={t('runtime.statusOverview.nextAction.ownerDetail')}
            value={getRuntimeStatusOverviewOwnerLabel(
              overview.nextAction.owner,
              t,
            )}
          />
          <p className="mt-2 text-xs leading-5 text-amber-100/60">
            {getRuntimeStatusOverviewOwnerDetail(overview.nextAction.owner, t)}
          </p>
        </div>
      </div>
    </Panel>
  );
}

export function getRuntimeStatusOverviewOwnerLabel(
  owner: RuntimeStatusOverview['nextAction']['owner'],
  t: RuntimeTranslator,
): string {
  switch (owner) {
    case 'dm':
      return t('runtime.statusOverview.waiting.dm');
    case 'player':
      return t('runtime.statusOverview.waiting.player');
    case 'table':
      return t('runtime.statusOverview.waiting.table');
  }
}

export function getRuntimeStatusOverviewOwnerTone(
  owner: RuntimeStatusOverview['nextAction']['owner'],
): RuntimeNoticeTone {
  switch (owner) {
    case 'dm':
    case 'player':
      return 'warning';
    case 'table':
      return 'info';
  }
}

export function getRuntimeStatusOverviewOwnerDetail(
  owner: RuntimeStatusOverview['nextAction']['owner'],
  t: RuntimeTranslator,
): string {
  switch (owner) {
    case 'dm':
      return t('runtime.statusOverview.nextAction.dmDetail');
    case 'player':
      return t('runtime.statusOverview.nextAction.playerDetail');
    case 'table':
      return t('runtime.statusOverview.nextAction.tableDetail');
  }
}

export function getRuntimeStatusOverviewNextActionDetail(
  overview: RuntimeStatusOverview,
  t: RuntimeTranslator,
): string {
  const { sourceItemId, sourceStatus } = overview.nextAction;

  if (!sourceItemId || !sourceStatus) {
    return overview.mode === 'dm'
      ? t('runtime.tableSetup.readyForPlay')
      : t('runtime.playerReadiness.detail.ready');
  }

  if (overview.mode === 'dm') {
    return getDmTableSetupItemDetail(
      {
        detail: '',
        id: sourceItemId as DmTableSetupChecklist['items'][number]['id'],
        status:
          sourceStatus as DmTableSetupChecklist['items'][number]['status'],
        title: '',
      },
      t,
    );
  }

  return getPlayerReadinessItemDetail(
    {
      detail: '',
      id: sourceItemId as PlayerReadinessSummary['items'][number]['id'],
      status: sourceStatus as PlayerReadinessSummary['items'][number]['status'],
      title: '',
    },
    {
      completedCount: 0,
      items: [],
      nextAction: '',
      readyCount: 0,
      status: 'waiting',
      title: '',
      totalCount: 0,
      turn: {
        attackReady: false,
        currentActorLabel:
          localizeActorLabel(overview.turn.actorLabel, t) ?? t('common.none'),
        isCurrentTurn: false,
        moveReady: false,
        readyActionCount: 0,
      },
      waitingCount: 0,
    },
    t,
  );
}
