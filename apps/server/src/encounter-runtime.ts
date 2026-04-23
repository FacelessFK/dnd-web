import { randomUUID } from 'node:crypto';

import {
  getCurrentTurnParticipant,
  getUpdatedMovementUsage,
  getNextTurnState,
  markActionUsed,
  markBonusActionUsed,
  markReactionUsed,
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

export function requireCurrentEncounterParticipant(
  encounter: Encounter,
): EncounterParticipant {
  const participant = getCurrentTurnParticipant(
    encounter.participants,
    encounter.currentTurnIndex,
  );

  if (participant) {
    return participant;
  }

  throw new EncounterRuntimeError(
    'invalid_turn_advance',
    `Encounter "${encounter.id}" has an invalid current turn index "${encounter.currentTurnIndex}".`,
  );
}

export function assertEncounterTurnActor(
  encounter: Encounter,
  actorParticipantId: ParticipantId,
): EncounterParticipant {
  const currentTurnParticipant = requireCurrentEncounterParticipant(encounter);

  if (currentTurnParticipant.participantId === actorParticipantId) {
    return currentTurnParticipant;
  }

  throw new EncounterRuntimeError(
    'invalid_turn_actor',
    `Participant "${actorParticipantId}" is not the current turn owner for encounter "${encounter.id}".`,
  );
}

export function markEncounterActionUsed(encounter: Encounter): Encounter {
  const updatedTurnUsage = markActionUsed(encounter.currentTurnUsage);

  if (updatedTurnUsage) {
    return withUpdatedTurnUsage(encounter, updatedTurnUsage);
  }

  throw new EncounterRuntimeError(
    'action_already_used',
    `Encounter "${encounter.id}" has already spent its action for the current turn.`,
  );
}

export function markEncounterBonusActionUsed(encounter: Encounter): Encounter {
  const updatedTurnUsage = markBonusActionUsed(encounter.currentTurnUsage);

  if (updatedTurnUsage) {
    return withUpdatedTurnUsage(encounter, updatedTurnUsage);
  }

  throw new EncounterRuntimeError(
    'bonus_action_already_used',
    `Encounter "${encounter.id}" has already spent its bonus action for the current turn.`,
  );
}

export function markEncounterReactionUsed(encounter: Encounter): Encounter {
  const updatedTurnUsage = markReactionUsed(encounter.currentTurnUsage);

  if (updatedTurnUsage) {
    return withUpdatedTurnUsage(encounter, updatedTurnUsage);
  }

  throw new EncounterRuntimeError(
    'reaction_already_used',
    `Encounter "${encounter.id}" has already spent its reaction for the current turn.`,
  );
}

export function recordEncounterMovementUsage(params: {
  encounter: Encounter;
  additionalMovementFeet: number;
  movementAllowanceFeet: number;
}): Encounter {
  if (
    !Number.isInteger(params.additionalMovementFeet) ||
    params.additionalMovementFeet < 1
  ) {
    throw new EncounterRuntimeError(
      'invalid_movement_usage_amount',
      'Movement usage increments must be positive whole feet.',
    );
  }

  const updatedMovementUsage = getUpdatedMovementUsage({
    currentMovementUsed: params.encounter.currentTurnUsage.movementUsed,
    additionalMovementFeet: params.additionalMovementFeet,
    movementAllowanceFeet: params.movementAllowanceFeet,
  });

  if (updatedMovementUsage != null) {
    return withUpdatedTurnUsage(params.encounter, {
      ...params.encounter.currentTurnUsage,
      movementUsed: updatedMovementUsage,
    });
  }

  throw new EncounterRuntimeError(
    'movement_usage_exceeds_allowance',
    `Encounter "${params.encounter.id}" cannot spend ${params.additionalMovementFeet} more feet of movement without exceeding the current turn allowance.`,
  );
}

export function setEncounterTurnUsage(
  encounter: Encounter,
  currentTurnUsage: Encounter['currentTurnUsage'],
): Encounter {
  return withUpdatedTurnUsage(encounter, structuredClone(currentTurnUsage));
}

export function endEncounterRecord(encounter: Encounter): Encounter {
  return {
    ...encounter,
    status: 'ended',
    updatedAt: createTimestamp(),
  };
}

function createEncounterId(): EncounterId {
  return `encounter_${randomUUID()}`;
}

function createTimestamp(): string {
  return new Date().toISOString();
}

function withUpdatedTurnUsage(
  encounter: Encounter,
  currentTurnUsage: Encounter['currentTurnUsage'],
): Encounter {
  return {
    ...encounter,
    currentTurnUsage,
    updatedAt: createTimestamp(),
  };
}
