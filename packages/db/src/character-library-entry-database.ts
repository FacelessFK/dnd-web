import { and, desc, eq } from 'drizzle-orm';

import {
  characterLibraryEntries,
  type CharacterLibraryEntryRow,
  type StoredCharacterLibraryEntryDocument,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type CharacterLibraryEntryDatabaseClient = DndDatabase | DndTransaction;

export type CharacterLibraryEntryWrite = {
  entry: StoredCharacterLibraryEntryDocument;
  entryId: string;
  ownerParticipantId: string;
  ownerUserId?: string | null;
};

export interface CharacterLibraryEntryDatabase {
  getCharacterLibraryEntry(
    params: Pick<CharacterLibraryEntryWrite, 'entryId' | 'ownerParticipantId'>,
  ): Promise<CharacterLibraryEntryRow | null>;
  getCharacterLibraryEntryByUser(
    params: Pick<CharacterLibraryEntryWrite, 'entryId' | 'ownerUserId'>,
  ): Promise<CharacterLibraryEntryRow | null>;
  insertCharacterLibraryEntry(
    write: CharacterLibraryEntryWrite,
  ): Promise<CharacterLibraryEntryRow | null>;
  listCharacterLibraryEntries(
    ownerParticipantId: string,
  ): Promise<CharacterLibraryEntryRow[]>;
  listCharacterLibraryEntriesByUser(
    ownerUserId: string,
  ): Promise<CharacterLibraryEntryRow[]>;
  updateCharacterLibraryEntry(
    write: CharacterLibraryEntryWrite,
  ): Promise<CharacterLibraryEntryRow | null>;
  updateCharacterLibraryEntryByUser(
    write: CharacterLibraryEntryWrite & { ownerUserId: string },
  ): Promise<CharacterLibraryEntryRow | null>;
}

export class DrizzleCharacterLibraryEntryDatabase implements CharacterLibraryEntryDatabase {
  constructor(private readonly db: CharacterLibraryEntryDatabaseClient) {}

  async getCharacterLibraryEntry(
    params: Pick<CharacterLibraryEntryWrite, 'entryId' | 'ownerParticipantId'>,
  ): Promise<CharacterLibraryEntryRow | null> {
    const [row] = await this.db
      .select()
      .from(characterLibraryEntries)
      .where(
        and(
          eq(characterLibraryEntries.entryId, params.entryId),
          eq(
            characterLibraryEntries.ownerParticipantId,
            params.ownerParticipantId,
          ),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async getCharacterLibraryEntryByUser(
    params: Pick<CharacterLibraryEntryWrite, 'entryId' | 'ownerUserId'>,
  ): Promise<CharacterLibraryEntryRow | null> {
    if (!params.ownerUserId) {
      return null;
    }

    const [row] = await this.db
      .select()
      .from(characterLibraryEntries)
      .where(
        and(
          eq(characterLibraryEntries.entryId, params.entryId),
          eq(characterLibraryEntries.ownerUserId, params.ownerUserId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async insertCharacterLibraryEntry(
    write: CharacterLibraryEntryWrite,
  ): Promise<CharacterLibraryEntryRow | null> {
    const [row] = await this.db
      .insert(characterLibraryEntries)
      .values({
        entry: write.entry,
        entryId: write.entryId,
        ownerParticipantId: write.ownerParticipantId,
        ownerUserId: write.ownerUserId ?? null,
      })
      .onConflictDoNothing()
      .returning();

    return row ?? null;
  }

  async listCharacterLibraryEntries(
    ownerParticipantId: string,
  ): Promise<CharacterLibraryEntryRow[]> {
    return this.db
      .select()
      .from(characterLibraryEntries)
      .where(eq(characterLibraryEntries.ownerParticipantId, ownerParticipantId))
      .orderBy(desc(characterLibraryEntries.updatedAt));
  }

  async listCharacterLibraryEntriesByUser(
    ownerUserId: string,
  ): Promise<CharacterLibraryEntryRow[]> {
    return this.db
      .select()
      .from(characterLibraryEntries)
      .where(eq(characterLibraryEntries.ownerUserId, ownerUserId))
      .orderBy(desc(characterLibraryEntries.updatedAt));
  }

  async updateCharacterLibraryEntry(
    write: CharacterLibraryEntryWrite,
  ): Promise<CharacterLibraryEntryRow | null> {
    const [row] = await this.db
      .update(characterLibraryEntries)
      .set({
        entry: write.entry,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(characterLibraryEntries.entryId, write.entryId),
          eq(
            characterLibraryEntries.ownerParticipantId,
            write.ownerParticipantId,
          ),
        ),
      )
      .returning();

    return row ?? null;
  }

  async updateCharacterLibraryEntryByUser(
    write: CharacterLibraryEntryWrite & { ownerUserId: string },
  ): Promise<CharacterLibraryEntryRow | null> {
    const [row] = await this.db
      .update(characterLibraryEntries)
      .set({
        entry: write.entry,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(characterLibraryEntries.entryId, write.entryId),
          eq(characterLibraryEntries.ownerUserId, write.ownerUserId),
        ),
      )
      .returning();

    return row ?? null;
  }
}
