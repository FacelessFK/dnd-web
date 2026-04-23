import {
  DrizzleCharacterRecordDatabase,
  type CharacterRecordDatabase,
  type DndDatabase,
} from './character-record-database.js';
import {
  DrizzleCommandIdempotencyRecordDatabase,
  type CommandIdempotencyRecordDatabase,
} from './command-idempotency-record-database.js';

export type DndDatabaseUnitOfWorkContext = {
  characters: CharacterRecordDatabase;
  commandIdempotency: CommandIdempotencyRecordDatabase;
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
        commandIdempotency: new DrizzleCommandIdempotencyRecordDatabase(tx),
      }),
    );
  }
}
