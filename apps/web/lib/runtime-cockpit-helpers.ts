import type {
  CharacterInput,
  CharacterResource,
  RuntimeErrorCode,
  SessionStreamEvent,
  SessionCommandSuccess,
} from '@dnd/protocol';

import type { RuntimeApiFailure } from './runtime-api';

export type SessionSnapshot = SessionCommandSuccess['data']['state'];

export type Cell = {
  x: number;
  y: number;
};

export type RuntimeMode = 'dm' | 'player';

export type StoredCockpitState = {
  charactersByParticipant?: Record<string, string>;
  dmDisplayName?: string;
  dmParticipantId?: string;
  mode?: RuntimeMode;
  playerDisplayName?: string;
  playerParticipantId?: string;
  sceneId?: string;
  sessionId?: string;
};

export const cockpitStorageKey = 'dnd-runtime-cockpit';

export const defaultDm = {
  displayName: 'Dungeon Master',
  participantId: 'dm-001',
} as const;

export const samplePlayers = [
  {
    displayName: 'Player One',
    participantId: 'player-001',
  },
  {
    displayName: 'Player Two',
    participantId: 'player-002',
  },
] as const;

export const defaultPlayer = samplePlayers[0];

export const sampleCharacters: Record<string, CharacterInput> = {
  'player-001': {
    abilities: {
      cha: 10,
      con: 13,
      dex: 14,
      int: 16,
      str: 8,
      wis: 12,
    },
    armorClass: 13,
    background: 'Sage',
    className: 'Wizard',
    hp: {
      current: 26,
      max: 26,
      temp: 0,
    },
    level: 5,
    name: 'Aria',
    speed: 30,
    speciesOrRace: 'Elf',
  },
  'player-002': {
    abilities: {
      cha: 8,
      con: 14,
      dex: 12,
      int: 10,
      str: 16,
      wis: 10,
    },
    armorClass: 0,
    background: 'Guard',
    className: 'Fighter',
    hp: {
      current: 1,
      max: 1,
      temp: 0,
    },
    level: 5,
    name: 'Borin',
    speed: 30,
    speciesOrRace: 'Dwarf',
  },
};

export function formatRuntimeFailure(
  label: string,
  failure: RuntimeApiFailure,
): string {
  const status = failure.status ? `HTTP ${failure.status}: ` : '';
  const code = failure.code ? `${failure.code}: ` : '';

  return `${label} failed. ${status}${code}${failure.message}`;
}

export function getKnownCharacterIds(
  sessionState: SessionSnapshot | null,
  charactersByParticipant: Record<string, CharacterResource | undefined>,
): Record<string, string> {
  const ids: Record<string, string> = {};

  for (const [participantId, resource] of Object.entries(
    charactersByParticipant,
  )) {
    if (resource) {
      ids[participantId] = resource.character.id;
    }
  }

  for (const participant of sessionState?.participants ?? []) {
    if (participant.characterId) {
      ids[participant.id] = participant.characterId;
    }
  }

  return ids;
}

export function getAssignedCharacterRefs(sessionState: SessionSnapshot): Array<{
  characterId: string;
  participantId: string;
}> {
  return sessionState.participants.flatMap((participant) =>
    participant.characterId
      ? [
          {
            characterId: participant.characterId,
            participantId: participant.id,
          },
        ]
      : [],
  );
}

export function getPlayerParticipantIds(
  sessionState: SessionSnapshot | null,
): string[] {
  const participants =
    sessionState?.participants ??
    samplePlayers.map((player) => ({
      id: player.participantId,
      role: 'player' as const,
    }));

  return participants
    .filter((participant) => participant.role === 'player')
    .map((participant) => participant.id);
}

export function getActingParticipantId({
  mode,
  playerParticipantId,
  selectedActor,
}: {
  mode: RuntimeMode;
  playerParticipantId: string;
  selectedActor: string;
}): string {
  return mode === 'player' ? playerParticipantId : selectedActor;
}

