import {
  createNodePostgresDndDatabaseConnection,
  DrizzleAuthUserDatabase,
  DrizzleActiveEncounterRecordDatabase,
  DrizzleCharacterLibraryEntryDatabase,
  DrizzleCharacterRecordDatabase,
  DrizzleCommandIdempotencyRecordDatabase,
  DrizzleCommandEventOutboxDatabase,
  DrizzleDndDatabaseUnitOfWork,
  DrizzleSceneRecordDatabase,
  DrizzleSessionSnapshotDatabase,
  type AuthUserDatabase,
  type ActiveEncounterRecordDatabase,
  type CharacterLibraryEntryDatabase,
  type CharacterRecordDatabase,
  type CommandIdempotencyRecordDatabase,
  type CommandEventOutboxDatabase,
  type DndDatabase,
  type DndDatabaseUnitOfWork,
  type SceneRecordDatabase,
  type SessionSnapshotDatabase,
} from '@dnd/db';

import { AuthService } from './auth-store.js';
import { FileSystemCharacterPortraitStorage } from './character-portrait-storage.js';
import {
  CommandEventOutboxDispatcher,
  type CommandEventOutboxDispatcherLike,
} from './command-event-outbox-dispatcher.js';
import {
  CharacterLibraryService,
  DbBackedCharacterLibraryRepository,
} from './character-library-store.js';
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
import { InMemoryGameRuntime } from './game-runtime.js';
import { createSessionServer } from './session-server.js';
import type { RuntimeSessionStore } from './session-store.js';

export type ServerPersistenceMode = 'db' | 'in-memory';

type PersistenceConnection = {
  close: () => Promise<void>;
  db: DndDatabase;
};

export type SessionServerBootstrap = ReturnType<typeof createSessionServer> & {
  closePersistence: () => Promise<void>;
  persistenceMode: ServerPersistenceMode;
};

export type ServerBootstrapDependencies = {
  createAuthUserDatabase: (db: DndDatabase) => AuthUserDatabase;
  createActiveEncounterRecordDatabase: (
    db: DndDatabase,
  ) => ActiveEncounterRecordDatabase;
  createCharacterLibraryEntryDatabase: (
    db: DndDatabase,
  ) => CharacterLibraryEntryDatabase;
  createCharacterRecordDatabase: (db: DndDatabase) => CharacterRecordDatabase;
  createCommandIdempotencyRecordDatabase: (
    db: DndDatabase,
  ) => CommandIdempotencyRecordDatabase;
  createCommandEventOutboxDatabase: (
    db: DndDatabase,
  ) => CommandEventOutboxDatabase;
  createCommandEventOutboxDispatcher: (
    database: CommandEventOutboxDatabase,
    sessions: RuntimeSessionStore,
  ) => CommandEventOutboxDispatcherLike;
  createPersistenceConnection: (databaseUrl: string) => PersistenceConnection;
  createSceneRecordDatabase: (db: DndDatabase) => SceneRecordDatabase;
  createServer: typeof createSessionServer;
  createSessionSnapshotDatabase: (db: DndDatabase) => SessionSnapshotDatabase;
  createUnitOfWork: (db: DndDatabase) => DndDatabaseUnitOfWork;
};

const defaultDependencies: ServerBootstrapDependencies = {
  createAuthUserDatabase: (db) => new DrizzleAuthUserDatabase(db),
  createActiveEncounterRecordDatabase: (db) =>
    new DrizzleActiveEncounterRecordDatabase(db),
  createCharacterLibraryEntryDatabase: (db) =>
    new DrizzleCharacterLibraryEntryDatabase(db),
  createCharacterRecordDatabase: (db) => new DrizzleCharacterRecordDatabase(db),
  createCommandIdempotencyRecordDatabase: (db) =>
    new DrizzleCommandIdempotencyRecordDatabase(db),
  createCommandEventOutboxDatabase: (db) =>
    new DrizzleCommandEventOutboxDatabase(db),
  createCommandEventOutboxDispatcher: (database, sessions) =>
    new CommandEventOutboxDispatcher(database, sessions),
  createPersistenceConnection: (databaseUrl) =>
    createNodePostgresDndDatabaseConnection(databaseUrl),
  createSceneRecordDatabase: (db) => new DrizzleSceneRecordDatabase(db),
  createServer: createSessionServer,
  createSessionSnapshotDatabase: (db) => new DrizzleSessionSnapshotDatabase(db),
  createUnitOfWork: (db) => new DrizzleDndDatabaseUnitOfWork(db),
};

