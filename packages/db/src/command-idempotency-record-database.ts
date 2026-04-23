import { eq } from 'drizzle-orm';

import {
  completedCommandIdempotencyRecords,
  type CompletedCommandIdempotencyRecordRow,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type CommandIdempotencyRecordDatabaseClient = DndDatabase | DndTransaction;

export type CompletedCommandIdempotencyRecordWrite = {
  actorParticipantId: string;
  category: string;
  commandId: string;
  commandType: string;
  fingerprint: string;
  idempotencyKey: string;
  response: unknown;
  sessionId: string | null;
};

export interface CommandIdempotencyRecordDatabase {
  getCompletedCommandIdempotencyRecord(
    idempotencyKey: string,
  ): Promise<CompletedCommandIdempotencyRecordRow | null>;
  insertCompletedCommandIdempotencyRecord(
    write: CompletedCommandIdempotencyRecordWrite,
  ): Promise<CompletedCommandIdempotencyRecordRow | null>;
}

export class DrizzleCommandIdempotencyRecordDatabase implements CommandIdempotencyRecordDatabase {
  constructor(private readonly db: CommandIdempotencyRecordDatabaseClient) {}

  async getCompletedCommandIdempotencyRecord(
    idempotencyKey: string,
  ): Promise<CompletedCommandIdempotencyRecordRow | null> {
    const [row] = await this.db
      .select()
      .from(completedCommandIdempotencyRecords)
      .where(
        eq(completedCommandIdempotencyRecords.idempotencyKey, idempotencyKey),
      )
      .limit(1);

    return row ?? null;
  }

  async insertCompletedCommandIdempotencyRecord(
    write: CompletedCommandIdempotencyRecordWrite,
  ): Promise<CompletedCommandIdempotencyRecordRow | null> {
    const [row] = await this.db
      .insert(completedCommandIdempotencyRecords)
      .values({
        actorParticipantId: write.actorParticipantId,
        category: write.category,
        commandId: write.commandId,
        commandType: write.commandType,
        fingerprint: write.fingerprint,
        idempotencyKey: write.idempotencyKey,
        response: write.response,
        sessionId: write.sessionId,
      })
      .onConflictDoNothing()
      .returning();

    return row ?? null;
  }
}
