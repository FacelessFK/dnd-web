import { randomUUID } from 'node:crypto';

import {
  getNextTurnState,
  sortEncounterParticipantsByInitiative,
} from '@dnd/rules';
import type { SessionErrorCode } from '@dnd/protocol';
import type {
  Encounter,
  EncounterId,
  EncounterParticipant,
  ParticipantId,
  Scene,
  SceneId,
  SessionId,
} from '@dnd/shared';

export class EncounterRuntimeError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EncounterRuntimeError';
  }
}

export function createDefaultTurnUsage(): Encounter['currentTurnUsage'] {
  return {
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    movementUsed: 0,
  };
}

export function buildEncounterParticipants(
  participants: EncounterParticipant[],
): EncounterParticipant[] {
  if (participants.length < 1) {
    throw new EncounterRuntimeError(
      'invalid_encounter_participant',
      'An encounter requires at least one placed participant character.',
    );
  }

  return sortEncounterParticipantsByInitiative(participants);
}

export function createEncounterRecord(params: {
  sessionId: SessionId;
  sceneId: SceneId;
  participants: EncounterParticipant[];
}): Encounter {
  const now = createTimestamp();

  return {
    id: createEncounterId(),
    sessionId: params.sessionId,
    sceneId: params.sceneId,
    status: 'active',
    participants: buildEncounterParticipants(params.participants),
    currentTurnIndex: 0,
    roundNumber: 1,
    currentTurnUsage: createDefaultTurnUsage(),
    createdAt: now,
    updatedAt: now,
  };
}

export function assertEncounterBelongsToSession(
  encounter: Encounter,
  sessionId: SessionId,
): void {
  if (encounter.sessionId === sessionId) {
    return;
  }

  throw new EncounterRuntimeError(
    'invalid_encounter_session_association',
    `Encounter "${encounter.id}" belongs to session "${encounter.sessionId}" and cannot be used in session "${sessionId}".`,
  );
}

export function assertEncounterSceneIsActive(
  encounter: Encounter,
  activeSceneId: SceneId,
): void {
  if (encounter.sceneId === activeSceneId) {
    return;
  }

  throw new EncounterRuntimeError(
    'invalid_scene_encounter_association',
    `Encounter "${encounter.id}" belongs to active scene "${encounter.sceneId}" and cannot be used while session scene "${activeSceneId}" is active.`,
  );
}

export function assertEncounterParticipantsArePlaced(
  encounter: Encounter,
  placedParticipantIds: ParticipantId[],
): void {
  for (const participant of encounter.participants) {
    if (placedParticipantIds.includes(participant.participantId)) {
      continue;
    }

    throw new EncounterRuntimeError(
      'invalid_encounter_participant',
      `Encounter "${encounter.id}" references participant "${participant.participantId}" without an active-scene placement.`,
    );
  }
}

export function assertSceneBelongsToEncounter(
  encounter: Encounter,
  scene: Scene,
): void {
  if (scene.id === encounter.sceneId) {
    return;
  }

  throw new EncounterRuntimeError(
    'invalid_scene_encounter_association',
    `Encounter "${encounter.id}" belongs to scene "${encounter.sceneId}" and cannot use scene "${scene.id}".`,
  );
}

export function advanceEncounterTurn(encounter: Encounter): Encounter {
  const nextTurnState = getNextTurnState({
    currentTurnIndex: encounter.currentTurnIndex,
    participantCount: encounter.participants.length,
    roundNumber: encounter.roundNumber,
  });

  if (!nextTurnState) {
    throw new EncounterRuntimeError(
      'invalid_turn_advance',
      `Encounter "${encounter.id}" has invalid turn state and cannot advance.`,
    );
  }

  return {
    ...encounter,
    currentTurnIndex: nextTurnState.currentTurnIndex,
    roundNumber: nextTurnState.roundNumber,
    currentTurnUsage: createDefaultTurnUsage(),
    updatedAt: createTimestamp(),
  };
}

function createEncounterId(): EncounterId {
  return `encounter_${randomUUID()}`;
}

function createTimestamp(): string {
  return new Date().toISOString();
}
