import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CommandEventOutboxDatabase,
  CommandEventOutboxRecordWrite,
  CommandEventOutboxRow,
  CommandEventOutboxBacklog,
} from '@dnd/db';
import type { SessionStreamEvent } from '@dnd/protocol';

import {
  CommandEventOutboxDispatcher,
  type CommandEventOutboxDispatcherLike,
} from './command-event-outbox-dispatcher.js';
import { createSessionServer } from './session-server.js';
import { InMemorySessionStore } from './session-store.js';

class InMemoryCommandEventOutboxDatabase implements CommandEventOutboxDatabase {
  private readonly rows = new Map<string, CommandEventOutboxRow>();
  private clock = 0;

  async insertCommandEventOutboxRecord(
    write: CommandEventOutboxRecordWrite,
  ): Promise<CommandEventOutboxRow | null> {
    if (this.rows.has(write.outboxId)) {
      return null;
    }

    for (const row of this.rows.values()) {
      if (
        row.idempotencyKey === write.idempotencyKey &&
        row.eventOrder === write.eventOrder
      ) {
        return null;
      }
    }

    const row: CommandEventOutboxRow = {
      createdAt: new Date(Date.UTC(2026, 4, 1, 0, 0, this.clock, 0)),
      eventOrder: write.eventOrder,
      eventType: write.eventType,
      idempotencyKey: write.idempotencyKey,
      outboxId: write.outboxId,
      payload: structuredClone(write.payload),
      publishedAt: null,
      sessionId: write.sessionId,
    };

    this.clock += 1;
    this.rows.set(write.outboxId, structuredClone(row));

    return structuredClone(row);
  }

  async getUnpublishedCommandEventOutboxBacklog(): Promise<CommandEventOutboxBacklog> {
    const rows = await this.listUnpublishedCommandEventOutboxRecords();
    const countsByEventType: Partial<
      Record<CommandEventOutboxRow['eventType'], number>
    > = {};
    let oldestCreatedAt: Date | null = null;

    for (const row of rows) {
      countsByEventType[row.eventType] =
        (countsByEventType[row.eventType] ?? 0) + 1;

      if (!oldestCreatedAt || row.createdAt < oldestCreatedAt) {
        oldestCreatedAt = row.createdAt;
      }
    }

    return { countsByEventType, oldestCreatedAt, totalCount: rows.length };
  }

  async listUnpublishedCommandEventOutboxRecords(
    limit?: number,
  ): Promise<CommandEventOutboxRow[]> {
    const rows = [...this.rows.values()]
      .filter((row) => row.publishedAt === null)
      .sort((left, right) => {
        const createdAtDiff =
          left.createdAt.getTime() - right.createdAt.getTime();

        if (createdAtDiff !== 0) {
          return createdAtDiff;
        }

        const idempotencyDiff = left.idempotencyKey.localeCompare(
          right.idempotencyKey,
        );

        if (idempotencyDiff !== 0) {
          return idempotencyDiff;
        }

        const eventOrderDiff = left.eventOrder - right.eventOrder;

        if (eventOrderDiff !== 0) {
          return eventOrderDiff;
        }

        return left.outboxId.localeCompare(right.outboxId);
      })
      .map((row) => structuredClone(row));

    return limit === undefined ? rows : rows.slice(0, limit);
  }

  async listUnpublishedCommandEventOutboxRecordsByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CommandEventOutboxRow[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.idempotencyKey === idempotencyKey && row.publishedAt === null,
      )
      .sort((left, right) => {
        const eventOrderDiff = left.eventOrder - right.eventOrder;

        if (eventOrderDiff !== 0) {
          return eventOrderDiff;
        }

        return left.outboxId.localeCompare(right.outboxId);
      })
      .map((row) => structuredClone(row));
  }

  async markCommandEventOutboxRecordPublished(
    outboxId: string,
  ): Promise<CommandEventOutboxRow | null> {
    const row = this.rows.get(outboxId);

    if (!row || row.publishedAt !== null) {
      return null;
    }

    const updated: CommandEventOutboxRow = {
      ...structuredClone(row),
      publishedAt: new Date(Date.UTC(2026, 4, 1, 1, 0, this.clock, 0)),
    };

    this.clock += 1;
    this.rows.set(outboxId, structuredClone(updated));

    return structuredClone(updated);
  }
}

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

