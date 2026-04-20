import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EncounterStoreError,
  InMemoryEncounterStore,
} from './encounter-store.js';

function createEncounter() {
  return {
    id: 'encounter_11111111-1111-4111-8111-111111111111',
    sessionId: 'ABC123',
    sceneId: 'scene_11111111-1111-4111-8111-111111111111',
    status: 'active' as const,
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
  };
}

test('encounter store returns clone-safe records', () => {
  const store = new InMemoryEncounterStore();
  const created = store.createEncounter(createEncounter());

  created.currentTurnUsage.movementUsed = 15;
  created.participants[0]!.initiative = 99;

  const stored = store.getEncounterBySession('ABC123');

  assert.equal(stored.currentTurnUsage.movementUsed, 0);
  assert.equal(stored.participants[0]?.initiative, 2);
});

test('encounter store rejects duplicate active encounters for a session', () => {
  const store = new InMemoryEncounterStore();

  store.createEncounter(createEncounter());

  assert.throws(
    () =>
      store.createEncounter({
        ...createEncounter(),
        id: 'encounter_22222222-2222-4222-8222-222222222222',
      }),
    (error) =>
      error instanceof EncounterStoreError &&
      error.code === 'encounter_already_active',
  );
});

test('encounter store rejects missing active encounters on read and save', () => {
  const store = new InMemoryEncounterStore();

  assert.throws(
    () => store.getEncounterBySession('ABC123'),
    (error) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );

  assert.throws(
    () => store.saveEncounter(createEncounter()),
    (error) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );
});
