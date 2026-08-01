'use client';

/**
 * Who at the table is ready, from both sides of the screen.
 *
 * The roster is the GM's view of every seat; the readiness panel is one
 * player's view of their own. They share the vocabulary of "setup, connection,
 * assignment, placement, encounter" so a GM and a player describing the same
 * blocker use the same words.
 */
import type {
  PlayerReadinessSummary,
  RuntimeNoticeTone,
  RuntimeReadinessRoster,
} from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import { EmptyState, Panel, StatusBadge, StatusRow } from './hud-primitives';

export function PlayerReadinessRosterPanel({
  roster,
  t,
}: {
  roster: RuntimeReadinessRoster;
  t: RuntimeTranslator;
}) {
  const currentTurnPlayer = roster.players.find((player) => {
    return player.participantId === roster.currentTurnParticipantId;
  });

  return (
    <Panel
      description={t('runtime.roster.description')}
      eyebrow={t('runtime.roster.eyebrow')}
      title={t('runtime.roster.title')}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={t('runtime.roster.readySummary', {
              ready: String(roster.readyCount),
              total: String(roster.totalCount),
            })}
            tone={
              roster.totalCount > 0 && roster.readyCount === roster.totalCount
                ? 'success'
                : 'info'
            }
          />
          {roster.currentTurnParticipantId ? (
            <StatusBadge
              label={
                currentTurnPlayer
                  ? t('runtime.roster.currentTurnPlayer', {
                      name: currentTurnPlayer.displayName,
                    })
                  : t('runtime.roster.currentTurnId', {
                      participantId: roster.currentTurnParticipantId,
                    })
              }
              tone="warning"
            />
          ) : null}
        </div>

        {roster.players.length ? (
          <ol className="grid gap-2">
            {roster.players.map((player) => (
              <li
                className="grid gap-3 rounded-xl border border-amber-500/15 bg-black/20 p-3"
                key={player.participantId}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-amber-50">
                      {player.displayName}
                    </p>
                    <p className="mt-1 break-all text-xs text-amber-100/55">
                      {player.participantId}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge
                      label={getPlayerReadinessRosterSetupLabel(
                        player.setupStatus,
                        t,
                      )}
                      tone={getPlayerReadinessRosterSetupTone(
                        player.setupStatus,
                      )}
                    />
                    <StatusBadge
                      label={getPlayerReadinessRosterConnectionLabel(
                        player.connectionStatus,
                        t,
                      )}
                      tone={
                        player.connectionStatus === 'connected'
                          ? 'success'
                          : 'info'
                      }
                    />
                  </div>
                </div>

                <dl className="grid gap-2 text-sm">
                  <StatusRow
                    label={t('runtime.roster.assignment')}
                    value={getPlayerReadinessRosterAssignmentLabel(player, t)}
                  />
                  <StatusRow
                    label={t('runtime.roster.placement')}
                    value={getPlayerReadinessRosterPlacementLabel(player, t)}
                  />
                  <StatusRow
                    label={t('runtime.roster.encounter')}
                    value={getPlayerReadinessRosterEncounterLabel(player, t)}
                  />
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            detail={t('runtime.roster.emptyDetail')}
            title={t('runtime.roster.emptyTitle')}
          />
        )}
      </div>
    </Panel>
  );
}

export function getPlayerReadinessRosterSetupLabel(
  status: RuntimeReadinessRoster['players'][number]['setupStatus'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'needs_character':
      return t('runtime.roster.setup.needsCharacter');
    case 'needs_placement':
      return t('runtime.roster.setup.needsPlacement');
    case 'pending_assignment':
      return t('runtime.roster.setup.pendingAssignment');
    case 'ready':
      return t('runtime.roster.setup.ready');
    case 'waiting_for_scene':
      return t('runtime.roster.setup.waitingScene');
  }
}

export function getPlayerReadinessRosterSetupTone(
  status: RuntimeReadinessRoster['players'][number]['setupStatus'],
): RuntimeNoticeTone {
  switch (status) {
    case 'ready':
      return 'success';
    case 'needs_placement':
    case 'pending_assignment':
      return 'warning';
    case 'needs_character':
    case 'waiting_for_scene':
      return 'info';
  }
}

export function getPlayerReadinessRosterConnectionLabel(
  status: RuntimeReadinessRoster['players'][number]['connectionStatus'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'connected':
      return t('runtime.roster.connection.connected');
    case 'disconnected':
      return t('runtime.roster.connection.disconnected');
  }
}

export function getPlayerReadinessRosterAssignmentLabel(
  player: RuntimeReadinessRoster['players'][number],
  t: RuntimeTranslator,
): string {
  switch (player.assignmentStatus) {
    case 'assigned':
      return t('runtime.roster.assignment.assigned', {
        characterId: player.characterId ?? 'none',
      });
    case 'needs_character':
      return t('runtime.roster.assignment.needsCharacter');
    case 'pending_assignment':
      return t('runtime.roster.assignment.pendingAssignment', {
        characterId: player.pendingCharacterId ?? 'none',
      });
  }
}

export function getPlayerReadinessRosterPlacementLabel(
  player: RuntimeReadinessRoster['players'][number],
  t: RuntimeTranslator,
): string {
  switch (player.placement.status) {
    case 'needs_assignment':
      return t('runtime.roster.placement.needsAssignment');
    case 'needs_placement':
      return t('runtime.roster.placement.needsPlacement');
    case 'placed':
      return player.placement.position
        ? t('runtime.roster.placement.placedAt', {
            x: String(player.placement.position.x),
            y: String(player.placement.position.y),
          })
        : t('runtime.roster.placement.placed');
    case 'waiting_for_scene':
      return t('runtime.roster.placement.waitingScene');
  }
}

export function getPlayerReadinessRosterEncounterLabel(
  player: RuntimeReadinessRoster['players'][number],
  t: RuntimeTranslator,
): string {
  switch (player.encounterStatus) {
    case 'current_turn':
      return t('runtime.roster.encounter.currentTurn');
    case 'no_encounter':
      return t('runtime.roster.encounter.noEncounter');
    case 'not_in_encounter':
      return t('runtime.roster.encounter.notInEncounter');
    case 'waiting_turn':
      return t('runtime.roster.encounter.waitingTurn');
  }
}

export function getPlayerReadinessSummaryTitle(
  summary: PlayerReadinessSummary,
  t: RuntimeTranslator,
): string {
  if (summary.turn.isCurrentTurn) {
    return summary.readyCount > 0
      ? t('runtime.playerReadiness.summary.yourTurnReady')
      : t('runtime.playerReadiness.summary.yourTurnNeedsAttention');
  }

  const hasTurnWaiting = summary.items.some(
    (item) => item.id === 'turn' && item.status === 'waiting',
  );

  if (hasTurnWaiting) {
    return t('runtime.playerReadiness.summary.waitingTurn');
  }

  const hasWaiting = summary.items.some((item) => item.status === 'waiting');

  if (hasWaiting) {
    return t('runtime.playerReadiness.summary.waitingTable');
  }

  if (summary.readyCount > 0) {
    return t('runtime.playerReadiness.summary.readyNext');
  }

  return t('runtime.playerReadiness.summary.blocked');
}

export function getPlayerReadinessNextAction(
  summary: PlayerReadinessSummary,
  t: RuntimeTranslator,
): string {
  const item =
    summary.items.find((candidate) => candidate.status === 'blocked') ??
    summary.items.find((candidate) => candidate.status === 'ready') ??
    summary.items.find((candidate) => candidate.status === 'waiting') ??
    null;

  return item
    ? getPlayerReadinessItemDetail(item, summary, t)
    : t('runtime.playerReadiness.detail.ready');
}

export function getPlayerReadinessItemTitle(
  item: PlayerReadinessSummary['items'][number],
  t: RuntimeTranslator,
): string {
  return t(
    `runtime.playerReadiness.item.${item.id}.${item.status}.title` as Parameters<RuntimeTranslator>[0],
  );
}

export function getPlayerReadinessItemDetail(
  item: PlayerReadinessSummary['items'][number],
  summary: PlayerReadinessSummary,
  t: RuntimeTranslator,
): string {
  if (item.id === 'turn' && item.status === 'waiting') {
    return t('runtime.playerReadiness.item.turn.waiting.detail', {
      actor: summary.turn.currentActorLabel,
    });
  }

  if (item.id === 'turn' && item.status === 'ready') {
    return t('runtime.playerReadiness.item.turn.ready.detail', {
      count: String(summary.turn.readyActionCount),
    });
  }

  return t(
    `runtime.playerReadiness.item.${item.id}.${item.status}.detail` as Parameters<RuntimeTranslator>[0],
  );
}

export function PlayerReadinessPanel({
  selectedTargetLabel,
  summary,
  tokenPositionLabel,
  t,
}: {
  selectedTargetLabel: string;
  summary: PlayerReadinessSummary;
  tokenPositionLabel: string;
  t: RuntimeTranslator;
}) {
  const statusTone = getPlayerReadinessStatusTone(summary.status);

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-2xl border border-sky-300/15 bg-sky-950/15 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-200/80">
              {t('runtime.playerReadiness.title')}
            </p>
            <p className="mt-1 font-black text-white">
              {getPlayerReadinessSummaryTitle(summary, t)}
            </p>
          </div>
          <StatusBadge
            label={t('runtime.playerReadiness.progress', {
              completed: String(summary.completedCount),
              total: String(summary.totalCount),
            })}
            tone={statusTone}
          />
        </div>
        <p className="text-xs leading-5 text-sky-100/70">
          {getPlayerReadinessNextAction(summary, t)}
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={t('runtime.playerReadiness.readyCount', {
              count: String(summary.readyCount),
            })}
            tone={summary.readyCount > 0 ? 'warning' : 'info'}
          />
          <StatusBadge
            label={t('runtime.playerReadiness.waitingCount', {
              count: String(summary.waitingCount),
            })}
            tone={summary.waitingCount > 0 ? 'info' : 'success'}
          />
        </div>
      </div>

      <ol className="grid gap-2">
        {summary.items.map((item) => (
          <li
            className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-sky-300/15 bg-black/20 p-3"
            key={item.id}
          >
            <StatusBadge
              label={getPlayerReadinessItemLabel(item.status, t)}
              tone={getPlayerReadinessItemTone(item.status)}
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-50">
                {getPlayerReadinessItemTitle(item, t)}
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-100/60">
                {getPlayerReadinessItemDetail(item, summary, t)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid gap-2 rounded-xl border border-sky-300/15 bg-black/20 p-3 text-sm">
        <StatusRow
          label={t('runtime.playerReadiness.currentActor')}
          value={summary.turn.currentActorLabel}
        />
        <StatusRow
          label={t('runtime.playerReadiness.tokenPosition')}
          value={tokenPositionLabel}
        />
        <StatusRow
          label={t('runtime.playerReadiness.selectedTarget')}
          value={selectedTargetLabel}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          <StatusBadge
            label={t('runtime.playerReadiness.move', {
              state: summary.turn.moveReady
                ? t('runtime.playerReadiness.ready')
                : t('runtime.playerReadiness.blocked'),
            })}
            tone={summary.turn.moveReady ? 'success' : 'info'}
          />
          <StatusBadge
            label={t('runtime.playerReadiness.attack', {
              state: summary.turn.attackReady
                ? t('runtime.playerReadiness.ready')
                : t('runtime.playerReadiness.blocked'),
            })}
            tone={summary.turn.attackReady ? 'success' : 'info'}
          />
          <StatusBadge
            label={t('runtime.playerReadiness.actions', {
              count: String(summary.turn.readyActionCount),
            })}
            tone={summary.turn.readyActionCount > 0 ? 'success' : 'info'}
          />
        </div>
      </div>
    </div>
  );
}

export function getPlayerReadinessItemLabel(
  status: PlayerReadinessSummary['items'][number]['status'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'blocked':
      return t('runtime.playerReadiness.blocked');
    case 'done':
      return t('runtime.playerReadiness.done');
    case 'ready':
      return t('runtime.playerReadiness.next');
    case 'waiting':
      return t('runtime.playerReadiness.waiting');
  }
}

export function getPlayerReadinessItemTone(
  status: PlayerReadinessSummary['items'][number]['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'blocked':
      return 'info';
    case 'done':
      return 'success';
    case 'ready':
      return 'warning';
    case 'waiting':
      return 'info';
  }
}

export function getPlayerReadinessStatusTone(
  status: PlayerReadinessSummary['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'blocked':
      return 'info';
    case 'ready':
      return 'warning';
    case 'waiting':
      return 'info';
  }
}
