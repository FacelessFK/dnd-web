import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CharacterResource } from '@dnd/protocol';

import type { SessionSnapshot } from './runtime-cockpit-helpers';
import {
  characterInputFromDraft,
  characterUpdateInputFromDraft,
  createDefaultCharacterDraftForm,
  describeSessionStreamEvent,
  formatRuntimeFailure,
  getActingParticipantId,
  getAssignedCharacterRefs,
  getKnownCharacterIds,
  getPlayerNextStep,
  getPlayerParticipantIds,
  getRuntimeDisabledReasons,
  isSessionStreamEvent,
  isExpectedRecoveryMiss,
  sanitizeSessionIdInput,
  validateCharacterDraftForm,
} from './runtime-cockpit-helpers';

const sessionState: SessionSnapshot = {
  participants: [
    {
      characterId: null,
      connectionStatus: 'connected',
      displayName: 'Dungeon Master',
      id: 'dm-001',
      joinedAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      role: 'dm',
    },
    {
      characterId: 'CHAR-001',
      connectionStatus: 'disconnected',
      displayName: 'Player One',
      id: 'player-001',
      joinedAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      role: 'player',
    },
  ],
  session: {
    activeSceneId: 'SCENE-001',
    createdAt: '2026-01-01T00:00:00.000Z',
    dmParticipantId: 'dm-001',
    id: 'SESSION-001',
    playerParticipantIds: ['player-001'],
    revision: 3,
    rulesProfileId: 'dnd5e-2024-core',
    status: 'lobby',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

describe('runtime cockpit helpers', () => {
  it('collects assigned character reads from recovered session state', () => {
    assert.deepEqual(getAssignedCharacterRefs(sessionState), [
      {
        characterId: 'CHAR-001',
        participantId: 'player-001',
      },
    ]);
  });

  it('prefers session assigned IDs over loaded character resources', () => {
    const ids = getKnownCharacterIds(sessionState, {
      'player-001': {
        character: {
          id: 'CHAR-LOCAL',
        },
      } as CharacterResource,
    });

    assert.equal(ids['player-001'], 'CHAR-001');
  });

  it('classifies expected optional recovery misses', () => {
    assert.equal(isExpectedRecoveryMiss('no_active_scene'), true);
    assert.equal(isExpectedRecoveryMiss('no_active_encounter'), true);
    assert.equal(isExpectedRecoveryMiss('scene_not_found'), true);
    assert.equal(isExpectedRecoveryMiss('command_id_conflict'), false);
    assert.equal(isExpectedRecoveryMiss(undefined), false);
  });

  it('formats runtime failures for the cockpit', () => {
    assert.equal(
      formatRuntimeFailure('get_encounter_state', {
        code: 'no_active_encounter',
        message: 'There is no active encounter.',
        status: 409,
      }),
      'get_encounter_state failed. HTTP 409: no_active_encounter: There is no active encounter.',
    );
  });

  it('normalizes pasted session IDs and exposes player IDs', () => {
    assert.equal(sanitizeSessionIdInput(' session-001 '), 'SESSION-001');
    assert.deepEqual(getPlayerParticipantIds(sessionState), ['player-001']);
  });

  it('selects the authoritative actor from role mode', () => {
    assert.equal(
      getActingParticipantId({
        mode: 'player',
        playerParticipantId: 'player-002',
        selectedActor: 'player-001',
      }),
      'player-002',
    );
    assert.equal(
      getActingParticipantId({
        mode: 'dm',
        playerParticipantId: 'player-002',
        selectedActor: 'player-001',
      }),
      'player-001',
    );
  });

  it('guards DM-only controls from player mode', () => {
    const reasons = getRuntimeDisabledReasons({
      actingParticipantId: 'player-001',
      activeSceneKnown: true,
      activeSceneLoaded: true,
      activeScenePlacementCount: 2,
      busyLabel: null,
      encounterLoaded: true,
      mode: 'player',
      playerDisplayName: 'Player One',
      playerParticipantId: 'player-001',
      playerParticipantIds: ['player-001', 'player-002'],
      selectedActorHasCharacter: true,
      sessionId: 'ABC123',
      targetParticipantId: 'player-002',
    });

    assert.equal(reasons.move, null);
    assert.equal(reasons.actorTurnAction, null);
    assert.equal(reasons.attack, null);
    assert.equal(reasons.dmEncounter, 'Switch to DM mode for this control.');
    assert.equal(reasons.dmCharacter, 'Switch to DM mode for this control.');
  });

  it('explains player prerequisite failures', () => {
    const reasons = getRuntimeDisabledReasons({
      actingParticipantId: 'player-999',
      activeSceneKnown: false,
      activeSceneLoaded: false,
      activeScenePlacementCount: 0,
      busyLabel: null,
      encounterLoaded: false,
      mode: 'player',
      playerDisplayName: 'Player Missing',
      playerParticipantId: 'player-999',
      playerParticipantIds: ['player-001'],
      selectedActorHasCharacter: false,
      sessionId: 'ABC123',
      targetParticipantId: 'player-001',
    });

    assert.equal(
      reasons.move,
      'Create/recover an active scene before moving or starting combat.',
    );
    assert.equal(
      reasons.actorTurnAction,
      'Start or recover an encounter first.',
    );
  });

  it('summarizes stream events for the readable combat feed', () => {
    const summary = describeSessionStreamEvent({
      attackerCharacterId: 'CHAR-001',
      attackerParticipantId: 'player-001',
      damage: 1,
      encounterId: 'ENC-001',
      hit: true,
      reason: 'attack_resolved',
      roll: {
        d20: 12,
        modifier: 5,
        total: 17,
      },
      sessionId: 'SESSION-001',
      targetArmorClass: 13,
      targetCharacterId: 'CHAR-002',
      targetHp: {
        current: 0,
        previous: 1,
      },
      targetParticipantId: 'player-002',
      type: 'combat_event',
    });

    assert.equal(summary.title, 'Attack resolved');
    assert.equal(summary.tone, 'danger');
    assert.match(summary.detail, /player-001 rolled 17/);
    assert.equal(
      isSessionStreamEvent({
        type: 'movement_state',
      }),
      true,
    );
    assert.equal(isSessionStreamEvent({ type: 'unknown_event' }), false);
  });

  it('explains the next player step from loaded read models', () => {
    assert.deepEqual(
      getPlayerNextStep({
        hasActiveScene: true,
        hasCharacter: true,
        hasEncounter: true,
        isCharacterAssigned: true,
        isCurrentTurn: true,
        isJoined: true,
        isPlaced: true,
        sessionId: 'SESSION-001',
      }),
      {
        detail:
          'Move, attack, or spend your action economy. The server validates legality.',
        title: 'Your turn',
        tone: 'success',
      },
    );

    assert.equal(
      getPlayerNextStep({
        hasActiveScene: false,
        hasCharacter: false,
        hasEncounter: false,
        isCharacterAssigned: false,
        isCurrentTurn: false,
        isJoined: false,
        isPlaced: false,
        sessionId: 'SESSION-001',
      }).title,
      'Join the table',
    );
  });

  it('creates and normalizes player character draft forms', () => {
    const draft = createDefaultCharacterDraftForm('Mira');

    assert.equal(draft.name, "Mira's Hero");
    assert.deepEqual(validateCharacterDraftForm(draft), []);

    const edited = {
      ...draft,
      abilities: {
        ...draft.abilities,
        int: '16',
      },
      hp: {
        current: '9',
        max: '10',
        temp: '2',
      },
      level: '3',
      name: '  Calder  ',
      notes: '  A careful scout.  ',
    };

    assert.deepEqual(characterInputFromDraft(edited), {
      abilities: {
        cha: 10,
        con: 14,
        dex: 14,
        int: 16,
        str: 10,
        wis: 12,
      },
      armorClass: 13,
      background: 'Wanderer',
      className: 'Fighter',
      hp: {
        current: 9,
        max: 10,
        temp: 2,
      },
      level: 3,
      name: 'Calder',
      notes: 'A careful scout.',
      speed: 30,
      speciesOrRace: 'Human',
    });
    assert.equal('level' in characterUpdateInputFromDraft(edited), false);
  });

  it('validates obvious character draft mistakes before server submission', () => {
    const draft = createDefaultCharacterDraftForm();
    const errors = validateCharacterDraftForm({
      ...draft,
      abilities: {
        ...draft.abilities,
        str: '31',
      },
      hp: {
        current: '20',
        max: '10',
        temp: '0',
      },
      level: '0',
      name: ' ',
    });

    assert.match(errors.join('\n'), /Name is required/);
    assert.match(errors.join('\n'), /Level must be between 1 and 20/);
    assert.match(errors.join('\n'), /STR must be between 1 and 30/);
    assert.match(errors.join('\n'), /Current HP cannot exceed max HP/);
  });

  it('explains player-created characters that still need DM assignment', () => {
    assert.deepEqual(
      getPlayerNextStep({
        hasActiveScene: true,
        hasCharacter: true,
        hasEncounter: false,
        isCharacterAssigned: false,
        isCurrentTurn: false,
        isJoined: true,
        isPlaced: false,
        sessionId: 'SESSION-001',
      }),
      {
        detail:
          'Your character exists locally, but the session participant is not assigned yet. Ask the DM to assign it.',
        title: 'Needs DM assignment',
        tone: 'warning',
      },
    );
  });
});
