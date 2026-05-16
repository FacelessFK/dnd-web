import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ActiveEncounterRecordDatabase,
  ActiveEncounterRecordDelete,
  ActiveEncounterRecordRow,
  ActiveEncounterRecordWrite,
  CharacterRecordDatabase,
  CharacterRecordRow,
  CharacterRecordWrite,
  CharacterLibraryEntryDatabase,
  CharacterLibraryEntryRow,
  CharacterLibraryEntryWrite,
  CommandIdempotencyClaimRecordDatabase,
  CommandIdempotencyClaimRecordRow,
  CommandIdempotencyClaimRecordWrite,
  CommandIdempotencyRecordDatabase,
  CommandEventOutboxDatabase,
  CommandEventOutboxRecordWrite,
  CommandEventOutboxRow,
  CompletedCommandIdempotencyRecordRow,
  CompletedCommandIdempotencyRecordWrite,
  DndDatabase,
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
  SceneRecordDatabase,
  SceneRecordRow,
  SceneRecordWrite,
  SessionSnapshotDatabase,
  SessionSnapshotRow,
  SessionSnapshotWrite,
} from '@dnd/db';

import { InMemoryCommandIdempotencyStore } from './command-idempotency-store.js';
import type { CommandEventOutboxDispatcherLike } from './command-event-outbox-dispatcher.js';
import { InMemoryCharacterStore } from './character-store.js';
import { DbBackedCommandIdempotencyStore } from './db-command-idempotency-store.js';
import { DbBackedCharacterRepository } from './db-character-repository.js';
import { DbBackedCharacterCommandTransactionBoundary } from './db-character-command-transaction.js';
import { DbBackedCombatCommandTransactionBoundary } from './db-combat-command-transaction.js';
import { DbBackedEncounterCommandTransactionBoundary } from './db-encounter-command-transaction.js';
import { DbBackedSceneCommandTransactionBoundary } from './db-scene-command-transaction.js';
import { DbBackedSessionCommandTransactionBoundary } from './db-session-command-transaction.js';
import { DbBackedEncounterStore } from './db-encounter-store.js';
import { DbBackedSceneStore } from './db-scene-store.js';
import { DbBackedSessionStore } from './db-session-store.js';
import {
  createBootstrappedSessionServer,
  readServerPersistenceMode,
  type ServerBootstrapDependencies,
} from './server-bootstrap.js';
import { InMemorySessionStore } from './session-store.js';

class EmptySessionSnapshotDatabase implements SessionSnapshotDatabase {
  async getSessionSnapshot(
    _sessionId: string,
  ): Promise<SessionSnapshotRow | null> {
    void _sessionId;
    return null;
  }

  async listSessionSnapshots(): Promise<SessionSnapshotRow[]> {
    return [];
  }

  async upsertSessionSnapshot(
    write: SessionSnapshotWrite,
  ): Promise<SessionSnapshotRow> {
    return {
      sessionId: write.sessionId,
      snapshot: structuredClone(write.snapshot),
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }
}

class EmptySceneRecordDatabase implements SceneRecordDatabase {
  async getSceneRecord(_sceneId: string): Promise<SceneRecordRow | null> {
    void _sceneId;
    return null;
  }

  async listSceneRecords(): Promise<SceneRecordRow[]> {
    return [];
  }

  async updateSceneRecord(
    _write: SceneRecordWrite,
  ): Promise<SceneRecordRow | null> {
    void _write;
    return null;
  }

  async upsertSceneRecord(write: SceneRecordWrite): Promise<SceneRecordRow> {
    return {
      sceneId: write.sceneId,
      sessionId: write.sessionId,
      record: structuredClone(write.record),
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }
}

class EmptyActiveEncounterRecordDatabase implements ActiveEncounterRecordDatabase {
  async deleteActiveEncounterRecord(
    _params: ActiveEncounterRecordDelete,
  ): Promise<ActiveEncounterRecordRow | null> {
    void _params;
    return null;
  }

  async getActiveEncounterRecordBySession(
    _sessionId: string,
  ): Promise<ActiveEncounterRecordRow | null> {
    void _sessionId;
    return null;
  }