function createDeferred<T>(): Deferred<T> {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createSessionStoreHarness() {
  const store = new InMemorySessionStore();
  const updates: SessionStreamEvent[] = [];
  const created = store.createSession({
    commandId: 'dispatcher-create-session',
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

  store.activateScene(created.sessionId, 'scene-001');
  store.connectParticipant(created.sessionId, created.participantId, {
    connectionId: 'dispatcher-stream',
    close: () => undefined,
    send: (update) => {
      updates.push(update);
    },
  });

  return {
    sessionId: created.sessionId,
    store,
    updates,
  };
}

function getNonSessionStateUpdateTypes(
  updates: SessionStreamEvent[],
): string[] {
  return updates
    .filter((update) => update.type !== 'session_state')
    .map((update) => update.type);
}

async function insertMovementOutboxRow(
  database: CommandEventOutboxDatabase,
  sessionId: string,
  idempotencyKey = 'movement:command-1',
): Promise<void> {
  await database.insertCommandEventOutboxRecord({
    eventOrder: 0,
    eventType: 'movement_state',
    idempotencyKey,
    outboxId: `${idempotencyKey}:0`,
    payload: {
      activeSceneId: 'scene-001',
      characterId: 'character-001',
      footprint: {
        height: 1,
        width: 1,
      },
      participantId: 'player-001',
      position: {
        x: 1,
        y: 1,
      },
      reason: 'character_moved',
      sessionId,
      type: 'movement_state',
    },
    sessionId,
  });
}

test('command event outbox dispatcher publishes covered rows in stable order and marks them published', async () => {
  const database = new InMemoryCommandEventOutboxDatabase();
  const { sessionId, store, updates } = createSessionStoreHarness();
  const dispatcher = new CommandEventOutboxDispatcher(database, store);

  await database.insertCommandEventOutboxRecord({
    eventOrder: 1,
    eventType: 'combat_event',
    idempotencyKey: 'encounter:command-1',
    outboxId: 'encounter:command-1:1',
    payload: {
      actorCharacterId: 'character-001',
      actorParticipantId: 'player-001',
      attackRoll: {
        roll: 20,
        total: 25,
      },
      damage: 1,
      hit: true,
      reason: 'attack_resolved',
      sessionId,
      targetCharacterId: 'character-002',
      targetHp: {
        current: 33,
        previous: 34,
      },
      targetParticipantId: 'player-002',
      type: 'combat_event',
    },
    sessionId,
  });
  await database.insertCommandEventOutboxRecord({
    eventOrder: 0,
    eventType: 'encounter_state',
    idempotencyKey: 'encounter:command-1',
    outboxId: 'encounter:command-1:0',
    payload: {
      encounter: {
        createdAt: '2026-05-01T00:00:00.000Z',
        id: 'encounter-001',
        participants: [
          {
            characterId: 'character-001',
            initiative: 20,
            participantId: 'player-001',
          },
        ],
        currentTurnIndex: 0,
        roundNumber: 1,
        sceneId: 'scene-001',
        sessionId,
        status: 'active',
        currentTurnUsage: {
          actionUsed: true,
          bonusActionUsed: false,
          movementUsed: 0,
          reactionUsed: false,
        },
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      reason: 'action_used',
      sessionId,
      type: 'encounter_state',
    },
    sessionId,
  });

  await dispatcher.drainUnpublishedByIdempotencyKey('encounter:command-1');

  assert.deepEqual(getNonSessionStateUpdateTypes(updates), [
    'encounter_state',
    'combat_event',
  ]);
  assert.equal(
    (await database.listUnpublishedCommandEventOutboxRecords()).length,
    0,
  );

  await dispatcher.drainUnpublishedByIdempotencyKey('encounter:command-1');

  assert.deepEqual(getNonSessionStateUpdateTypes(updates), [
    'encounter_state',
    'combat_event',
  ]);
});

test('createSessionServer startup does not auto-drain unpublished outbox rows', async () => {
  const database = new InMemoryCommandEventOutboxDatabase();
  const { sessionId, store, updates } = createSessionStoreHarness();
  const dispatcher = new CommandEventOutboxDispatcher(database, store);

  await insertMovementOutboxRow(database, sessionId);

  const dbBackedServer = createSessionServer(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    dispatcher,
  );

  await dbBackedServer.startup();

  assert.deepEqual(getNonSessionStateUpdateTypes(updates), []);
  assert.equal(
    (await database.listUnpublishedCommandEventOutboxRecords()).length,
    1,
  );

  let startupCount = 0;
  const startupOnlyDispatcher: CommandEventOutboxDispatcherLike = {
    drainAllUnpublished: async () => {
      startupCount += 1;
    },
    drainUnpublishedByIdempotencyKey: async () => undefined,
    getUnpublishedStatus: async () => ({
      configured: true,
      eventTypeCounts: {
        character_state: 0,
        combat_event: 0,
        encounter_state: 0,
        movement_state: 0,
        player_intent_state: 0,
        resolution_state: 0,
        session_state: 0,
      },
      oldestCreatedAt: null,
      unpublishedCount: 0,
    }),
  };
  const injectedServer = createSessionServer(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    startupOnlyDispatcher,
  );

  await injectedServer.startup();
  assert.equal(startupCount, 0);

  const inMemoryServer = createSessionServer();

  await inMemoryServer.startup();
  assert.equal(startupCount, 0);
});

test('concurrent drain requests do not double-publish the same row', async () => {
  const database = new InMemoryCommandEventOutboxDatabase();
  const { sessionId, store, updates } = createSessionStoreHarness();
  await insertMovementOutboxRow(database, sessionId);

  const markGate = createDeferred<void>();
  const firstMarkReached = createDeferred<void>();
  let listByIdempotencyKeyCalls = 0;
  const instrumentedDatabase: CommandEventOutboxDatabase = {
    insertCommandEventOutboxRecord: (write) =>
      database.insertCommandEventOutboxRecord(write),
    getUnpublishedCommandEventOutboxBacklog: () =>
      database.getUnpublishedCommandEventOutboxBacklog(),
    listUnpublishedCommandEventOutboxRecords: () =>
      database.listUnpublishedCommandEventOutboxRecords(),
    listUnpublishedCommandEventOutboxRecordsByIdempotencyKey: async (
      idempotencyKey,
    ) => {
      listByIdempotencyKeyCalls += 1;
      return database.listUnpublishedCommandEventOutboxRecordsByIdempotencyKey(
        idempotencyKey,
      );
    },
    markCommandEventOutboxRecordPublished: async (outboxId) => {
      firstMarkReached.resolve();
      await markGate.promise;
      return database.markCommandEventOutboxRecordPublished(outboxId);
    },
  };
  const dispatcher = new CommandEventOutboxDispatcher(
    instrumentedDatabase,
    store,
  );

  const firstDrain = dispatcher.drainAllUnpublished();
  await firstMarkReached.promise;

  const secondDrain =
    dispatcher.drainUnpublishedByIdempotencyKey('movement:command-1');

  await Promise.resolve();
  assert.equal(listByIdempotencyKeyCalls, 0);

  markGate.resolve();
  await Promise.all([firstDrain, secondDrain]);

  assert.deepEqual(getNonSessionStateUpdateTypes(updates), ['movement_state']);
  assert.equal(listByIdempotencyKeyCalls, 1);
  assert.equal(
    (await database.listUnpublishedCommandEventOutboxRecords()).length,
    0,
  );
});

test('createSessionServer startup leaves targeted outbox drains unchanged', async () => {
  const database = new InMemoryCommandEventOutboxDatabase();
  const { sessionId, store, updates } = createSessionStoreHarness();
  await insertMovementOutboxRow(database, sessionId, 'movement:startup-1');

  const callLog: string[] = [];
  const instrumentedDatabase: CommandEventOutboxDatabase = {
    insertCommandEventOutboxRecord: (write) =>
      database.insertCommandEventOutboxRecord(write),
    getUnpublishedCommandEventOutboxBacklog: async () => {
      callLog.push('backlog');
      return database.getUnpublishedCommandEventOutboxBacklog();
    },
    listUnpublishedCommandEventOutboxRecords: async (limit) => {
      callLog.push('list-all');
      return database.listUnpublishedCommandEventOutboxRecords(limit);
    },
    listUnpublishedCommandEventOutboxRecordsByIdempotencyKey: async (
      idempotencyKey,
    ) => {
      callLog.push(`list-by-key:${idempotencyKey}`);
      return database.listUnpublishedCommandEventOutboxRecordsByIdempotencyKey(
        idempotencyKey,
      );
    },
    markCommandEventOutboxRecordPublished: async (outboxId) => {
      callLog.push(`mark:${outboxId}`);
      return database.markCommandEventOutboxRecordPublished(outboxId);
    },
  };
  const dispatcher = new CommandEventOutboxDispatcher(
    instrumentedDatabase,
    store,
  );
  const server = createSessionServer(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    dispatcher,
  );

  await server.startup();
  assert.deepEqual(callLog, []);

  await dispatcher.drainUnpublishedByIdempotencyKey('movement:startup-1');

  assert.deepEqual(callLog, [
    'list-by-key:movement:startup-1',
    'mark:movement:startup-1:0',
  ]);
  assert.deepEqual(getNonSessionStateUpdateTypes(updates), ['movement_state']);
});
