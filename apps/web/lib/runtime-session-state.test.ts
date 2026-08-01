import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ActiveSceneState,
  Encounter,
  Scene,
  SessionStreamEvent,
} from '@dnd/protocol';

import type { SessionSnapshot } from './runtime-cockpit-helpers';
import {
  createRuntimeSessionState,
  runtimeSessionReducer,
  type RuntimeIdentity,
  type RuntimeSessionState,
} from './runtime-session-state';

const identity: RuntimeIdentity = {
  sessionId: 'ABC123',
  mode: 'player',
  participantId: 'player-001',
};

function createScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene_1',
    sessionId: 'ABC123',
    name: 'Sunken Chapel',
    grid: { width: 10, height: 10, cellSizeFeet: 5 },
    terrain: null,
    entities: [],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function createSnapshot(revision: number): SessionSnapshot {
  return {
    session: {
      id: 'ABC123',
      status: 'lobby',
      dmParticipantId: 'dm-001',
      playerParticipantIds: ['player-001'],
      rulesProfileId: 'dnd5e-2024-core',
      activeSceneId: 'scene_1',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
      revision,
    },
    participants: [],
  };
}

function createEncounter(updatedAt: string): Encounter {
  return {
    id: 'encounter_1',
    sessionId: 'ABC123',
    sceneId: 'scene_1',
    status: 'active',
    participants: [
      {
        kind: 'character',
        characterId: 'character_1',
        participantId: 'player-001',
        initiative: 12,
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
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt,
  };
}

function createCombatEvent(
  overrides: Partial<
    Extract<SessionStreamEvent, { type: 'combat_event' }>
  > = {},
): SessionStreamEvent {
  return {
    type: 'combat_event',
    reason: 'attack_resolved',
    sessionId: 'ABC123',
    encounterId: 'encounter_1',
    attackerParticipantId: 'player-001',
    targetParticipantId: 'dm-001',
    roll: { d20: 14, modifier: 5, total: 19 },
    targetArmorClass: 13,
    hit: true,
    damage: 4,
    ...overrides,
  };
}

function seeded(): RuntimeSessionState {
  let state = createRuntimeSessionState(identity);

  state = runtimeSessionReducer(state, {
    type: 'credential_present',
    hasCredential: true,
  });
  state = runtimeSessionReducer(state, {
    type: 'session_snapshot_received',
    snapshot: createSnapshot(4),
  });
  state = runtimeSessionReducer(state, {
    type: 'scene_received',
    scene: createScene(),
  });

  return state;
}

test('the initial state is empty and holds no credential', () => {
  const state = createRuntimeSessionState(identity);

  assert.equal(state.session, null);
  assert.equal(state.scene, null);
  assert.equal(state.encounter, null);
  assert.equal(state.hasCredential, false);
  assert.equal(state.connection, 'idle');
});

test('switching session clears every projection and the credential', () => {
  const next = runtimeSessionReducer(seeded(), {
    type: 'identity_changed',
    identity: { sessionId: 'ZZZ999' },
  });

  assert.equal(next.identity.sessionId, 'ZZZ999');
  assert.equal(next.session, null);
  assert.equal(next.scene, null);
  // A credential belongs to the seat it was issued for. Carrying it across is
  // how a client ends up authenticated as somebody else.
  assert.equal(next.hasCredential, false);
});

test('switching role clears prior role state', () => {
  const next = runtimeSessionReducer(seeded(), {
    type: 'identity_changed',
    identity: { mode: 'dm' },
  });

  assert.equal(next.identity.mode, 'dm');
  assert.equal(next.scene, null);
  assert.equal(next.hasCredential, false);
});

test('switching participant clears prior seat state', () => {
  const next = runtimeSessionReducer(seeded(), {
    type: 'identity_changed',
    identity: { participantId: 'player-002' },
  });

  assert.equal(next.identity.participantId, 'player-002');
  assert.equal(next.session, null);
  assert.equal(next.hasCredential, false);
});

test('re-declaring the same identity changes nothing at all', () => {
  const state = seeded();
  const next = runtimeSessionReducer(state, {
    type: 'identity_changed',
    identity: { sessionId: 'ABC123' },
  });

  // Same object, not just equal: a needless clear would drop a live table's
  // map on every render that re-announced the identity it already had.
  assert.equal(next, state);
});

test('a stale session revision loses to the one already held', () => {
  const state = seeded();
  const next = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'session_state',
      reason: 'participant_joined',
      sessionId: 'ABC123',
      revision: 2,
      state: createSnapshot(2),
    },
  });

  assert.equal(next.session?.session.revision, 4);
});

