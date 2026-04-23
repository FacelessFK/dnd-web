import type {
  CharacterRecordDatabase,
  StoredCharacterRecordDocument,
} from '@dnd/db';
import type { CharacterId } from '@dnd/shared';

import {
  CharacterStoreError,
  type StoredCharacterRecord,
} from './character-store.js';

export interface AsyncCharacterRepository {
  createCharacter(
    record: StoredCharacterRecord,
  ): Promise<StoredCharacterRecord>;
  getCharacter(characterId: CharacterId): Promise<StoredCharacterRecord>;
  saveCharacter(record: StoredCharacterRecord): Promise<StoredCharacterRecord>;
}

export class DbBackedCharacterRepository implements AsyncCharacterRepository {
  constructor(private readonly database: CharacterRecordDatabase) {}

  async createCharacter(
    record: StoredCharacterRecord,
  ): Promise<StoredCharacterRecord> {
    const row = await this.database.upsertCharacterRecord({
      characterId: record.character.id,
      record: this.toDocument(record),
    });

    return this.fromDocument(row.record);
  }

  async getCharacter(characterId: CharacterId): Promise<StoredCharacterRecord> {
    const row = await this.database.getCharacterRecord(characterId);

    if (!row) {
      throw new CharacterStoreError(
        'character_not_found',
        `Character "${characterId}" does not exist.`,
      );
    }

    return this.fromDocument(row.record);
  }

  async saveCharacter(
    record: StoredCharacterRecord,
  ): Promise<StoredCharacterRecord> {
    const row = await this.database.updateCharacterRecord({
      characterId: record.character.id,
      record: this.toDocument(record),
    });

    if (!row) {
      throw new CharacterStoreError(
        'character_not_found',
        `Character "${record.character.id}" does not exist.`,
      );
    }

    return this.fromDocument(row.record);
  }

  private toDocument(
    record: StoredCharacterRecord,
  ): StoredCharacterRecordDocument {
    return this.clone(record);
  }

  private fromDocument(
    document: StoredCharacterRecordDocument,
  ): StoredCharacterRecord {
    return this.clone(document);
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}
