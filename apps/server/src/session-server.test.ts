import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeSceneStateCommandSuccessSchema,
  characterCommandSchema,
  clientCommandSchema,
  encounterCommandSchema,
  encounterCommandSuccessSchema,
  movementCommandSchema,
  sceneCommandSchema,
  sessionStreamEventSchema,
  type SessionStreamEvent,
} from '@dnd/protocol';

import { InMemorySessionStore } from './session-store.js';

test('invalid session IDs are rejected by command validation', () => {
  const result = clientCommandSchema.safeParse({
    commandId: 'invalid-join',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId: 'bad-id',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'sessionId']);
});

test('invalid rules profile IDs are rejected during session command validation', () => {
  const result = clientCommandSchema.safeParse({
    commandId: 'invalid-create',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'INVALID PROFILE',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'rulesProfileId']);
});

test('invalid ability score shapes are rejected for character creation', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'create-character-invalid-abilities',
    type: 'create_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 1,
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 0,
          dex: 14,
          con: 12,
          int: 16,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'character',
    'abilities',
    'str',
  ]);
});

test('invalid level ranges are rejected for character creation', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'create-character-invalid-level',
    type: 'create_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 21,
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 8,
          dex: 14,
          con: 12,
          int: 16,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'character',
    'level',
  ]);
});

test('invalid character IDs are rejected for character retrieval', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'get-character-invalid-id',
    type: 'get_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      characterId: 'character-1',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'characterId']);
});

test('invalid scene IDs are rejected for scene retrieval', () => {
  const result = sceneCommandSchema.safeParse({
    commandId: 'get-scene-invalid-id',
    type: 'get_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      sceneId: 'scene-one',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'sceneId']);
});

test('invalid grid sizes are rejected for scene creation', () => {
  const result = sceneCommandSchema.safeParse({
    commandId: 'create-scene-invalid-grid',
    type: 'create_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      scene: {
        name: 'Broken Grid',
        grid: {
          width: 0,
          height: 8,
        },
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'scene',
    'grid',
    'width',
  ]);
});

test('invalid update payloads are rejected for character updates', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'update-character-invalid',
    type: 'update_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      characterId: 'char_11111111-1111-4111-8111-111111111111',
      character: {
        name: '',
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 8,
          dex: 14,
          con: 12,
          int: 16,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'character',
    'name',
  ]);
});