test('a duplicate session revision is not treated as a new moment', () => {
  const state = seeded();
  const next = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'session_state',
      reason: 'initial_sync',
      sessionId: 'ABC123',
      revision: 4,
      state: createSnapshot(4),
    },
  });

  assert.equal(next, state);
});

test('a newer session revision is applied', () => {
  const next = runtimeSessionReducer(seeded(), {
    type: 'stream_event',
    event: {
      type: 'session_state',
      reason: 'participant_joined',
      sessionId: 'ABC123',
      revision: 5,
      state: createSnapshot(5),
    },
  });

  assert.equal(next.session?.session.revision, 5);
});

test('an event for another session is dropped rather than painted over this one', () => {
  const state = seeded();
  const next = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'scene_state',
      reason: 'entity_placed',
      sessionId: 'OTHER1',
      scene: createScene({
        id: 'scene_other',
        sessionId: 'OTHER1',
        updatedAt: '2026-08-01T12:00:00.000Z',
      }),
    },
  });

  assert.equal(next, state);
  assert.equal(next.scene?.id, 'scene_1');
});

test('a newer scene frame replaces the map live', () => {
  const next = runtimeSessionReducer(seeded(), {
    type: 'stream_event',
    event: {
      type: 'scene_state',
      reason: 'entity_placed',
      sessionId: 'ABC123',
      scene: createScene({
        updatedAt: '2026-08-01T11:00:00.000Z',
        entities: [
          {
            id: 'scene_entity_1',
            type: 'object',
            name: 'Altar',
            position: { x: 1, y: 1 },
            footprint: { width: 1, height: 1 },
            blocksMovement: true,
            blocksVision: false,
            hidden: false,
            combatant: null,
            meta: {},
          },
        ],
      }),
    },
  });

  assert.equal(next.scene?.entities.length, 1);
});

test('an out-of-order scene frame for the same map is dropped', () => {
  let state = seeded();

  state = runtimeSessionReducer(state, {
    type: 'scene_received',
    scene: createScene({ updatedAt: '2026-08-01T11:00:00.000Z' }),
  });

  const next = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'scene_state',
      reason: 'entity_placed',
      sessionId: 'ABC123',
      scene: createScene({
        updatedAt: '2026-08-01T10:30:00.000Z',
        entities: [
          {
            id: 'late',
            type: 'object',
            name: 'Late',
            position: { x: 0, y: 0 },
            footprint: { width: 1, height: 1 },
            blocksMovement: false,
            blocksVision: false,
            hidden: false,
            combatant: null,
            meta: {},
          },
        ],
      }),
    },
  });

  assert.equal(next, state);
});

test('a repeated scene frame is suppressed rather than reapplied', () => {
  const state = seeded();
  const next = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'scene_state',
      reason: 'initial_sync',
      sessionId: 'ABC123',
      scene: createScene(),
    },
  });

  assert.equal(next, state);
});

test('switching to a different map wins even when its timestamp is older', () => {
  let state = seeded();

  state = runtimeSessionReducer(state, {
    type: 'scene_received',
    scene: createScene({ updatedAt: '2026-08-01T12:00:00.000Z' }),
  });

  // A map the GM prepared last week is not "stale data" when they activate it.
  const next = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'scene_state',
      reason: 'scene_activated',
      sessionId: 'ABC123',
      scene: createScene({
        id: 'scene_2',
        name: 'Prepared Ambush',
        updatedAt: '2026-07-25T09:00:00.000Z',
      }),
    },
  });

  assert.equal(next.scene?.id, 'scene_2');
});

