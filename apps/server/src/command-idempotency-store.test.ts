import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CommandIdempotencyRecordDatabase,
  CompletedCommandIdempotencyRecordRow,
  CompletedCommandIdempotencyRecordWrite,
} from '@dnd/db';

import {
  CommandIdempotencyError,
  InMemoryCommandIdempotencyStore,
  type CommandIdempotencyLookup,
} from './command-idempotency-store.js';
import { DbBackedCommandIdempotencyStore } from './db-command-idempotency-store.js';

class InMemoryCommandIdempotencyRecordDatabase implements CommandIdempotencyRecordDatabase {
  private readonly rows = new Map<
    string,
    CompletedCommandIdempotencyRecordRow
  >();
  insertCount = 0;

  async getCompletedCommandIdempotencyRecord(
    idempotencyKey: string,
  ): Promise<CompletedCommandIdempotencyRecordRow | null> {
    const row = this.rows.get(idempotencyKey);

    return row ? this.clone(row) : null;
  }

  async insertCompletedCommandIdempotencyRecord(
    write: CompletedCommandIdempotencyRecordWrite,
  ): Promise<CompletedCommandIdempotencyRecordRow | null> {
    if (this.rows.has(write.idempotencyKey)) {
      return null;
    }

    const row: CompletedCommandIdempotencyRecordRow = {
      actorParticipantId: write.actorParticipantId,
      category: write.category,
      commandId: write.commandId,
      commandType: write.commandType,
      createdAt: new Date(Date.UTC(2026, 3, 23, 0, 0, this.insertCount, 0)),
      fingerprint: write.fingerprint,
      idempotencyKey: write.idempotencyKey,
      response: this.clone(write.response),
      sessionId: write.sessionId,
    };

    this.insertCount += 1;
    this.rows.set(write.idempotencyKey, this.clone(row));

    return this.clone(row);
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

function createLookup(
  overrides: Partial<CommandIdempotencyLookup['command']> = {},
): CommandIdempotencyLookup {
  return {
    category: 'character',
    command: {
      commandId: 'durable-command-1',
      type: 'create_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        ownerParticipantId: 'player-001',
        sessionId: 'session-001',
      },
      ...overrides,
    },
  };
}

test('db-backed idempotency store returns cached success across store instances', async () => {
  const database = new InMemoryCommandIdempotencyRecordDatabase();
  const firstStore = new DbBackedCommandIdempotencyStore(database);
  const lookup = createLookup();
  const response = {
    ok: true,
    data: {
      marker: 'created-once',
    },
  };

  await firstStore.cacheSuccess({
    ...lookup,
    response,
  });

  response.data.marker = 'locally-mutated';

  const restartedStore = new DbBackedCommandIdempotencyStore(database);
  const cached =
    await restartedStore.getCachedSuccess<typeof response>(createLookup());

  assert.deepEqual(cached, {
    ok: true,
    data: {
      marker: 'created-once',
    },
  });
  assert.equal(database.insertCount, 1);
});

test('db-backed idempotency store rejects command fingerprint conflicts', async () => {
  const database = new InMemoryCommandIdempotencyRecordDatabase();
  const store = new DbBackedCommandIdempotencyStore(database);
  const lookup = createLookup();

  await store.cacheSuccess({
    ...lookup,
    response: {
      ok: true,
      data: {
        marker: 'created-once',
      },
    },
  });

  await assert.rejects(
    async () => {
      await store.getCachedSuccess(
        createLookup({
          payload: {
            ownerParticipantId: 'player-002',
            sessionId: 'session-001',
          },
        }),
      );
    },
    (error: unknown) =>
      error instanceof CommandIdempotencyError &&
      error.code === 'command_id_conflict',
  );
});

test('command fingerprint distinguishes attack target selector kind and id', async () => {
  const store = new InMemoryCommandIdempotencyStore();
  const participantTargetLookup: CommandIdempotencyLookup = {
    category: 'encounter',
    command: {
      commandId: 'attack-target-selector-1',
      type: 'attack',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId: 'session-001',
        targetParticipantId: 'player-002',
      },
    },
  };

  await store.cacheSuccess({
    ...participantTargetLookup,
    response: {
      ok: true,
      data: {
        marker: 'participant-target',
      },
    },
  });

  await assert.rejects(
    async () => {
      await store.getCachedSuccess({
        category: 'encounter',
        command: {
          commandId: 'attack-target-selector-1',
          type: 'attack',
          actor: {
            participantId: 'player-001',
          },
          payload: {
            sessionId: 'session-001',
            targetCombatantId:
              'scene_entity_11111111-1111-4111-8111-111111111111',
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof CommandIdempotencyError &&
      error.code === 'command_id_conflict',
  );

  await assert.rejects(
    async () => {
      await store.getCachedSuccess({
        category: 'encounter',
        command: {
          commandId: 'attack-target-selector-1',
          type: 'attack',
          actor: {
            participantId: 'player-001',
          },
          payload: {
            sessionId: 'session-001',
            targetParticipantId: 'player-003',
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof CommandIdempotencyError &&
      error.code === 'command_id_conflict',
  );
});

test('db-backed idempotency store keeps out-of-scope commands process-local', async () => {
  const database = new InMemoryCommandIdempotencyRecordDatabase();
  const firstStore = new DbBackedCommandIdempotencyStore(database, {
    fallback: new InMemoryCommandIdempotencyStore(),
  });
  const lookup: CommandIdempotencyLookup = {
    category: 'encounter',
    command: {
      commandId: 'unsupported-encounter-command-1',
      type: 'attack',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId: 'session-001',
        targetParticipantId: 'player-002',
      },
    },
  };

  await firstStore.cacheSuccess({
    ...lookup,
    response: {
      ok: true,
      data: {
        marker: 'process-local-only',
      },
    },
  });

  assert.deepEqual(await firstStore.getCachedSuccess(lookup), {
    ok: true,
    data: {
      marker: 'process-local-only',
    },
  });
  assert.equal(database.insertCount, 0);

  const restartedStore = new DbBackedCommandIdempotencyStore(database);

  assert.equal(await restartedStore.getCachedSuccess(lookup), null);
});
