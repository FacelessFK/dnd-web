import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { CharacterId } from '@dnd/shared';

import {
  characterRecords,
  dbSchema,
  type CharacterRecordRow,
  type StoredCharacterRecordDocument,
} from './schema.js';

export type DndDatabase = NodePgDatabase<typeof dbSchema>;
export type DndTransaction = Parameters<
  Parameters<DndDatabase['transaction']>[0]
>[0];

type CharacterRecordDatabaseClient = DndDatabase | DndTransaction;

export type CharacterRecordWrite = {
  characterId: CharacterId;
  record: StoredCharacterRecordDocument;
};

export interface CharacterRecordDatabase {
  upsertCharacterRecord(
    write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow>;
  getCharacterRecord(
    characterId: CharacterId,
  ): Promise<CharacterRecordRow | null>;
  updateCharacterRecord(
    write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow | null>;
}

export class DrizzleCharacterRecordDatabase implements CharacterRecordDatabase {
  constructor(private readonly db: CharacterRecordDatabaseClient) {}

  async upsertCharacterRecord(
    write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow> {
    const [row] = await this.db
      .insert(characterRecords)
      .values({
        characterId: write.characterId,
        record: write.record,
      })
      .onConflictDoUpdate({
        target: characterRecords.characterId,
        set: {
          record: write.record,
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.requireReturnedRow(row);
  }

  async getCharacterRecord(
    characterId: CharacterId,
  ): Promise<CharacterRecordRow | null> {
    const [row] = await this.db
      .select()
      .from(characterRecords)
      .where(eq(characterRecords.characterId, characterId))
      .limit(1);

    return row ?? null;
  }

  async updateCharacterRecord(
    write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow | null> {
    const [row] = await this.db
      .update(characterRecords)
      .set({
        record: write.record,
        updatedAt: new Date(),
      })
      .where(eq(characterRecords.characterId, write.characterId))
      .returning();

    return row ?? null;
  }

  private requireReturnedRow(
    row: CharacterRecordRow | undefined,
  ): CharacterRecordRow {
    if (!row) {
      throw new Error('Character record write did not return a row.');
    }

    return row;
  }
}