test('an older encounter frame loses and a newer one wins', () => {
  let state = seeded();

  state = runtimeSessionReducer(state, {
    type: 'encounter_received',
    encounter: createEncounter('2026-08-01T11:00:00.000Z'),
  });

  const stale = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'encounter_state',
      reason: 'turn_advanced',
      sessionId: 'ABC123',
      encounter: createEncounter('2026-08-01T10:30:00.000Z'),
    },
  });

  assert.equal(stale.encounter?.updatedAt, '2026-08-01T11:00:00.000Z');

  const fresh = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'encounter_state',
      reason: 'turn_advanced',
      sessionId: 'ABC123',
      encounter: createEncounter('2026-08-01T11:30:00.000Z'),
    },
  });

  assert.equal(fresh.encounter?.updatedAt, '2026-08-01T11:30:00.000Z');
});

test('a concealment republish at the same timestamp still lands', () => {
  let state = seeded();

  state = runtimeSessionReducer(state, {
    type: 'encounter_received',
    encounter: createEncounter('2026-08-01T11:00:00.000Z'),
  });

  // Concealment changes what a role may see of an unchanged encounter, so the
  // republished payload carries the same `updatedAt`. Dropping it on equality
  // would leave a player's turn rail naming a creature the GM just hid.
  const next = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'encounter_state',
      reason: 'dm_combatant_visibility_changed',
      sessionId: 'ABC123',
      encounter: {
        ...createEncounter('2026-08-01T11:00:00.000Z'),
        participants: [
          {
            kind: 'concealed_combatant',
            participantId: 'dm-001',
            initiative: 15,
          },
        ],
      },
    },
  });

  assert.equal(next.encounter?.participants[0]?.kind, 'concealed_combatant');
});

test('movement for a scene this client is not holding is ignored', () => {
  let state = seeded();
  const activeScene: ActiveSceneState = {
    sessionId: 'ABC123',
    activeSceneId: 'scene_1',
    placedCharacters: [],
  };

  state = runtimeSessionReducer(state, {
    type: 'active_scene_received',
    activeScene,
  });

  const next = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: {
      type: 'movement_state',
      reason: 'character_moved',
      sessionId: 'ABC123',
      activeSceneId: 'scene_elsewhere',
      participantId: 'player-002',
      characterId: 'character_2',
      position: { x: 3, y: 3 },
      footprint: { width: 1, height: 1 },
    },
  });

  assert.equal(next, state);
});

test('movement adds then updates a placement without duplicating it', () => {
  let state = runtimeSessionReducer(seeded(), {
    type: 'active_scene_received',
    activeScene: {
      sessionId: 'ABC123',
      activeSceneId: 'scene_1',
      placedCharacters: [],
    },
  });

  const move = (x: number, y: number): SessionStreamEvent => ({
    type: 'movement_state',
    reason: 'character_moved',
    sessionId: 'ABC123',
    activeSceneId: 'scene_1',
    participantId: 'player-001',
    characterId: 'character_1',
    position: { x, y },
    footprint: { width: 1, height: 1 },
  });

  state = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: move(2, 2),
  });
  assert.equal(state.activeScene?.placedCharacters.length, 1);

  state = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: move(4, 5),
  });
  assert.equal(state.activeScene?.placedCharacters.length, 1);
  assert.deepEqual(state.activeScene?.placedCharacters[0]?.position, {
    x: 4,
    y: 5,
  });

  // The same position arriving twice is not a move.
  const repeated = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: move(4, 5),
  });

  assert.equal(repeated, state);
});

test('a combat event with no target HP reconciles nothing', () => {
  const state = seeded();
  const next = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: createCombatEvent({
      attackerKind: 'combatant',
      targetKind: 'combatant',
      targetConcealed: true,
    }),
  });

  // Withheld HP is a projection decision, not missing data.
  assert.equal(next, state);
});

