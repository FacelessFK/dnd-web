import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ActiveEncounterRecordDatabase,
  ActiveEncounterRecordDelete,
  ActiveEncounterRecordRow,
  ActiveEncounterRecordWrite,
} from '@dnd/db';

import { DbBackedEncounterStore } from './db-encounter-store.js';
import { EncounterStoreError } from './encounter-store.js';

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
      {
        characterId: 'char_22222222-2222-4222-8222-222222222222',
        participantId: 'player-002',
        initiative: 1,
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
  };
}

class InMemoryActiveEncounterRecordDatabase implements ActiveEncounterRecordDatabase {
  private readonly rows = new Map<string, ActiveEncounterRecordRow>();
  private clock = 0;

  async deleteActiveEncounterRecord(
    params: ActiveEncounterRecordDelete,
  ): Promise<ActiveEncounterRecordRow | null> {
    const existing = this.rows.get(params.sessionId);

    if (!existing || existing.encounterId !== params.encounterId) {
      return null;
    }

    this.rows.delete(params.sessionId);

    return this.clone(existing);
  }

  async getActiveEncounterRecordBySession(
    sessionId: string,
  ): Promise<ActiveEncounterRecordRow | null> {
    const row = this.rows.get(sessionId);

    return row ? this.clone(row) : null;
  }

  async insertActiveEncounterRecord(
    write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null> {
    if (this.rows.has(write.sessionId)) {
      return null;
    }

    const now = this.nextTimestamp();
    const row: ActiveEncounterRecordRow = {
      encounterId: write.encounterId,
      sessionId: write.sessionId,
      sceneId: write.sceneId,
      record: this.clone(write.record),
      createdAt: now,
      updatedAt: now,
    };

    this.rows.set(write.sessionId, this.clone(row));

    return this.clone(row);
  }

  async listActiveEncounterRecords(): Promise<ActiveEncounterRecordRow[]> {
    return [...this.rows.values()].map((row) => this.clone(row));
  }

  async updateActiveEncounterRecord(
    write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null> {
    const existing = this.rows.get(write.sessionId);

    if (!existing) {
      return null;
    }

    const row: ActiveEncounterRecordRow = {
      encounterId: write.encounterId,
      sessionId: write.sessionId,
      sceneId: write.sceneId,
      record: this.clone(write.record),
      createdAt: existing.createdAt,
      updatedAt: this.nextTimestamp(),
    };

    this.rows.set(write.sessionId, this.clone(row));

    return this.clone(row);
  }

  private nextTimestamp(): Date {
    const timestamp = new Date(Date.UTC(2026, 3, 23, 0, 40, this.clock, 0));

    this.clock += 1;

    return timestamp;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

test('db-backed encounter store persists active encounters across rehydration with clone-safe semantics', async () => {
  const database = new InMemoryActiveEncounterRecordDatabase();
  const store = await DbBackedEncounterStore.fromDatabase(database);

  const created = await store.createEncounter(createEncounter());

  created.currentTurnUsage.movementUsed = 15;
  created.participants[0]!.initiative = 99;

  const rehydratedStore = await DbBackedEncounterStore.fromDatabase(database);
  const rereadActiveEncounter = rehydratedStore.getEncounterBySession('ABC123');

  assert.equal(rereadActiveEncounter.currentTurnUsage.movementUsed, 0);
  assert.equal(rereadActiveEncounter.participants[0]?.initiative, 2);

  const updated = await rehydratedStore.saveEncounter({
    ...rereadActiveEncounter,
    currentTurnIndex: 1,
    roundNumber: 2,
    currentTurnUsage: {
      actionUsed: true,
      bonusActionUsed: false,
      reactionUsed: true,
      movementUsed: 10,
    },
    updatedAt: '2026-01-01T00:05:00.000Z',
  });

  updated.currentTurnUsage.movementUsed = 30;

  const finalStore = await DbBackedEncounterStore.fromDatabase(database);
  const finalEncounter = finalStore.getEncounterBySession('ABC123');

  assert.equal(finalEncounter.currentTurnIndex, 1);
  assert.equal(finalEncounter.roundNumber, 2);
  assert.equal(finalEncounter.currentTurnUsage.actionUsed, true);
  assert.equal(finalEncounter.currentTurnUsage.reactionUsed, true);
  assert.equal(finalEncounter.currentTurnUsage.movementUsed, 10);
});

test('db-backed encounter store enforces a single active encounter per session and clears ended encounters from future reads', async () => {
  const store = await DbBackedEncounterStore.fromDatabase(
    new InMemoryActiveEncounterRecordDatabase(),
  );

  const activeEncounter = await store.createEncounter(createEncounter());

  await assert.rejects(
    () =>
      store.createEncounter({
        ...createEncounter(),
        id: 'encounter_22222222-2222-4222-8222-222222222222',
      }),
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'encounter_already_active',
  );

  const endedEncounter = await store.endEncounter({
    ...activeEncounter,
    status: 'ended',
    updatedAt: '2026-01-01T00:10:00.000Z',
  });

  assert.equal(endedEncounter.status, 'ended');
  assert.equal(store.findEncounterBySession('ABC123'), null);
  assert.throws(
    () => store.getEncounterBySession('ABC123'),
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );
});

test('db-backed encounter store fails safely for missing encounters', async () => {
  const store = await DbBackedEncounterStore.fromDatabase(
    new InMemoryActiveEncounterRecordDatabase(),
  );

  assert.throws(
    () => store.getEncounterBySession('ABC123'),
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );

  await assert.rejects(
    () => store.saveEncounter(createEncounter()),
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );

  await assert.rejects(
    () => store.endEncounter(createEncounter()),
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );
});
