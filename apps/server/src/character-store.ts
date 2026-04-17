import type { SessionErrorCode } from '@dnd/protocol';
import type { Character, CharacterId, EncounterOverlay } from '@dnd/shared';

export type StoredCharacterRecord = {
  character: Character;
  overlay: EncounterOverlay;
};

export interface CharacterRepository {
  createCharacter(record: StoredCharacterRecord): StoredCharacterRecord;
  getCharacter(characterId: CharacterId): StoredCharacterRecord;
  saveCharacter(record: StoredCharacterRecord): StoredCharacterRecord;
}

export class CharacterStoreError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterStoreError';
  }
}

export class InMemoryCharacterStore implements CharacterRepository {
  private readonly characters = new Map<CharacterId, StoredCharacterRecord>();

  createCharacter(record: StoredCharacterRecord): StoredCharacterRecord {
    this.characters.set(record.character.id, this.clone(record));

    return this.clone(record);
  }

  getCharacter(characterId: CharacterId): StoredCharacterRecord {
    const record = this.characters.get(characterId);

    if (!record) {
      throw new CharacterStoreError(
        'character_not_found',
        `Character "${characterId}" does not exist.`,
      );
    }

    return this.clone(record);
  }

  saveCharacter(record: StoredCharacterRecord): StoredCharacterRecord {
    if (!this.characters.has(record.character.id)) {
      throw new CharacterStoreError(
        'character_not_found',
        `Character "${record.character.id}" does not exist.`,
      );
    }

    this.characters.set(record.character.id, this.clone(record));

    return this.clone(record);
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}