export type RuntimeDisabledReasons = {
  actorTurnAction: string | null;
  attack: string | null;
  dmCharacter: string | null;
  dmEncounter: string | null;
  joinPlayer: string | null;
  move: string | null;
  placeTokens: string | null;
  recover: string | null;
  startEncounter: string | null;
};

export type RuntimeNoticeTone = 'danger' | 'info' | 'success' | 'warning';

export type RuntimeEventSummary = {
  detail: string;
  title: string;
  tone: RuntimeNoticeTone;
};

export type PlayerNextStep = {
  detail: string;
  title: string;
  tone: RuntimeNoticeTone;
};

export function getRuntimeDisabledReasons({
  actingParticipantId,
  activeSceneKnown,
  activeSceneLoaded,
  activeScenePlacementCount,
  busyLabel,
  encounterLoaded,
  mode,
  playerDisplayName,
  playerParticipantId,
  playerParticipantIds,
  selectedActorHasCharacter,
  sessionId,
  targetParticipantId,
}: {
  actingParticipantId: string;
  activeSceneKnown: boolean;
  activeSceneLoaded: boolean;
  activeScenePlacementCount: number;
  busyLabel: string | null;
  encounterLoaded: boolean;
  mode: RuntimeMode;
  playerDisplayName: string;
  playerParticipantId: string;
  playerParticipantIds: string[];
  selectedActorHasCharacter: boolean;
  sessionId: string;
  targetParticipantId: string;
}): RuntimeDisabledReasons {
  const busyReason = busyLabel ? `Waiting on ${busyLabel}.` : null;
  const missingSessionReason = sessionId
    ? null
    : 'Create, paste, or recover a session first.';
  const missingActiveSceneReason = activeSceneLoaded
    ? null
    : 'Create/recover an active scene before moving or starting combat.';
  const missingEncounterReason = encounterLoaded
    ? null
    : 'Start or recover an encounter first.';
  const invalidActorReason = playerParticipantIds.includes(actingParticipantId)
    ? null
    : 'Choose a joined player participant as the acting character.';
  const invalidTargetReason = playerParticipantIds.includes(targetParticipantId)
    ? actingParticipantId === targetParticipantId
      ? 'Choose a different target participant.'
      : null
    : 'Choose a joined player participant as the target.';
  const dmOnlyReason =
    mode === 'dm' ? null : 'Switch to DM mode for this control.';
  const playerJoinReason =
    mode === 'player'
      ? null
      : 'Switch to Player mode to join as the configured player.';
  const missingPlayerIdentityReason =
    playerParticipantId && playerDisplayName
      ? null
      : 'Enter a player participant ID and display name.';

  return {
    actorTurnAction:
      busyReason ??
      missingSessionReason ??
      missingEncounterReason ??
      invalidActorReason,
    attack:
      busyReason ??
      missingSessionReason ??
      missingEncounterReason ??
      invalidActorReason ??
      invalidTargetReason,
    dmCharacter:
      busyReason ??
      missingSessionReason ??
      dmOnlyReason ??
      invalidActorReason ??
      (selectedActorHasCharacter
        ? null
        : 'Load or assign this character first.'),
    dmEncounter:
      busyReason ??
      missingSessionReason ??
      dmOnlyReason ??
      missingEncounterReason,
    joinPlayer:
      busyReason ??
      missingSessionReason ??
      playerJoinReason ??
      missingPlayerIdentityReason,
    move:
      busyReason ??
      missingSessionReason ??
      missingActiveSceneReason ??
      invalidActorReason,
    placeTokens:
      busyReason ??
      missingSessionReason ??
      dmOnlyReason ??
      (activeSceneKnown ? null : 'Create or recover an active scene first.'),
    recover: busyReason ?? missingSessionReason,
    startEncounter:
      busyReason ??
      missingSessionReason ??
      dmOnlyReason ??
      missingActiveSceneReason ??
      (activeScenePlacementCount
        ? null
        : 'Place at least one character in the active scene first.'),
  };
}

