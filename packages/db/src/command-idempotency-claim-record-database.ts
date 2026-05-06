import { eq } from 'drizzle-orm';

import {
  commandIdempotencyClaimRecords,
  type CommandIdempotencyClaimRecordRow,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type CommandIdempotencyClaimRecordDatabaseClient = DndDatabase | DndTransaction;

export type CommandIdempotencyClaimRecordWrite = {
  actorParticipantId: string;
  category: string;
  commandId: string;
  commandType: string;
  fingerprint: string;
  idempotencyKey: string;
  sessionId: string | null;
};

export interface CommandIdempotencyClaimRecordDatabase {
  getCommandIdempotencyClaimRecord(
    idempotencyKey: string,
  ): Promise<CommandIdempotencyClaimRecordRow | null>;
  insertCommandIdempotencyClaimRecord(
    write: CommandIdempotencyClaimRecordWrite,
  ): Promise<CommandIdempotencyClaimRecordRow | null>;
}

export class DrizzleCommandIdempotencyClaimRecordDatabase implements CommandIdempotencyClaimRecordDatabase {
  constructor(
    private readonly db: CommandIdempotencyClaimRecordDatabaseClient,
  ) {}

  async getCommandIdempotencyClaimRecord(
    idempotencyKey: string,
  ): Promise<CommandIdempotencyClaimRecordRow | null> {
    const [row] = await this.db
      .select()
      .from(commandIdempotencyClaimRecords)
      .where(eq(commandIdempotencyClaimRecords.idempotencyKey, idempotencyKey))
      .limit(1);

    return row ?? null;
  }

  async insertCommandIdempotencyClaimRecord(
    write: CommandIdempotencyClaimRecordWrite,
  ): Promise<CommandIdempotencyClaimRecordRow | null> {
    const [row] = await this.db
      .insert(commandIdempotencyClaimRecords)
      .values({
        actorParticipantId: write.actorParticipantId,
        category: write.category,
        commandId: write.commandId,
        commandType: write.commandType,
        fingerprint: write.fingerprint,
        idempotencyKey: write.idempotencyKey,
        sessionId: write.sessionId,
      })
      .onConflictDoNothing()
      .returning();

    return row ?? null;
  }
}