test('combat damage to a visible combatant updates that token only', () => {
  let state = createRuntimeSessionState(identity);

  state = runtimeSessionReducer(state, {
    type: 'scene_received',
    scene: createScene({
      entities: [
        {
          id: 'scene_entity_goblin',
          type: 'monster',
          name: 'Goblin',
          position: { x: 1, y: 1 },
          footprint: { width: 1, height: 1 },
          blocksMovement: true,
          blocksVision: false,
          hidden: false,
          combatant: {
            kind: 'monster',
            hp: { max: 12, current: 12, temp: 0 },
            armorClass: 13,
            speed: 30,
            abilities: {
              str: 8,
              dex: 14,
              con: 10,
              int: 10,
              wis: 8,
              cha: 8,
            },
          },
          meta: {},
        },
      ],
    }),
  });

  state = runtimeSessionReducer(state, {
    type: 'stream_event',
    event: createCombatEvent({
      attackerKind: 'character',
      targetKind: 'combatant',
      targetCombatantId: 'scene_entity_goblin',
      targetHp: { previous: 12, current: 5 },
      damage: 7,
    }),
  });

  assert.equal(state.scene?.entities[0]?.combatant?.hp.current, 5);
});

test('a failed command clears the pending label and surfaces one message', () => {
  let state = runtimeSessionReducer(seeded(), {
    type: 'command_started',
    label: 'attack',
  });

  assert.equal(state.pendingCommand, 'attack');

  state = runtimeSessionReducer(state, {
    type: 'command_failed',
    message: 'That creature is not on the map.',
  });

  assert.equal(state.pendingCommand, null);
  assert.equal(state.commandError, 'That creature is not on the map.');

  // Starting the next command clears the previous complaint rather than
  // stacking two failures the user has to read in order.
  state = runtimeSessionReducer(state, {
    type: 'command_started',
    label: 'move',
  });

  assert.equal(state.commandError, null);
});

test('an invalid credential is a distinct state from a retrying connection', () => {
  const retrying = runtimeSessionReducer(seeded(), {
    type: 'connection_changed',
    status: 'reconnecting',
  });
  const rejected = runtimeSessionReducer(seeded(), {
    type: 'connection_failed',
    status: 'credential_invalid',
    message: 'This seat needs to reconnect.',
  });

  assert.equal(retrying.connection, 'reconnecting');
  assert.equal(retrying.connectionError, null);
  // The browser retrying will never fix a rejected credential, so it must not
  // present as a connection that is still trying.
  assert.equal(rejected.connection, 'credential_invalid');
  assert.equal(rejected.connectionError, 'This seat needs to reconnect.');
});

test('recovery replaces its notes rather than appending to a stale list', () => {
  let state = runtimeSessionReducer(seeded(), {
    type: 'recovery_finished',
    notes: ['No active encounter.'],
  });

  state = runtimeSessionReducer(state, { type: 'recovery_started' });

  assert.equal(state.recovering, true);
  assert.deepEqual(state.recoveryNotes, []);

  state = runtimeSessionReducer(state, {
    type: 'recovery_finished',
    notes: ['No active scene.'],
  });

  assert.equal(state.recovering, false);
  assert.deepEqual(state.recoveryNotes, ['No active scene.']);
});

test('diagnostics visibility survives a table switch', () => {
  let state = runtimeSessionReducer(seeded(), {
    type: 'diagnostics_toggled',
    open: true,
  });

  state = runtimeSessionReducer(state, {
    type: 'identity_changed',
    identity: { sessionId: 'ZZZ999' },
  });

  // A preference about the tool, not a fact about the game.
  assert.equal(state.diagnosticsOpen, true);
  assert.equal(state.scene, null);
});

test('no participant token is ever stored in the state', () => {
  const state = runtimeSessionReducer(seeded(), {
    type: 'credential_present',
    hasCredential: true,
  });

  assert.equal(state.hasCredential, true);
  assert.equal(
    JSON.stringify(state).toLowerCase().includes('token'),
    false,
    'the state carries presence, never the credential itself',
  );
});