export function readServerPersistenceMode(
  env: NodeJS.ProcessEnv = process.env,
): ServerPersistenceMode {
  const configuredMode = env.SERVER_PERSISTENCE_MODE?.trim() ?? 'in-memory';

  if (configuredMode === 'db' || configuredMode === 'in-memory') {
    return configuredMode;
  }

  throw new Error(
    `Unsupported SERVER_PERSISTENCE_MODE "${configuredMode}". Expected "in-memory" or "db".`,
  );
}

export async function createBootstrappedSessionServer(
  options: {
    dependencies?: Partial<ServerBootstrapDependencies>;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<SessionServerBootstrap> {
  const env = options.env ?? process.env;
  const dependencies = {
    ...defaultDependencies,
    ...options.dependencies,
  } satisfies ServerBootstrapDependencies;
  const persistenceMode = readServerPersistenceMode(env);

  if (persistenceMode === 'in-memory') {
    return {
      ...dependencies.createServer(),
      closePersistence: async () => undefined,
      persistenceMode,
    };
  }

  const databaseUrl = readRequiredDatabaseUrl(env);
  const connection = dependencies.createPersistenceConnection(databaseUrl);
  let closed = false;

  const closePersistence = async () => {
    if (closed) {
      return;
    }

    closed = true;
    await connection.close();
  };

  try {
    const sessionSnapshots = dependencies.createSessionSnapshotDatabase(
      connection.db,
    );
    const authUsers = dependencies.createAuthUserDatabase(connection.db);
    const characterRecords = dependencies.createCharacterRecordDatabase(
      connection.db,
    );
    const characterLibraryEntries =
      dependencies.createCharacterLibraryEntryDatabase(connection.db);
    const sceneRecords = dependencies.createSceneRecordDatabase(connection.db);
    const encounterRecords = dependencies.createActiveEncounterRecordDatabase(
      connection.db,
    );
    const commandIdempotencyRecords =
      dependencies.createCommandIdempotencyRecordDatabase(connection.db);
    const commandEventOutboxRecords =
      dependencies.createCommandEventOutboxDatabase(connection.db);
    const unitOfWork = dependencies.createUnitOfWork(connection.db);
    const runtime = new InMemoryGameRuntime(
      await DbBackedSessionStore.fromDatabase(sessionSnapshots),
      undefined,
      new DbBackedCharacterRepository(characterRecords),
      await DbBackedSceneStore.fromDatabase(sceneRecords),
      await DbBackedEncounterStore.fromDatabase(encounterRecords),
    );
    const idempotency = new DbBackedCommandIdempotencyStore(
      commandIdempotencyRecords,
    );
    const characterLibrary = new CharacterLibraryService(
      new DbBackedCharacterLibraryRepository(characterLibraryEntries),
      FileSystemCharacterPortraitStorage.fromEnv(env),
    );
    const auth = new AuthService(authUsers);
    const commandEventOutboxDispatcher =
      dependencies.createCommandEventOutboxDispatcher(
        commandEventOutboxRecords,
        runtime.sessions,
      );
    const characterCommandTransaction =
      new DbBackedCharacterCommandTransactionBoundary(
        unitOfWork,
        commandEventOutboxDispatcher,
      );
    const sessionCommandTransaction =
      new DbBackedSessionCommandTransactionBoundary(
        unitOfWork,
        commandEventOutboxDispatcher,
      );
    const sceneCommandTransaction = new DbBackedSceneCommandTransactionBoundary(
      unitOfWork,
    );
    const encounterCommandTransaction =
      new DbBackedEncounterCommandTransactionBoundary(
        unitOfWork,
        commandEventOutboxDispatcher,
      );
    const combatCommandTransaction =
      new DbBackedCombatCommandTransactionBoundary(
        unitOfWork,
        commandEventOutboxDispatcher,
      );

    return {
      ...dependencies.createServer(
        runtime,
        idempotency,
        characterCommandTransaction,
        sessionCommandTransaction,
        encounterCommandTransaction,
        combatCommandTransaction,
        commandEventOutboxDispatcher,
        sceneCommandTransaction,
        characterLibrary,
        auth,
      ),
      closePersistence,
      persistenceMode,
    };
  } catch (error) {
    await closePersistence();
    throw error;
  }
}

function readRequiredDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return databaseUrl;
  }

  throw new Error('DATABASE_URL is required when SERVER_PERSISTENCE_MODE=db.');
}
