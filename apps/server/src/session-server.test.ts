import assert from 'node:assert/strict';
import test from 'node:test';

import { clientCommandSchema, type SessionStateUpdate } from '@dnd/protocol';

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
    payload: {},
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