  async insertActiveEncounterRecord(
    _write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null> {
    void _write;
    return null;
  }

  async listActiveEncounterRecords(): Promise<ActiveEncounterRecordRow[]> {
    return [];
  }

  async updateActiveEncounterRecord(
    _write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null> {
    void _write;
    return null;
  }
}

class EmptyCharacterRecordDatabase implements CharacterRecordDatabase {
  async getCharacterRecord(
    _characterId: string,
  ): Promise<CharacterRecordRow | null> {
    void _characterId;
    return null;
  }

  async updateCharacterRecord(
    _write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow | null> {
    void _write;
    return null;
  }

  async upsertCharacterRecord(
    write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow> {
    return {
      characterId: write.characterId,
      record: structuredClone(write.record),
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }
}

class EmptyCommandIdempotencyRecordDatabase implements CommandIdempotencyRecordDatabase {
  async getCompletedCommandIdempotencyRecord(
    _idempotencyKey: string,
  ): Promise<CompletedCommandIdempotencyRecordRow | null> {
    void _idempotencyKey;
    return null;
  }

  async insertCompletedCommandIdempotencyRecord(
    write: CompletedCommandIdempotencyRecordWrite,
  ): Promise<CompletedCommandIdempotencyRecordRow | null> {
    return {
      actorParticipantId: write.actorParticipantId,
      category: write.category,
      commandId: write.commandId,
      commandType: write.commandType,
      createdAt: new Date(0),
      fingerprint: write.fingerprint,
      idempotencyKey: write.idempotencyKey,
      response: structuredClone(write.response),
      sessionId: write.sessionId,
    };
  }
}

class EmptyCommandIdempotencyClaimRecordDatabase implements CommandIdempotencyClaimRecordDatabase {
  async getCommandIdempotencyClaimRecord(
    _idempotencyKey: string,
  ): Promise<CommandIdempotencyClaimRecordRow | null> {
    void _idempotencyKey;
    return null;
  }

  async insertCommandIdempotencyClaimRecord(
    write: CommandIdempotencyClaimRecordWrite,
  ): Promise<CommandIdempotencyClaimRecordRow | null> {
    return {
      actorParticipantId: write.actorParticipantId,
      category: write.category,
      commandId: write.commandId,
      commandType: write.commandType,
      createdAt: new Date(0),
      fingerprint: write.fingerprint,
      idempotencyKey: write.idempotencyKey,
      sessionId: write.sessionId,
    };
  }
}

class EmptyCommandEventOutboxDatabase implements CommandEventOutboxDatabase {
  async insertCommandEventOutboxRecord(
    write: CommandEventOutboxRecordWrite,
  ): Promise<CommandEventOutboxRow | null> {
    return {
      createdAt: new Date(0),
      eventOrder: write.eventOrder,
      eventType: write.eventType,
      idempotencyKey: write.idempotencyKey,
      outboxId: write.outboxId,
      payload: structuredClone(write.payload),
      publishedAt: null,
      sessionId: write.sessionId,
    };
  }

  async listUnpublishedCommandEventOutboxRecords(): Promise<
    CommandEventOutboxRow[]
  > {
    return [];
  }

  async listUnpublishedCommandEventOutboxRecordsByIdempotencyKey(
    _idempotencyKey: string,
  ): Promise<CommandEventOutboxRow[]> {
    void _idempotencyKey;
    return [];
  }

  async markCommandEventOutboxRecordPublished(
    _outboxId: string,
  ): Promise<CommandEventOutboxRow | null> {
    void _outboxId;
    return null;
  }
}

class EmptyCharacterLibraryEntryDatabase implements CharacterLibraryEntryDatabase {
  async getCharacterLibraryEntry(
    _params: Pick<CharacterLibraryEntryWrite, 'entryId' | 'ownerParticipantId'>,
  ): Promise<CharacterLibraryEntryRow | null> {
    void _params;
    return null;
  }

  async getCharacterLibraryEntryByUser(
    _params: Pick<CharacterLibraryEntryWrite, 'entryId' | 'ownerUserId'>,
  ): Promise<CharacterLibraryEntryRow | null> {
    void _params;
    return null;
  }

  async insertCharacterLibraryEntry(
    write: CharacterLibraryEntryWrite,
  ): Promise<CharacterLibraryEntryRow | null> {
    return {
      createdAt: new Date(0),
      entry: structuredClone(write.entry),
      entryId: write.entryId,
      ownerParticipantId: write.ownerParticipantId,
      ownerUserId: write.ownerUserId ?? null,
      updatedAt: new Date(0),
    };
  }

  async listCharacterLibraryEntries(
    _ownerParticipantId: string,
  ): Promise<CharacterLibraryEntryRow[]> {
    void _ownerParticipantId;
    return [];
  }

  async listCharacterLibraryEntriesByUser(
    _ownerUserId: string,
  ): Promise<CharacterLibraryEntryRow[]> {
    void _ownerUserId;
    return [];
  }

  async updateCharacterLibraryEntry(
    write: CharacterLibraryEntryWrite,
  ): Promise<CharacterLibraryEntryRow | null> {
    return {
      createdAt: new Date(0),
      entry: structuredClone(write.entry),
      entryId: write.entryId,
      ownerParticipantId: write.ownerParticipantId,
      ownerUserId: write.ownerUserId ?? null,
      updatedAt: new Date(0),
    };
  }

  async updateCharacterLibraryEntryByUser(
    write: CharacterLibraryEntryWrite & { ownerUserId: string },
  ): Promise<CharacterLibraryEntryRow | null> {
    return {
      createdAt: new Date(0),
      entry: structuredClone(write.entry),
      entryId: write.entryId,
      ownerParticipantId: write.ownerParticipantId,
      ownerUserId: write.ownerUserId,
      updatedAt: new Date(0),
    };
  }
}

class StubUnitOfWork implements DndDatabaseUnitOfWork {
  async transaction<T>(
    run: (context: DndDatabaseUnitOfWorkContext) => Promise<T>,
  ): Promise<T> {
    return run({
      characterLibrary: new EmptyCharacterLibraryEntryDatabase(),
      characters: new EmptyCharacterRecordDatabase(),
      commandIdempotencyClaims:
        new EmptyCommandIdempotencyClaimRecordDatabase(),
      commandIdempotency: new EmptyCommandIdempotencyRecordDatabase(),
      encounters: new EmptyActiveEncounterRecordDatabase(),
      outbox: new EmptyCommandEventOutboxDatabase(),
      scenes: new EmptySceneRecordDatabase(),
      sessions: new EmptySessionSnapshotDatabase(),
    });
  }
}

function createDbModeDependencies(params: {
  closeCount: { current: number };
  dispatcherStats?: {
    drainAllUnpublishedCalls: number;
  };
  sessionDatabase?: SessionSnapshotDatabase;
}): Partial<ServerBootstrapDependencies> {
  const sessionDatabase =
    params.sessionDatabase ?? new EmptySessionSnapshotDatabase();

  return {
    createActiveEncounterRecordDatabase: () =>
      new EmptyActiveEncounterRecordDatabase(),
    createCharacterLibraryEntryDatabase: () =>
      new EmptyCharacterLibraryEntryDatabase(),
    createCharacterRecordDatabase: () => new EmptyCharacterRecordDatabase(),
    createCommandIdempotencyRecordDatabase: () =>
      new EmptyCommandIdempotencyRecordDatabase(),
    createCommandEventOutboxDatabase: () =>
      new EmptyCommandEventOutboxDatabase(),
    createCommandEventOutboxDispatcher:
      (): CommandEventOutboxDispatcherLike => ({
        drainAllUnpublished: async () => {
          if (params.dispatcherStats) {
            params.dispatcherStats.drainAllUnpublishedCalls += 1;
          }
        },
        drainUnpublishedByIdempotencyKey: async () => undefined,
      }),
    createPersistenceConnection: () => ({
      db: {} as DndDatabase,
      close: async () => {
        params.closeCount.current += 1;
      },
    }),
    createSceneRecordDatabase: () => new EmptySceneRecordDatabase(),
    createSessionSnapshotDatabase: () => sessionDatabase,
    createUnitOfWork: () => new StubUnitOfWork(),
  };
}

test('readServerPersistenceMode defaults to in-memory and accepts the db opt-in', () => {
  assert.equal(readServerPersistenceMode({}), 'in-memory');
  assert.equal(
    readServerPersistenceMode({
      SERVER_PERSISTENCE_MODE: 'db',
    }),
    'db',
  );
  assert.throws(
    () =>
      readServerPersistenceMode({
        SERVER_PERSISTENCE_MODE: 'invalid',
      }),
    /Unsupported SERVER_PERSISTENCE_MODE "invalid"/,
  );
});

test('createBootstrappedSessionServer preserves the current in-memory default startup path', async () => {
  const bootstrap = await createBootstrappedSessionServer({
    env: {},
  });

  assert.equal(bootstrap.persistenceMode, 'in-memory');
  assert.ok(bootstrap.runtime.sessions instanceof InMemorySessionStore);
  assert.ok(bootstrap.runtime.characters instanceof InMemoryCharacterStore);
  assert.ok(bootstrap.idempotency instanceof InMemoryCommandIdempotencyStore);
  assert.equal(bootstrap.characterCommandTransaction, undefined);
  assert.equal(bootstrap.sceneCommandTransaction, undefined);
  assert.equal(bootstrap.sessionCommandTransaction, undefined);
  assert.equal(bootstrap.encounterCommandTransaction, undefined);
  assert.equal(bootstrap.combatCommandTransaction, undefined);
  assert.equal(bootstrap.commandEventOutboxDispatcher, undefined);

  await bootstrap.startup();
  await bootstrap.closePersistence();
});

test('createBootstrappedSessionServer requires DATABASE_URL when DB-backed startup is enabled', async () => {
  await assert.rejects(
    () =>
      createBootstrappedSessionServer({
        env: {
          SERVER_PERSISTENCE_MODE: 'db',
        },
      }),
    /DATABASE_URL is required when SERVER_PERSISTENCE_MODE=db/,
  );
});

test('createBootstrappedSessionServer wires the existing DB-backed runtime and transaction boundaries when DB mode is enabled', async () => {
  const closeCount = {
    current: 0,
  };
  const dispatcherStats = {
    drainAllUnpublishedCalls: 0,
  };
  const bootstrap = await createBootstrappedSessionServer({
    dependencies: createDbModeDependencies({
      closeCount,
      dispatcherStats,
    }),
    env: {
      DATABASE_URL: 'postgres://example.invalid/dnd_platform',
      SERVER_PERSISTENCE_MODE: 'db',
    },
  });

  assert.equal(bootstrap.persistenceMode, 'db');
  assert.ok(bootstrap.runtime.sessions instanceof DbBackedSessionStore);
  assert.ok(
    bootstrap.runtime.characters instanceof DbBackedCharacterRepository,
  );
  assert.ok(bootstrap.runtime.scenes instanceof DbBackedSceneStore);
  assert.ok(bootstrap.runtime.encounters instanceof DbBackedEncounterStore);
  assert.ok(bootstrap.idempotency instanceof DbBackedCommandIdempotencyStore);
  assert.ok(
    bootstrap.characterCommandTransaction instanceof
      DbBackedCharacterCommandTransactionBoundary,
  );
  assert.ok(
    bootstrap.sceneCommandTransaction instanceof
      DbBackedSceneCommandTransactionBoundary,
  );
  assert.ok(
    bootstrap.sessionCommandTransaction instanceof
      DbBackedSessionCommandTransactionBoundary,
  );
  assert.ok(
    bootstrap.encounterCommandTransaction instanceof
      DbBackedEncounterCommandTransactionBoundary,
  );
  assert.ok(
    bootstrap.combatCommandTransaction instanceof
      DbBackedCombatCommandTransactionBoundary,
  );
  assert.ok(bootstrap.commandEventOutboxDispatcher);

  assert.equal(closeCount.current, 0);
  await bootstrap.startup();
  assert.equal(dispatcherStats.drainAllUnpublishedCalls, 0);
  await bootstrap.closePersistence();
  await bootstrap.closePersistence();
  assert.equal(closeCount.current, 1);
});

test('createBootstrappedSessionServer closes persistence resources if DB-backed bootstrap fails during store hydration', async () => {
  const closeCount = {
    current: 0,
  };
  const failingSessionDatabase: SessionSnapshotDatabase = {
    async getSessionSnapshot(_sessionId) {
      void _sessionId;
      return null;
    },
    async listSessionSnapshots() {
      throw new Error('list failed');
    },
    async upsertSessionSnapshot(write) {
      return {
        sessionId: write.sessionId,
        snapshot: structuredClone(write.snapshot),
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
    },
  };

  await assert.rejects(
    () =>
      createBootstrappedSessionServer({
        dependencies: createDbModeDependencies({
          closeCount,
          sessionDatabase: failingSessionDatabase,
        }),
        env: {
          DATABASE_URL: 'postgres://example.invalid/dnd_platform',
          SERVER_PERSISTENCE_MODE: 'db',
        },
      }),
    /list failed/,
  );

  assert.equal(closeCount.current, 1);
});
