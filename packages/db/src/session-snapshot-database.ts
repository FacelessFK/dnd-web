import { eq } from 'drizzle-orm';

import type { SessionId } from '@dnd/shared';

import {
  sessionSnapshots,
  type PersistedSessionSnapshotDocument,
  type SessionSnapshotRow,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type SessionSnapshotDatabaseClient = DndDatabase | DndTransaction;

export type SessionSnapshotWrite = {
  sessionId: SessionId;
  snapshot: PersistedSessionSnapshotDocument;
};

export interface SessionSnapshotDatabase {
  getSessionSnapshot(sessionId: SessionId): Promise<SessionSnapshotRow | null>;
  listSessionSnapshots(): Promise<SessionSnapshotRow[]>;
  upsertSessionSnapshot(
    write: SessionSnapshotWrite,
  ): Promise<SessionSnapshotRow>;
}

export class DrizzleSessionSnapshotDatabase implements SessionSnapshotDatabase {
  constructor(private readonly db: SessionSnapshotDatabaseClient) {}

  async getSessionSnapshot(
    sessionId: SessionId,
  ): Promise<SessionSnapshotRow | null> {
    const [row] = await this.db
      .select()
      .from(sessionSnapshots)
      .where(eq(sessionSnapshots.sessionId, sessionId))
      .limit(1);

    return row ?? null;
  }

  async listSessionSnapshots(): Promise<SessionSnapshotRow[]> {
    return this.db.select().from(sessionSnapshots);
  }

  async upsertSessionSnapshot(
    write: SessionSnapshotWrite,
  ): Promise<SessionSnapshotRow> {
    const [row] = await this.db
      .insert(sessionSnapshots)
      .values({
        sessionId: write.sessionId,
        snapshot: write.snapshot,
      })
      .onConflictDoUpdate({
        target: sessionSnapshots.sessionId,
        set: {
          snapshot: write.snapshot,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error('Session snapshot write did not return a row.');
    }

    return row;
  }
}
