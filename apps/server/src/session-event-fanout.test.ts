/**
 * Direct tests for the shared role-aware fan-out.
 *
 * Both session stores delegate here, so this is the single place the
 * "who may see which payload" decision is made - including for the DB-backed
 * store, whose delivery path the in-memory runtime tests never touch.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CombatEvent,
  EncounterStateUpdate,
  SessionStreamEvent,
} from '@dnd/protocol';
import type { ParticipantId, SessionSnapshot } from '@dnd/shared';

import {
  publishCombatEventToRoom,
  publishEncounterStateUpdateToRoom,
  type SessionEventFanoutRoom,
} from './session-event-fanout.js';

const HIDDEN_ID = 'entity_hidden';

function createSnapshot(): SessionSnapshot {
  return {
    session: {
      id: 'SESS01',
      status: 'active',
      dmParticipantId: 'dm-001',
      playerParticipantIds: ['player-001'],
      rulesProfileId: 'dnd5e-2024-core',
      activeSceneId: 'scene_1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 1,
    },
    participants: [
      { id: 'dm-001', role: 'dm' },
      { id: 'player-001', role: 'player' },
    ],
  } as unknown as SessionSnapshot;
}

/** Collects what each subscriber received, keyed by participant. */
function createRoom(participantIds: ParticipantId[]) {
  const received = new Map<ParticipantId, SessionStreamEvent[]>();
  const subscribers: [
    ParticipantId,
    { send: (u: SessionStreamEvent) => void },
  ][] = participantIds.map((participantId) => {
    received.set(participantId, []);

    return [
      participantId,
      {
        send: (update: SessionStreamEvent) => {
          received.get(participantId)?.push(update);
        },
      },
    ];
  });

  const room: SessionEventFanoutRoom = {
    snapshot: createSnapshot(),
    subscribers,
  };

  return { received, room };
}

function createEncounterUpdate(): EncounterStateUpdate {
  return {
    type: 'encounter_state',
    reason: 'encounter_started',
    sessionId: 'SESS01',
    encounter: {
      id: 'encounter_1',
      sessionId: 'SESS01',
      sceneId: 'scene_1',
      status: 'active',
      participants: [
        { characterId: 'char_1', participantId: 'player-001', initiative: 18 },
        {
          kind: 'combatant',
          combatantId: HIDDEN_ID,
          participantId: 'dm-001',
          initiative: 14,
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
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function createCombatEvent(): CombatEvent {
  return {
    type: 'combat_event',
    reason: 'attack_resolved',
    sessionId: 'SESS01',
    encounterId: 'encounter_1',
    attackerKind: 'combatant',
    attackerCombatantId: HIDDEN_ID,
    attackerParticipantId: 'dm-001',
    targetKind: 'character',
    targetCharacterId: 'char_1',
    targetParticipantId: 'player-001',
    roll: { d20: 14, modifier: 4, total: 18 },
    targetArmorClass: 13,
    hit: true,
    damage: 6,
    targetHp: { previous: 26, current: 20 },
  };
}

test('with nothing concealed every subscriber receives the same payload', () => {
  const { received, room } = createRoom(['dm-001', 'player-001']);
  const update = createEncounterUpdate();

  publishEncounterStateUpdateToRoom(room, update);

  assert.deepEqual(received.get('dm-001'), received.get('player-001'));
  assert.ok(JSON.stringify(received.get('player-001')).includes(HIDDEN_ID));
});

test('encounter state is projected per subscriber role', () => {
  const { received, room } = createRoom(['dm-001', 'player-001']);

  publishEncounterStateUpdateToRoom(
    room,
    createEncounterUpdate(),
    new Set([HIDDEN_ID]),
  );

  // Both still receive an event; only the contents differ.
  assert.equal(received.get('dm-001')?.length, 1);
  assert.equal(received.get('player-001')?.length, 1);
  assert.ok(JSON.stringify(received.get('dm-001')).includes(HIDDEN_ID));
  assert.ok(!JSON.stringify(received.get('player-001')).includes(HIDDEN_ID));
});

test('combat events are projected per subscriber role', () => {
  const { received, room } = createRoom(['dm-001', 'player-001']);

  publishCombatEventToRoom(room, createCombatEvent(), new Set([HIDDEN_ID]));

  assert.ok(JSON.stringify(received.get('dm-001')).includes(HIDDEN_ID));
  assert.ok(!JSON.stringify(received.get('player-001')).includes(HIDDEN_ID));
});

// The fail-closed rule. A subscriber whose participant is not in the snapshot
// must be treated as a player, never handed the omniscient payload.
test('an unresolvable subscriber is treated as a player, not a DM', () => {
  const { received, room } = createRoom(['ghost-999']);

  publishEncounterStateUpdateToRoom(
    room,
    createEncounterUpdate(),
    new Set([HIDDEN_ID]),
  );

  assert.equal(received.get('ghost-999')?.length, 1);
  assert.ok(!JSON.stringify(received.get('ghost-999')).includes(HIDDEN_ID));
});

test('each subscriber receives its own copy, not a shared reference', () => {
  const { received, room } = createRoom(['player-001', 'player-002']);

  publishEncounterStateUpdateToRoom(
    room,
    createEncounterUpdate(),
    new Set([HIDDEN_ID]),
  );

  const first = received.get('player-001')?.[0];
  const second = received.get('player-002')?.[0];

  assert.ok(first);
  assert.ok(second);
  // Same contents, distinct objects: one subscriber mutating its payload must
  // not corrupt what another already holds.
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
});

test('the source event is never mutated by projection', () => {
  const { room } = createRoom(['dm-001', 'player-001']);
  const update = createEncounterUpdate();

  publishEncounterStateUpdateToRoom(room, update, new Set([HIDDEN_ID]));

  assert.deepEqual(update.encounter.participants[1], {
    kind: 'combatant',
    combatantId: HIDDEN_ID,
    participantId: 'dm-001',
    initiative: 14,
  });
});
