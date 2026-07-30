import { and, asc, count, eq, isNull, min } from 'drizzle-orm';

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

/**
 * Aggregate view of the unpublished backlog, computed in the database.
 *
 * Exists so that reporting backlog size never materializes the backlog. Counting
 * rows in JavaScript meant an operational read got slower and heavier exactly as
 * the thing it reports on got worse.
 */
export type CommandEventOutboxBacklog = {
  countsByEventType: Partial<Record<CommandEventOutboxEventType, number>>;
  oldestCreatedAt: Date | null;
  totalCount: number;
};

export interface CommandEventOutboxDatabase {
  insertCommandEventOutboxRecord(
    write: CommandEventOutboxRecordWrite,
  ): Promise<CommandEventOutboxRow | null>;
  getUnpublishedCommandEventOutboxBacklog(): Promise<CommandEventOutboxBacklog>;
  /**
   * @param limit Maximum rows to return. Draining is a loop over bounded pages,
   * not one unbounded read, so a large backlog cannot exhaust memory.
   */
  listUnpublishedCommandEventOutboxRecords(
    limit?: number,
  ): Promise<CommandEventOutboxRow[]>;
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

  async getUnpublishedCommandEventOutboxBacklog(): Promise<CommandEventOutboxBacklog> {
    const rows = await this.db
      .select({
        eventType: commandEventOutboxRecords.eventType,
        oldestCreatedAt: min(commandEventOutboxRecords.createdAt),
        rowCount: count(),
      })
      .from(commandEventOutboxRecords)
      .where(isNull(commandEventOutboxRecords.publishedAt))
      .groupBy(commandEventOutboxRecords.eventType);

    const countsByEventType: Partial<
      Record<CommandEventOutboxEventType, number>
    > = {};
    let totalCount = 0;
    let oldestCreatedAt: Date | null = null;

    // One row per event type present, so this loop is bounded by the number of
    // event types rather than by the backlog.
    for (const row of rows) {
      const rowCount = Number(row.rowCount);
      const eventType = row.eventType as CommandEventOutboxEventType;

      countsByEventType[eventType] = rowCount;
      totalCount += rowCount;

      const rowOldest =
        row.oldestCreatedAt === null ? null : new Date(row.oldestCreatedAt);

      if (rowOldest && (!oldestCreatedAt || rowOldest < oldestCreatedAt)) {
        oldestCreatedAt = rowOldest;
      }
    }

    return { countsByEventType, oldestCreatedAt, totalCount };
  }

  async listUnpublishedCommandEventOutboxRecords(
    limit?: number,
  ): Promise<CommandEventOutboxRow[]> {
    const query = this.db
      .select()
      .from(commandEventOutboxRecords)
      .where(isNull(commandEventOutboxRecords.publishedAt))
      .orderBy(
        asc(commandEventOutboxRecords.createdAt),
        asc(commandEventOutboxRecords.idempotencyKey),
        asc(commandEventOutboxRecords.eventOrder),
        asc(commandEventOutboxRecords.outboxId),
      );

    return limit === undefined ? query : query.limit(limit);
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
