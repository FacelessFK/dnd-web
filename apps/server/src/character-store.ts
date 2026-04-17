import { randomUUID } from 'node:crypto';

import type { CharacterInput, SessionErrorCode } from '@dnd/protocol';
import type {
  Character,
  CharacterId,
  EncounterOverlay,
  ParticipantId,
  RulesProfileId,
} from '@dnd/shared';

export type StoredCharacterRecord = {
  character: Character;
  overlay: EncounterOverlay;
};

type CreateCharacterParams = {
  ownerParticipantId: ParticipantId;
  rulesProfileId: RulesProfileId;
  character: CharacterInput;
};

export class CharacterStoreError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterStoreError';
  }
}

export class InMemoryCharacterStore {
  private readonly characters = new Map<CharacterId, StoredCharacterRecord>();

  createCharacter(params: CreateCharacterParams): StoredCharacterRecord {
    const now = this.now();
    const characterId = this.createCharacterId();
    const character: Character = {
      id: characterId,
      ownerParticipantId: params.ownerParticipantId,
      name: params.character.name,
      rulesProfileId: params.rulesProfileId,
      level: params.character.level,
      className: params.character.className,
      speciesOrRace: params.character.speciesOrRace,
      background: params.character.background,
      abilities: structuredClone(params.character.abilities),
      hp: structuredClone(params.character.hp),
      armorClass: params.character.armorClass,
      speed: params.character.speed,
      notes: params.character.notes ?? null,
      meta: structuredClone(params.character.meta ?? {}),
      createdAt: now,
      updatedAt: now,
    };
    const overlay: EncounterOverlay = {
      characterId,
      position: null,
      activeConditions: [],
      concentration: null,
      turnUsage: null,
      currentVisibility: 'visible',
    };
    const record = { character, overlay };

    this.characters.set(characterId, record);

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

  private createCharacterId(): CharacterId {
    return `char_${randomUUID()}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}
