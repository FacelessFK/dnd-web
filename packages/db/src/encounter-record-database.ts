import { and, eq } from 'drizzle-orm';

import type { EncounterId, SceneId, SessionId } from '@dnd/shared';

import {
  activeEncounterRecords,
  type ActiveEncounterRecordRow,
  type StoredActiveEncounterRecordDocument,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type ActiveEncounterRecordDatabaseClient = DndDatabase | DndTransaction;

export type ActiveEncounterRecordWrite = {
  encounterId: EncounterId;
  sessionId: SessionId;
  sceneId: SceneId;
  record: StoredActiveEncounterRecordDocument;
};

export type ActiveEncounterRecordDelete = {
  encounterId: EncounterId;
  sessionId: SessionId;
};

export interface ActiveEncounterRecordDatabase {
  deleteActiveEncounterRecord(
    params: ActiveEncounterRecordDelete,
  ): Promise<ActiveEncounterRecordRow | null>;
  getActiveEncounterRecordBySession(
    sessionId: SessionId,
  ): Promise<ActiveEncounterRecordRow | null>;
  insertActiveEncounterRecord(
    write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null>;
  listActiveEncounterRecords(): Promise<ActiveEncounterRecordRow[]>;
  updateActiveEncounterRecord(
    write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null>;
}

export class DrizzleActiveEncounterRecordDatabase implements ActiveEncounterRecordDatabase {
  constructor(private readonly db: ActiveEncounterRecordDatabaseClient) {}

  async deleteActiveEncounterRecord(
    params: ActiveEncounterRecordDelete,
  ): Promise<ActiveEncounterRecordRow | null> {
    const [row] = await this.db
      .delete(activeEncounterRecords)
      .where(
        and(
          eq(activeEncounterRecords.encounterId, params.encounterId),
          eq(activeEncounterRecords.sessionId, params.sessionId),
        ),
      )
      .returning();

    return row ?? null;
  }

  async getActiveEncounterRecordBySession(
    sessionId: SessionId,
  ): Promise<ActiveEncounterRecordRow | null> {
    const [row] = await this.db
      .select()
      .from(activeEncounterRecords)
      .where(eq(activeEncounterRecords.sessionId, sessionId))
      .limit(1);

    return row ?? null;
  }

  async insertActiveEncounterRecord(
    write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null> {
    const [row] = await this.db
      .insert(activeEncounterRecords)
      .values({
        encounterId: write.encounterId,
        sessionId: write.sessionId,
        sceneId: write.sceneId,
        record: write.record,
      })
      .onConflictDoNothing({
        target: activeEncounterRecords.sessionId,
      })
      .returning();

    return row ?? null;
  }

  async listActiveEncounterRecords(): Promise<ActiveEncounterRecordRow[]> {
    return this.db.select().from(activeEncounterRecords);
  }

  async updateActiveEncounterRecord(
    write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null> {
    const [row] = await this.db
      .update(activeEncounterRecords)
      .set({
        encounterId: write.encounterId,
        sceneId: write.sceneId,
        record: write.record,
        updatedAt: new Date(),
      })
      .where(eq(activeEncounterRecords.sessionId, write.sessionId))
      .returning();

    return row ?? null;
  }
}