export function getPlayerNextStep({
  hasActiveScene,
  hasCharacter,
  hasEncounter,
  isCurrentTurn,
  isJoined,
  isPlaced,
  sessionId,
}: {
  hasActiveScene: boolean;
  hasCharacter: boolean;
  hasEncounter: boolean;
  isCurrentTurn: boolean;
  isJoined: boolean;
  isPlaced: boolean;
  sessionId: string;
}): PlayerNextStep {
  if (!sessionId) {
    return {
      detail: 'Paste a session ID from the DM, then join or recover.',
      title: 'Choose a session',
      tone: 'info',
    };
  }

  if (!isJoined) {
    return {
      detail:
        'Join the session as this participant before reading table state.',
      title: 'Join the table',
      tone: 'warning',
    };
  }

  if (!hasCharacter) {
    return {
      detail: 'Ask the DM to assign and finalize a character, then recover.',
      title: 'Waiting for character',
      tone: 'warning',
    };
  }

  if (!hasActiveScene) {
    return {
      detail: 'The DM has not activated a scene yet, or you need to recover.',
      title: 'No active scene',
      tone: 'warning',
    };
  }

  if (!isPlaced) {
    return {
      detail: 'Your character has no token placement in the active scene.',
      title: 'Token not placed',
      tone: 'warning',
    };
  }

  if (!hasEncounter) {
    return {
      detail:
        'You can move outside combat; turn resources unlock after encounter start.',
      title: 'Exploration mode',
      tone: 'info',
    };
  }

  if (!isCurrentTurn) {
    return {
      detail: 'Watch the current actor and prepare your target or movement.',
      title: 'Waiting for your turn',
      tone: 'info',
    };
  }

  return {
    detail:
      'Move, attack, or spend your action economy. The server validates legality.',
    title: 'Your turn',
    tone: 'success',
  };
}

export function isSessionStreamEvent(
  input: unknown,
): input is SessionStreamEvent {
  if (!input || typeof input !== 'object' || !('type' in input)) {
    return false;
  }

  return (
    input.type === 'session_state' ||
    input.type === 'movement_state' ||
    input.type === 'encounter_state' ||
    input.type === 'combat_event' ||
    input.type === 'character_state'
  );
}

export function describeSessionStreamEvent(
  event: SessionStreamEvent,
): RuntimeEventSummary {
  switch (event.type) {
    case 'combat_event':
      return {
        detail: `${event.attackerParticipantId} rolled ${event.roll.total} vs AC ${event.targetArmorClass}; ${event.hit ? `hit for ${event.damage}` : 'missed'} (${event.targetParticipantId} HP ${event.targetHp.previous} -> ${event.targetHp.current}).`,
        title: 'Attack resolved',
        tone: event.hit ? 'danger' : 'warning',
      };
    case 'encounter_state':
      return {
        detail: `${event.reason.replaceAll('_', ' ')}. Round ${event.encounter.roundNumber}, turn ${event.encounter.currentTurnIndex + 1}.`,
        title: 'Encounter state',
        tone: 'info',
      };
    case 'movement_state':
      return {
        detail: `${event.participantId} ${event.reason.replaceAll('_', ' ')} to ${event.position.x},${event.position.y}.`,
        title: 'Token movement',
        tone: 'success',
      };
    case 'character_state':
      return {
        detail: `${event.characterId} HP is now ${event.hp.current}/${event.hp.max}${event.activeConditions?.length ? ` with ${event.activeConditions.join(', ')}` : ''}.`,
        title: 'Character state',
        tone: 'warning',
      };
    case 'session_state':
      return {
        detail: `${event.reason.replaceAll('_', ' ')}. Revision ${event.revision}.`,
        title: 'Session state',
        tone: 'info',
      };
  }
}

export function isExpectedRecoveryMiss(
  code: RuntimeErrorCode | undefined,
): boolean {
  return (
    code === 'no_active_scene' ||
    code === 'no_active_encounter' ||
    code === 'scene_not_found' ||
    code === 'invalid_scene_id' ||
    code === 'invalid_scene_session_association' ||
    code === 'character_not_found' ||
    code === 'invalid_character_id'
  );
}

export function sanitizeSessionIdInput(value: string): string {
  return value.trim().toUpperCase();
}

export function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export function flag(value: boolean): string {
  return value ? 'yes' : 'no';
}
