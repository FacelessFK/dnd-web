/**
 * The table as a whole: who is at it, whose turn it is, and what just happened.
 *
 * Pure, and the only place the two roles' target lists are built. That matters
 * because they are not the same list and must not be: the GM's options carry
 * participant IDs because the GM's tools are built out of them, and the
 * player's carry display names only.
 *
 * A player picking a target does not need to see `player-002` to do it, and a
 * raw participant ID on a player's screen is a correlation handle for exactly
 * the identifiers the server works to withhold. The `value` behind each option
 * still carries the ID - the browser has to name the target in the command it
 * submits - but nothing renders it.
 */
import type {
  ActiveSceneState,
  CharacterResource,
  CombatEvent,
  Encounter,
  Scene,
  SessionStreamEvent,
} from '@dnd/protocol';

import {
  getActionEconomyFeedbackSummary,
  getActionTargetFeedbackSummary,
  getCurrentTurnLabel,
  getCurrentTurnRailSummary,
  getDmTableSetupChecklist,
  getEncounterStatusSummary,
  getMovementFeedbackSummary,
  getPendingAssignmentRequests,
  getPlayerNextStep,
  getPlayerReadinessSummary,
  getRecoveryReliabilitySummary,
  getRuntimeDisabledReasons,
  getRuntimeReadinessRoster,
  getRuntimeStatusOverview,
  isSessionStreamEvent,
  type Cell,
  type RuntimeMode,
  type SessionSnapshot,
} from './runtime-cockpit-helpers';
import {
  localizeRuntimeDisabledReasons,
  type RuntimeTranslator,
} from './runtime-localization';
import type { RuntimeLogEntry } from './runtime-hud-diagnostics';
import type { RuntimePlayerModel } from './runtime-hud-player-model';

/** The default board the map falls back to before a scene is loaded. */
const fallbackGrid = { cellSizeFeet: 5, height: 8, width: 8 };

export type RuntimeTableModelInput = {
  actingParticipantId: string;
  activeScene: ActiveSceneState | null;
  attackableCombatants: Scene['entities'];
  busyLabel: string | null;
  busyReason: string | null;
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  currentTurnCombatantId: string | null;
  currentTurnParticipantId: string | null;
  encounter: Encounter | null;
  entries: RuntimeLogEntry[];
  knownCharacterIds: Record<string, string | undefined>;
  missingSessionReason: string | null;
  mode: RuntimeMode;
  participants: SessionSnapshot['participants'];
  player: RuntimePlayerModel;
  playerDisplayName: string;
  playerParticipantId: string;
  playerParticipantIds: string[];
  recoveryNotes: string[];
  scene: Scene | null;
  sceneId: string;
  selection: {
    actorParticipantId: string;
    cell: Cell;
    targetCombatantId: string;
    targetParticipantId: string;
  };
  sessionId: string;
  sessionState: SessionSnapshot | null;
  t: RuntimeTranslator;
};

