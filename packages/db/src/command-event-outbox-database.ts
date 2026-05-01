import { and, asc, eq, isNull } from 'drizzle-orm';

import type { SessionId } from '@dnd/shared';

import {
  commandEventOutboxRecords,
  type CommandEventOutboxEventType,
  type CommandEventOutboxRow,
  type StoredCommandEventOutboxPayloadDocument,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type CommandEventOutboxDatabaseClient = DndDatabase | DndTransaction;

export type CommandEventOutboxRecordWrite = {
  eventOrder: number;
  eventType: CommandEventOutboxEventType;
  idempotencyKey: string;
  outboxId: string;
  payload: StoredCommandEventOutboxPayloadDocument;
  sessionId: SessionId;
};

export interface CommandEventOutboxDatabase {
  insertCommandEventOutboxRecord(
    write: CommandEventOutboxRecordWrite,
  ): Promise<CommandEventOutboxRow | null>;
  listUnpublishedCommandEventOutboxRecords(): Promise<CommandEventOutboxRow[]>;
  listUnpublishedCommandEventOutboxRecordsByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CommandEventOutboxRow[]>;
  markCommandEventOutboxRecordPublished(
    outboxId: string,
  ): Promise<CommandEventOutboxRow | null>;
}

export class DrizzleCommandEventOutboxDatabase implements CommandEventOutboxDatabase {
  constructor(private readonly db: CommandEventOutboxDatabaseClient) {}

  async insertCommandEventOutboxRecord(
    write: CommandEventOutboxRecordWrite,
  ): Promise<CommandEventOutboxRow | null> {
    const [row] = await this.db
      .insert(commandEventOutboxRecords)
      .values({
        eventOrder: write.eventOrder,
        eventType: write.eventType,
        idempotencyKey: write.idempotencyKey,
        outboxId: write.outboxId,
        payload: write.payload,
        sessionId: write.sessionId,
      })
      .onConflictDoNothing({
        target: [
          commandEventOutboxRecords.idempotencyKey,
          commandEventOutboxRecords.eventOrder,
        ],
      })
      .returning();

    return row ?? null;
  }

  async listUnpublishedCommandEventOutboxRecords(): Promise<
    CommandEventOutboxRow[]
  > {
    return this.db
      .select()
      .from(commandEventOutboxRecords)
      .where(isNull(commandEventOutboxRecords.publishedAt))
      .orderBy(
        asc(commandEventOutboxRecords.createdAt),
        asc(commandEventOutboxRecords.idempotencyKey),
        asc(commandEventOutboxRecords.eventOrder),
        asc(commandEventOutboxRecords.outboxId),
      );
  }

  async listUnpublishedCommandEventOutboxRecordsByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CommandEventOutboxRow[]> {
    return this.db
      .select()
      .from(commandEventOutboxRecords)
      .where(
        and(
          eq(commandEventOutboxRecords.idempotencyKey, idempotencyKey),
          isNull(commandEventOutboxRecords.publishedAt),
        ),
      )
      .orderBy(
        asc(commandEventOutboxRecords.eventOrder),
        asc(commandEventOutboxRecords.outboxId),
      );
  }

  async markCommandEventOutboxRecordPublished(
    outboxId: string,
  ): Promise<CommandEventOutboxRow | null> {
    const [row] = await this.db
      .update(commandEventOutboxRecords)
      .set({
        publishedAt: new Date(),
      })
      .where(
        and(
          eq(commandEventOutboxRecords.outboxId, outboxId),
          isNull(commandEventOutboxRecords.publishedAt),
        ),
      )
      .returning();

    return row ?? null;
  }
}
