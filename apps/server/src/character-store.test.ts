import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CharacterRepository,
  StoredCharacterRecord,
} from './character-store.js';
import {
  CharacterStoreError,
  InMemoryCharacterStore,
} from './character-store.js';

function createStoredCharacterRecord(): StoredCharacterRecord {
  return {
    character: {
      id: 'char_11111111-1111-4111-8111-111111111111',
      ownerParticipantId: 'player-001',
      status: 'draft',
      name: 'Aria',
      rulesProfileId: 'dnd5e-2024-core',
      level: 5,
      className: 'Wizard',
      speciesOrRace: 'Elf',
      background: 'Sage',
      abilities: {
        str: 8,
        dex: 14,
        con: 13,
        int: 16,
        wis: 12,
        cha: 10,
      },
      hp: {
        max: 26,
        current: 26,
        temp: 0,
      },
      armorClass: 13,
      speed: 30,
      notes: 'Repository smoke test.',
      meta: {
        focus: 'orb',
      },
      createdAt: '2026-04-17T00:00:00.000Z',
      updatedAt: '2026-04-17T00:00:00.000Z',
    },
    overlay: {
      characterId: 'char_11111111-1111-4111-8111-111111111111',
      footprint: {
        width: 1,
        height: 1,
      },
      position: null,
      activeConditions: [],
      concentration: null,
      currentVisibility: 'visible',
    },
  };
}

test('character repository stores clones and persists saves through the boundary', () => {
  const repository: CharacterRepository = new InMemoryCharacterStore();
  const created = repository.createCharacter(createStoredCharacterRecord());

  created.character.name = 'Locally Mutated';

  const fetched = repository.getCharacter(
    'char_11111111-1111-4111-8111-111111111111',
  );

  assert.equal(fetched.character.name, 'Aria');

  const saved = repository.saveCharacter({
    ...fetched,
    character: {
      ...fetched.character,
      status: 'ready',
      updatedAt: '2026-04-17T01:00:00.000Z',
    },
  });

  assert.equal(saved.character.status, 'ready');
  assert.equal(
    repository.getCharacter('char_11111111-1111-4111-8111-111111111111')
      .character.status,
    'ready',
  );
});

test('saving a missing character through the repository boundary fails safely', () => {
  const repository: CharacterRepository = new InMemoryCharacterStore();

  assert.throws(
    () => {
      repository.saveCharacter(createStoredCharacterRecord());
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'character_not_found',
  );
});