test('invalid movement target positions are rejected for movement commands', () => {
  const result = movementCommandSchema.safeParse({
    commandId: 'move-character-invalid-target',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      participantId: 'player-001',
      position: {
        x: -1,
        y: 0,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'position', 'x']);
});

test('active-scene state read commands are accepted by movement command validation', () => {
  const result = movementCommandSchema.safeParse({
    commandId: 'get-active-scene-state-1',
    type: 'get_active_scene_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });

  assert.equal(result.success, true);
});

test('encounter commands are accepted for narrow start/read/advance validation', () => {
  const startResult = encounterCommandSchema.safeParse({
    commandId: 'start-encounter-1',
    type: 'start_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const readResult = encounterCommandSchema.safeParse({
    commandId: 'get-encounter-state-1',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const advanceResult = encounterCommandSchema.safeParse({
    commandId: 'advance-turn-1',
    type: 'advance_turn',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const useActionResult = encounterCommandSchema.safeParse({
    commandId: 'use-action-1',
    type: 'use_action',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const useBonusActionResult = encounterCommandSchema.safeParse({
    commandId: 'use-bonus-action-1',
    type: 'use_bonus_action',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const recordMovementUsageResult = encounterCommandSchema.safeParse({
    commandId: 'record-movement-usage-1',
    type: 'record_movement_usage',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      amountFeet: 10,
    },
  });
  const attackResult = encounterCommandSchema.safeParse({
    commandId: 'attack-1',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      targetParticipantId: 'player-002',
    },
  });

  assert.equal(startResult.success, true);
  assert.equal(readResult.success, true);
  assert.equal(advanceResult.success, true);
  assert.equal(useActionResult.success, true);
  assert.equal(useBonusActionResult.success, true);
  assert.equal(recordMovementUsageResult.success, true);
  assert.equal(attackResult.success, true);
});

test('invalid encounter movement-usage payloads are rejected during command validation', () => {
  const result = encounterCommandSchema.safeParse({
    commandId: 'record-movement-usage-invalid',
    type: 'record_movement_usage',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      amountFeet: 0,
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'amountFeet']);
});

test('encounter success payloads are validated as authoritative turn-order responses', () => {
  const result = encounterCommandSuccessSchema.safeParse({
    ok: true,
    data: {
      encounter: {
        id: 'encounter_11111111-1111-4111-8111-111111111111',
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        status: 'active',
        participants: [
          {
            characterId: 'char_11111111-1111-4111-8111-111111111111',
            participantId: 'player-001',
            initiative: 2,
          },
        ],
        currentTurnIndex: 0,
        roundNumber: 1,
        currentTurnUsage: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          movementUsed: 0,
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    },
  });

  assert.equal(result.success, true);
});

test('connected subscribers receive synchronized session state updates', () => {
  const store = new InMemorySessionStore();
  const created = store.createSession({
    commandId: 'create-1',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'dnd5e-2024-core',
    },
  });
  const receivedUpdates: SessionStreamEvent[] = [];

  store.connectParticipant(created.sessionId, 'dm-001', {
    connectionId: 'dm-connection-1',
    close: () => undefined,
    send: (update) => {
      receivedUpdates.push(update);
    },
  });

  store.joinSession({
    commandId: 'join-1',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId: created.sessionId,
    },
  });

  const latestUpdate = receivedUpdates.at(-1);

  assert.ok(latestUpdate);
  assert.equal(latestUpdate?.type, 'session_state');

  if (!latestUpdate || latestUpdate.type !== 'session_state') {
    return;
  }

  assert.equal(latestUpdate.reason, 'participant_joined');
  assert.equal(latestUpdate.state.participants.length, 2);
  assert.equal(
    latestUpdate.state.participants.find(
      (participant) => participant.id === 'player-001',
    )?.connectionStatus,
    'disconnected',
  );
  assert.equal(latestUpdate.revision, 3);
});

test('movement session-stream updates are validated as a narrow realtime payload', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'movement_state',
    reason: 'character_moved',
    sessionId: 'ABC123',
    activeSceneId: 'scene_11111111-1111-4111-8111-111111111111',
    participantId: 'player-001',
    characterId: 'char_11111111-1111-4111-8111-111111111111',
    position: {
      x: 2,
      y: 3,
    },
    footprint: {
      width: 1,
      height: 1,
    },
  });

  assert.equal(result.success, true);
});

test('encounter session-stream updates are validated as authoritative realtime payloads', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'encounter_state',
    reason: 'turn_advanced',
    sessionId: 'ABC123',
    encounter: {
      id: 'encounter_11111111-1111-4111-8111-111111111111',
      sessionId: 'ABC123',
      sceneId: 'scene_11111111-1111-4111-8111-111111111111',
      status: 'active',
      participants: [
        {
          characterId: 'char_11111111-1111-4111-8111-111111111111',
          participantId: 'player-001',
          initiative: 2,
        },
      ],
      currentTurnIndex: 0,
      roundNumber: 2,
      currentTurnUsage: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: 0,
      },
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:01:00.000Z',
    },
  });

  assert.equal(result.success, true);
});

test('combat session-stream updates are validated as authoritative attack payloads', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'combat_event',
    reason: 'attack_resolved',
    sessionId: 'ABC123',
    encounterId: 'encounter_11111111-1111-4111-8111-111111111111',
    attackerParticipantId: 'player-001',
    attackerCharacterId: 'char_11111111-1111-4111-8111-111111111111',
    targetParticipantId: 'player-002',
    targetCharacterId: 'char_22222222-2222-4222-8222-222222222222',
    roll: {
      d20: 14,
      modifier: 2,
      total: 16,
    },
    targetArmorClass: 16,
    hit: true,
    damage: 1,
    targetHp: {
      previous: 10,
      current: 9,
    },
  });

  assert.equal(result.success, true);
});

test('active-scene state success payloads are validated as a narrow read model', () => {
  const result = activeSceneStateCommandSuccessSchema.safeParse({
    ok: true,
    data: {
      sessionId: 'ABC123',
      activeSceneId: 'scene_11111111-1111-4111-8111-111111111111',
      placedCharacters: [
        {
          characterId: 'char_11111111-1111-4111-8111-111111111111',
          participantId: 'player-001',
          position: {
            x: 2,
            y: 3,
          },
          footprint: {
            width: 1,
            height: 1,
          },
        },
      ],
    },
  });

  assert.equal(result.success, true);
});
