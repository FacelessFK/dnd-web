import assert from 'node:assert/strict';
import test from 'node:test';

import {
  characterCommandSchema,
  clientCommandSchema,
  sceneCommandSchema,
  type SessionStateUpdate,
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
  const receivedUpdates: SessionStateUpdate[] = [];

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
  assert.equal(latestUpdate?.reason, 'participant_joined');
  assert.equal(latestUpdate?.state.participants.length, 2);
  assert.equal(
    latestUpdate?.state.participants.find(
      (participant) => participant.id === 'player-001',
    )?.connectionStatus,
    'disconnected',
  );
  assert.equal(latestUpdate?.revision, 3);
});
