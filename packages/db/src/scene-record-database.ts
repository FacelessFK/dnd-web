import { eq } from 'drizzle-orm';

import type { SceneId, SessionId } from '@dnd/shared';

import {
  sceneRecords,
  type SceneRecordRow,
  type StoredSceneRecordDocument,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type SceneRecordDatabaseClient = DndDatabase | DndTransaction;

export type SceneRecordWrite = {
  record: StoredSceneRecordDocument;
  sceneId: SceneId;
  sessionId: SessionId;
};

export interface SceneRecordDatabase {
  getSceneRecord(sceneId: SceneId): Promise<SceneRecordRow | null>;
  listSceneRecords(): Promise<SceneRecordRow[]>;
  updateSceneRecord(write: SceneRecordWrite): Promise<SceneRecordRow | null>;
  upsertSceneRecord(write: SceneRecordWrite): Promise<SceneRecordRow>;
}

export class DrizzleSceneRecordDatabase implements SceneRecordDatabase {
  constructor(private readonly db: SceneRecordDatabaseClient) {}

  async getSceneRecord(sceneId: SceneId): Promise<SceneRecordRow | null> {
    const [row] = await this.db
      .select()
      .from(sceneRecords)
      .where(eq(sceneRecords.sceneId, sceneId))
      .limit(1);

    return row ?? null;
  }

  async listSceneRecords(): Promise<SceneRecordRow[]> {
    return this.db.select().from(sceneRecords);
  }

  async updateSceneRecord(
    write: SceneRecordWrite,
  ): Promise<SceneRecordRow | null> {
    const [row] = await this.db
      .update(sceneRecords)
      .set({
        record: write.record,
        sessionId: write.sessionId,
        updatedAt: new Date(),
      })
      .where(eq(sceneRecords.sceneId, write.sceneId))
      .returning();

    return row ?? null;
  }

  async upsertSceneRecord(write: SceneRecordWrite): Promise<SceneRecordRow> {
    const [row] = await this.db
      .insert(sceneRecords)
      .values({
        sceneId: write.sceneId,
        sessionId: write.sessionId,
        record: write.record,
      })
      .onConflictDoUpdate({
        target: sceneRecords.sceneId,
        set: {
          record: write.record,
          sessionId: write.sessionId,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error('Scene record write did not return a row.');
    }

    return row;
  }
}
