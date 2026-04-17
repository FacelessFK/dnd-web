import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CreateSessionCommand,
  JoinSessionCommand,
  ReconnectSessionCommand,
} from '@dnd/protocol';

import { InMemorySessionStore, SessionStoreError } from './session-store.js';

function createSessionCommand(
  overrides: Partial<CreateSessionCommand> = {},
): CreateSessionCommand {
  return {
    commandId: 'cmd-create',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {},
    ...overrides,
  };
}

function joinSessionCommand(
  sessionId: string,
  overrides: Partial<JoinSessionCommand> = {},
): JoinSessionCommand {
  return {
    commandId: 'cmd-join',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId,
    },
    ...overrides,
  };
}

function reconnectSessionCommand(
  sessionId: string,
  overrides: Partial<ReconnectSessionCommand> = {},
): ReconnectSessionCommand {
  return {
    commandId: 'cmd-reconnect',
    type: 'reconnect_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId,
    },
    ...overrides,
  };
}

test('create session initializes authoritative state with a DM participant', () => {
  const store = new InMemorySessionStore();
  const result = store.createSession(createSessionCommand());

  assert.match(result.sessionId, /^[A-Z0-9]{6}$/);
  assert.equal(result.state.session.dmParticipantId, 'dm-001');
  assert.equal(result.state.session.playerParticipantIds.length, 0);
  assert.equal(result.state.session.revision, 1);
  assert.equal(result.state.participants.length, 1);
  assert.equal(result.state.participants[0]?.role, 'dm');
  assert.equal(result.state.participants[0]?.connectionStatus, 'disconnected');
});

test('join session adds a player to the authoritative participant list', () => {
  const store = new InMemorySessionStore();
  const created = store.createSession(createSessionCommand());
  const joined = store.joinSession(joinSessionCommand(created.sessionId));

  assert.equal(joined.state.participants.length, 2);
  assert.deepEqual(joined.state.session.playerParticipantIds, ['player-001']);
  assert.equal(joined.state.session.revision, 2);
});

test('joining a non-existent session fails safely', () => {
  const store = new InMemorySessionStore();

  assert.throws(
    () => {
      store.joinSession(joinSessionCommand('ABC123'));
    },
    (error: unknown) =>
      error instanceof SessionStoreError && error.code === 'session_not_found',
  );
});

test('duplicate joins are rejected instead of creating duplicate participants', () => {
  const store = new InMemorySessionStore();
  const created = store.createSession(createSessionCommand());

  store.joinSession(joinSessionCommand(created.sessionId));

  assert.throws(
    () => {
      store.joinSession(joinSessionCommand(created.sessionId));
    },
    (error: unknown) =>
      error instanceof SessionStoreError && error.code === 'duplicate_join',
  );
});

test('disconnect and reconnect keep one authoritative participant record', () => {
  const store = new InMemorySessionStore();
  const created = store.createSession(createSessionCommand());
  const joined = store.joinSession(joinSessionCommand(created.sessionId));
  const updates: string[] = [];

  store.connectParticipant(created.sessionId, 'player-001', {
    connectionId: 'connection-1',
    close: () => undefined,
    send: (update) => {
      updates.push(update.reason);
    },
  });

  let snapshot = store.getSessionSnapshot(created.sessionId);
  assert.equal(
    snapshot.participants.find((participant) => participant.id === 'player-001')
      ?.connectionStatus,
    'connected',
  );

  store.disconnectParticipant(created.sessionId, 'player-001', 'connection-1');

  snapshot = store.getSessionSnapshot(created.sessionId);
  assert.equal(
    snapshot.participants.find((participant) => participant.id === 'player-001')
      ?.connectionStatus,
    'disconnected',
  );

  const reconnected = store.reconnectSession(
    reconnectSessionCommand(created.sessionId),
  );

  assert.equal(
    reconnected.state.participants.length,
    joined.state.participants.length,
  );

  store.connectParticipant(created.sessionId, 'player-001', {
    connectionId: 'connection-2',
    close: () => undefined,
    send: (update) => {
      updates.push(update.reason);
    },
  });

  snapshot = store.getSessionSnapshot(created.sessionId);
  assert.equal(snapshot.participants.length, 2);
  assert.equal(
    snapshot.participants.find((participant) => participant.id === 'player-001')
      ?.connectionStatus,
    'connected',
  );
  assert.deepEqual(updates, ['participant_connected', 'participant_connected']);
});

test('returned state snapshots do not allow client-side mutation of server truth', () => {
  const store = new InMemorySessionStore();
  const created = store.createSession(createSessionCommand());

  created.state.session.playerParticipantIds.push('forged-player');
  created.state.participants[0]!.displayName = 'Mutated Locally';

  const snapshot = store.getSessionSnapshot(created.sessionId);

  assert.deepEqual(snapshot.session.playerParticipantIds, []);
  assert.equal(snapshot.participants[0]?.displayName, 'Dungeon Master');
});
