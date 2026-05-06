import {
  DrizzleCharacterRecordDatabase,
  type CharacterRecordDatabase,
  type DndDatabase,
} from './character-record-database.js';
import {
  DrizzleCommandIdempotencyClaimRecordDatabase,
  type CommandIdempotencyClaimRecordDatabase,
} from './command-idempotency-claim-record-database.js';
import {
  DrizzleCommandIdempotencyRecordDatabase,
  type CommandIdempotencyRecordDatabase,
} from './command-idempotency-record-database.js';
import {
  DrizzleCommandEventOutboxDatabase,
  type CommandEventOutboxDatabase,
} from './command-event-outbox-database.js';
import {
  DrizzleActiveEncounterRecordDatabase,
  type ActiveEncounterRecordDatabase,
} from './encounter-record-database.js';
import {
  DrizzleSceneRecordDatabase,
  type SceneRecordDatabase,
} from './scene-record-database.js';
import {
  DrizzleSessionSnapshotDatabase,
  type SessionSnapshotDatabase,
} from './session-snapshot-database.js';

export type DndDatabaseUnitOfWorkContext = {
  characters: CharacterRecordDatabase;
  commandIdempotencyClaims: CommandIdempotencyClaimRecordDatabase;
  commandIdempotency: CommandIdempotencyRecordDatabase;
  encounters: ActiveEncounterRecordDatabase;
  outbox: CommandEventOutboxDatabase;
  scenes: SceneRecordDatabase;
  sessions: SessionSnapshotDatabase;
};

export interface DndDatabaseUnitOfWork {
  transaction<T>(
    run: (context: DndDatabaseUnitOfWorkContext) => Promise<T>,
  ): Promise<T>;
}

export class DrizzleDndDatabaseUnitOfWork implements DndDatabaseUnitOfWork {
  constructor(private readonly db: DndDatabase) {}

  async transaction<T>(
    run: (context: DndDatabaseUnitOfWorkContext) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) =>
      run({
        characters: new DrizzleCharacterRecordDatabase(tx),
        commandIdempotencyClaims:
          new DrizzleCommandIdempotencyClaimRecordDatabase(tx),
        commandIdempotency: new DrizzleCommandIdempotencyRecordDatabase(tx),
        encounters: new DrizzleActiveEncounterRecordDatabase(tx),
        outbox: new DrizzleCommandEventOutboxDatabase(tx),
        scenes: new DrizzleSceneRecordDatabase(tx),
        sessions: new DrizzleSessionSnapshotDatabase(tx),
      }),
    );
  }
}