export function deriveRuntimeTableModel(input: RuntimeTableModelInput) {
  const {
    actingParticipantId,
    activeScene,
    attackableCombatants,
    busyLabel,
    busyReason,
    charactersByParticipant,
    currentTurnCombatantId,
    currentTurnParticipantId,
    encounter,
    entries,
    knownCharacterIds,
    missingSessionReason,
    mode,
    participants,
    player,
    playerDisplayName,
    playerParticipantId,
    playerParticipantIds,
    recoveryNotes,
    scene,
    sceneId,
    selection,
    sessionId,
    sessionState,
    t,
  } = input;

  const grid = scene?.grid ?? fallbackGrid;
  const playerParticipants = participants.filter(
    (participant) => participant.role === 'player',
  );
  const targetParticipants = playerParticipants.filter(
    (participant) => participant.id !== actingParticipantId,
  );

  const attackTargetOptions =
    mode === 'player'
      ? [
          // Display name only. See the module note.
          ...targetParticipants.map((participant) => ({
            label: participant.displayName,
            value: `participant:${participant.id}`,
          })),
          ...attackableCombatants.map((combatant) => ({
            label: t('runtime.turnTarget.combatantOption', {
              current: String(combatant.combatant!.hp.current),
              kind: combatant.combatant!.kind,
              max: String(combatant.combatant!.hp.max),
              name: combatant.name,
            }),
            value: `combatant:${combatant.id}`,
          })),
        ]
      : targetParticipants.map((participant) => ({
          label: `${participant.displayName} (${participant.id})`,
          value: participant.id,
        }));
  const selectedAttackTargetValue =
    mode === 'player' && selection.targetCombatantId
      ? `combatant:${selection.targetCombatantId}`
      : mode === 'player'
        ? `participant:${selection.targetParticipantId}`
        : selection.targetParticipantId;
  const hasValidAttackTarget = attackTargetOptions.some(
    (option) => option.value === selectedAttackTargetValue,
  );

  const currentTurnName = getCurrentTurnLabel({
    encounter,
    participants,
    scene,
  });
  const currentTurnDisplayName =
    currentTurnName === 'No active turn'
      ? t('runtime.actionEconomy.noEncounter')
      : currentTurnName;
  const currentTurnRailSummary = getCurrentTurnRailSummary({
    charactersByParticipant,
    encounter,
    participants,
    scene,
  });

  const disabledReasons = localizeRuntimeDisabledReasons(
    getRuntimeDisabledReasons({
      actingParticipantId,
      activeSceneKnown: Boolean(activeScene || sceneId),
      activeSceneLoaded: Boolean(activeScene),
      activeScenePlacementCount: activeScene?.placedCharacters.length ?? 0,
      busyLabel,
      encounterLoaded: Boolean(encounter),
      hasValidAttackTarget,
      mode,
      playerDisplayName,
      playerParticipantId,
      playerParticipantIds,
      selectedActorHasCharacter: Boolean(
        knownCharacterIds[actingParticipantId] ??
        charactersByParticipant[actingParticipantId]?.character.id,
      ),
      sessionId,
      targetParticipantId: selection.targetParticipantId,
    }),
    t,
  );

  const movementFeedbackSummary = getMovementFeedbackSummary({
    actingParticipantId,
    activeScene,
    charactersByParticipant,
    encounter,
    grid,
    moveDisabledReason: disabledReasons.move,
    participants,
    selectedCell: selection.cell,
  });

  const playerAttackDisabledReason =
    disabledReasons.attack ??
    (currentTurnCombatantId
      ? t('runtime.disabled.currentTurnCombatant')
      : null);

  const lastCombatEvent = findStreamEvent<CombatEvent>(entries, 'combat_event');
  const lastEncounterEvent = findStreamEvent<
    Extract<SessionStreamEvent, { type: 'encounter_state' }>
  >(entries, 'encounter_state');

  const actionTargetFeedbackSummary = getActionTargetFeedbackSummary({
    attackDisabledReason: playerAttackDisabledReason,
    charactersByParticipant,
    lastCombatEvent,
    participants,
    scene,
    selectedTargetCombatantId: selection.targetCombatantId,
    selectedTargetParticipantId: selection.targetParticipantId,
  });
  const encounterStatusSummary = getEncounterStatusSummary({
    encounter,
    lastCombatEvent,
    lastEncounterEvent,
    participants,
    scene,
  });
  const actionEconomyFeedbackSummary = getActionEconomyFeedbackSummary({
    actorTurnActionDisabledReason: disabledReasons.actorTurnAction,
    currentTurn: currentTurnRailSummary,
    lastEncounterEvent,
  });

  const playerPlacement = activeScene?.placedCharacters.find(
    (placement) => placement.participantId === playerParticipantId,
  );
  const pendingAssignmentRequests = getPendingAssignmentRequests({
    charactersByParticipant,
    sessionState,
  });
  const dmTableSetupChecklist = getDmTableSetupChecklist({
    activeSceneLoaded: Boolean(activeScene),
    assignedCharacterCount: playerParticipants.filter((participant) =>
      Boolean(participant.characterId),
    ).length,
    encounterLoaded: Boolean(encounter),
    pendingAssignmentCount: pendingAssignmentRequests.length,
    placedCharacterCount: activeScene?.placedCharacters.length ?? 0,
    playerCount: playerParticipants.length,
    sessionId,
  });
  const playerReadinessSummary = getPlayerReadinessSummary({
    attackReady: actionTargetFeedbackSummary.attackReady,
    currentActorLabel: currentTurnDisplayName,
    hasActiveScene: Boolean(activeScene),
    hasCharacter: Boolean(player.character),
    hasEncounter: Boolean(encounter),
    isCharacterAssigned: player.isCharacterAssigned,
    isCharacterReady: player.isCharacterReady,
    isCharacterSubmitted: player.isCharacterSubmitted,
    isCurrentTurn: currentTurnParticipantId === playerParticipantId,
    isJoined: player.isJoined,
    isPlaced: Boolean(playerPlacement),
    moveReady: movementFeedbackSummary.moveReady,
    playerDisplayName,
    playerParticipantId,
    readyActionCount: actionEconomyFeedbackSummary.resources.filter(
      (resource) => resource.ready,
    ).length,
    sessionId,
  });
  const recoveryReliabilitySummary = getRecoveryReliabilitySummary({
    activeSceneId: sessionState?.session.activeSceneId ?? null,
    activeSceneLoaded: Boolean(activeScene),
    characterCount: Object.keys(charactersByParticipant).length,
    encounterLoaded: Boolean(encounter),
    recoveryNotes,
    sceneLoaded: Boolean(scene),
    sessionId,
  });

  const selectedActorSeat = sessionState?.participants.find(
    (participant) => participant.id === selection.actorParticipantId,
  );
  const selectedActorKnownCharacterId =
    charactersByParticipant[selection.actorParticipantId]?.character.id ??
    selectedActorSeat?.pendingCharacterId ??
    knownCharacterIds[selection.actorParticipantId];

  return {
    actionEconomyFeedbackSummary,
    actionTargetFeedbackSummary,
    activeSceneLabel: scene
      ? `${scene.name} (${scene.id})`
      : (activeScene?.activeSceneId ?? sceneId) || t('common.none'),
    attackTargetOptions,
    currentTurnDisplayName,
    currentTurnRailSummary,
    disabledReasons,
    dmAssignSelectedReason:
      busyReason ??
      missingSessionReason ??
      (mode === 'dm' ? null : t('runtime.disabled.dmOnlyControl')) ??
      (selectedActorKnownCharacterId
        ? selectedActorKnownCharacterId !==
          (selectedActorSeat?.characterId ?? null)
          ? null
          : t('runtime.disabled.selectedAlreadyAssigned')
        : t('runtime.disabled.recoverCharacter')),
    dmTableSetupChecklist,
    encounterStatusSummary,
    grid,
    hasValidAttackTarget,
    lastCombatEvent,
    lastEncounterEvent,
    mapCharacterSummaries: buildMapCharacterSummaries(charactersByParticipant),
    movementFeedbackSummary,
    pendingAssignmentRequests,
    playerAttackDisabledReason,
    playerNextStep: getPlayerNextStep({
      hasActiveScene: Boolean(activeScene),
      hasCharacter: Boolean(player.character),
      hasEncounter: Boolean(encounter),
      isCharacterAssigned: player.isCharacterAssigned,
      isCharacterReady: player.isCharacterReady,
      isCharacterSubmitted: player.isCharacterSubmitted,
      isCurrentTurn: currentTurnParticipantId === playerParticipantId,
      isJoined: player.isJoined,
      isPlaced: Boolean(playerPlacement),
      sessionId,
    }),
    playerParticipants,
    playerPlacement,
    playerReadinessSummary,
    recoveryReliabilitySummary,
    runtimeReadinessRoster: getRuntimeReadinessRoster({
      activeScene,
      encounter,
      sessionState,
    }),
    runtimeStatusOverview: getRuntimeStatusOverview({
      dmTableSetupChecklist,
      encounterStatusSummary,
      mode,
      playerReadinessSummary,
      recoveryReliabilitySummary,
    }),
    selectedActorKnownCharacterId,
    selectedActorSeat,
    selectedAttackTargetValue,
  };
}

