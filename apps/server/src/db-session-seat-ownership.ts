/**
 * Seat bindings that outlive the process.
 *
 * Hydrated once at boot and written through on every claim, matching how
 * `DbBackedSessionStore` and `DbBackedSceneStore` already work. The cache is
 * what makes the read side synchronous on the session-command hot path; the
 * awaited write is what makes a binding durable before a credential is minted
 * against it.
 *
 * No token, hash, or fragment of a participant credential reaches this store.
 * The credential is process-local by design - a restart must invalidate it -
 * and the binding below is the durable fact that lets the rightful account
 * obtain a new one.
 */
import type {
  SessionSeatOwnershipDatabase,
  SessionSeatOwnershipRow,
} from '@dnd/db';
import type { ParticipantId, SessionId } from '@dnd/shared';

import {
  SeatOwnershipError,
  type SeatOwnershipRecord,
  type SeatOwnershipStorage,
} from './session-seat-ownership.js';

export class DbBackedSeatOwnershipStorage implements SeatOwnershipStorage {
  private readonly records: Map<string, SeatOwnershipRecord>;

  private constructor(
    private readonly database: SessionSeatOwnershipDatabase,
    records: Map<string, SeatOwnershipRecord>,
  ) {
    this.records = records;
  }

  static async fromDatabase(
    database: SessionSeatOwnershipDatabase,
  ): Promise<DbBackedSeatOwnershipStorage> {
    const rows = await database.listSessionSeatOwnership();
    const records = new Map<string, SeatOwnershipRecord>();

    for (const row of rows) {
      const record = fromRow(row);

      records.set(key(record.sessionId, record.participantId), record);
    }

    return new DbBackedSeatOwnershipStorage(database, records);
  }

  get(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): SeatOwnershipRecord | undefined {
    return this.records.get(key(sessionId, participantId));
  }

  /**
   * The database is the arbiter, not the cache.
   *
   * `claimSessionSeatOwnership` writes conditionally, so a second account
   * racing for the same seat updates no rows and gets `null` back. Turning that
   * into the same `SeatOwnershipError` the in-memory path raises means two
   * processes against one database behave like one process, rather than both
   * believing they won and issuing credentials for the same chair.
   */
  async set(record: SeatOwnershipRecord): Promise<void> {
    const row = await this.database.claimSessionSeatOwnership({
      boundAt: new Date(record.boundAt),
      participantId: record.participantId,
      sessionId: record.sessionId,
      userId: record.userId,
    });

    if (!row) {
      throw new SeatOwnershipError(
        `Seat "${record.participantId}" in session "${record.sessionId}" belongs to another account.`,
      );
    }

    const stored = fromRow(row);

    this.records.set(key(stored.sessionId, stored.participantId), stored);
  }

  async deleteSession(sessionId: SessionId): Promise<void> {
    await this.database.deleteSessionSeatOwnershipBySession(sessionId);

    for (const [recordKey, record] of this.records) {
      if (record.sessionId === sessionId) {
        this.records.delete(recordKey);
      }
    }
  }
}

function key(sessionId: SessionId, participantId: ParticipantId): string {
  return `${sessionId}::${participantId}`;
}

function fromRow(row: SessionSeatOwnershipRow): SeatOwnershipRecord {
  return {
    boundAt: row.boundAt.toISOString(),
    participantId: row.participantId,
    sessionId: row.sessionId,
    userId: row.userId,
  };
}
