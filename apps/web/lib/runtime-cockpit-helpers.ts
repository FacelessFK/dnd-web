import type {
  CharacterInput,
  CharacterResource,
  RuntimeErrorCode,
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