export type RuntimeTableModel = ReturnType<typeof deriveRuntimeTableModel>;

/** The newest recorded frame of one type, or null. Entries are newest-first. */
function findStreamEvent<T>(
  entries: RuntimeLogEntry[],
  type: SessionStreamEvent['type'],
): T | null {
  const match = entries.find(
    (entry) =>
      isSessionStreamEvent(entry.payload) && entry.payload.type === type,
  );

  return (match?.payload as T | undefined) ?? null;
}

/**
 * Name and HP are all the tactical map needs from a character resource.
 *
 * Narrowing here keeps the renderer decoupled from the full runtime character
 * shape, which is the seam ROADMAP M4 may swap the drawing layer behind.
 */
function buildMapCharacterSummaries(
  charactersByParticipant: Record<string, CharacterResource | undefined>,
): Record<
  string,
  { name: string; hp: { current: number; max: number } } | undefined
> {
  const summaries: Record<
    string,
    { name: string; hp: { current: number; max: number } } | undefined
  > = {};

  for (const [participantId, resource] of Object.entries(
    charactersByParticipant,
  )) {
    if (!resource) {
      continue;
    }

    summaries[participantId] = {
      hp: {
        current: resource.character.hp.current,
        max: resource.character.hp.max,
      },
      name: resource.character.name,
    };
  }

  return summaries;
}
