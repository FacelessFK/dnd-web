import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CharacterRecordDatabase,
  CharacterRecordRow,
  CharacterRecordWrite,
} from '@dnd/db';
import type { CharacterId } from '@dnd/shared';

import {
  type CharacterRepository,
  CharacterStoreError,
  InMemoryCharacterStore,
  type StoredCharacterRecord,
} from './character-store.js';
import { DbBackedCharacterRepository } from './db-character-repository.js';

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

function createPlacedStoredCharacterRecord(): StoredCharacterRecord {
  const record = createStoredCharacterRecord();

  return {
    character: {
      ...record.character,
      hp: {
        ...record.character.hp,
        current: 7,
      },
    },
    overlay: {
      ...record.overlay,
      footprint: {
        width: 2,
        height: 1,
      },
      position: {
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        x: 2,
        y: 3,
      },
      activeConditions: ['prone', 'marked'],
      concentration: {
        effectName: 'Bless',
      },
      currentVisibility: 'obscured',
    },
  };
}

class InMemoryCharacterRecordDatabase implements CharacterRecordDatabase {
  private readonly rows = new Map<CharacterId, CharacterRecordRow>();
  private clock = 0;

  async upsertCharacterRecord(
    write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow> {
    const existing = this.rows.get(write.characterId);
    const now = this.nextTimestamp();
    const row: CharacterRecordRow = {
      characterId: write.characterId,
      record: this.clone(write.record),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.rows.set(write.characterId, this.clone(row));

    return this.clone(row);
  }

  async getCharacterRecord(
    characterId: CharacterId,
  ): Promise<CharacterRecordRow | null> {
    const row = this.rows.get(characterId);

    return row ? this.clone(row) : null;
  }

  async updateCharacterRecord(
    write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow | null> {
    const existing = this.rows.get(write.characterId);

    if (!existing) {
      return null;
    }

    const row: CharacterRecordRow = {
      characterId: write.characterId,
      record: this.clone(write.record),
      createdAt: existing.createdAt,
      updatedAt: this.nextTimestamp(),
    };

    this.rows.set(write.characterId, this.clone(row));

    return this.clone(row);
  }

  private nextTimestamp(): Date {
    const timestamp = new Date(Date.UTC(2026, 3, 23, 0, 0, this.clock, 0));

    this.clock += 1;

    return timestamp;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

function createDbBackedCharacterRepository(): DbBackedCharacterRepository {
  return new DbBackedCharacterRepository(new InMemoryCharacterRecordDatabase());
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

test('db-backed character repository creates and reloads full records', async () => {
  const repository = createDbBackedCharacterRepository();
  const record = createPlacedStoredCharacterRecord();

  assert.deepEqual(await repository.createCharacter(record), record);

  const fetched = await repository.getCharacter(record.character.id);

  assert.deepEqual(fetched, record);
  assert.deepEqual(fetched.overlay.position, {
    sceneId: 'scene_11111111-1111-4111-8111-111111111111',
    x: 2,
    y: 3,
  });
  assert.deepEqual(fetched.overlay.activeConditions, ['prone', 'marked']);
  assert.equal(fetched.character.hp.current, 7);
});

test('db-backed character repository saves existing records', async () => {
  const repository = createDbBackedCharacterRepository();
  const record = createPlacedStoredCharacterRecord();

  await repository.createCharacter(record);
  await repository.saveCharacter({
    ...record,
    character: {
      ...record.character,
      hp: {
        ...record.character.hp,
        current: 3,
      },
      status: 'ready',
      updatedAt: '2026-04-17T02:00:00.000Z',
    },
    overlay: {
      ...record.overlay,
      position: {
        sceneId: 'scene_22222222-2222-4222-8222-222222222222',
        x: 4,
        y: 5,
      },
      activeConditions: ['grappled'],
    },
  });

  const fetched = await repository.getCharacter(record.character.id);

  assert.equal(fetched.character.status, 'ready');
  assert.equal(fetched.character.hp.current, 3);
  assert.deepEqual(fetched.overlay.activeConditions, ['grappled']);
  assert.deepEqual(fetched.overlay.position, {
    sceneId: 'scene_22222222-2222-4222-8222-222222222222',
    x: 4,
    y: 5,
  });
});

test('db-backed character repository returns clone-safe records', async () => {
  const repository = createDbBackedCharacterRepository();
  const created = await repository.createCharacter(
    createPlacedStoredCharacterRecord(),
  );

  created.character.name = 'Locally Mutated';
  created.overlay.activeConditions.push('locally-mutated');

  const fetched = await repository.getCharacter(
    'char_11111111-1111-4111-8111-111111111111',
  );

  assert.equal(fetched.character.name, 'Aria');
  assert.deepEqual(fetched.overlay.activeConditions, ['prone', 'marked']);

  fetched.overlay.activeConditions.push('second-local-mutation');

  assert.deepEqual(
    (await repository.getCharacter('char_11111111-1111-4111-8111-111111111111'))
      .overlay.activeConditions,
    ['prone', 'marked'],
  );
});

test('db-backed character repository rejects missing reads and saves', async () => {
  const repository = createDbBackedCharacterRepository();

  await assert.rejects(
    async () => {
      await repository.getCharacter(
        'char_22222222-2222-4222-8222-222222222222',
      );
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'character_not_found',
  );

  await assert.rejects(
    async () => {
      await repository.saveCharacter(createStoredCharacterRecord());
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'character_not_found',
  );
});

test('db-backed character repository create overwrites existing ids to match in-memory behavior', async () => {
  const repository = createDbBackedCharacterRepository();
  const record = createStoredCharacterRecord();

  await repository.createCharacter(record);
  await repository.createCharacter({
    ...record,
    character: {
      ...record.character,
      name: 'Replacement Aria',
      updatedAt: '2026-04-17T03:00:00.000Z',
    },
    overlay: {
      ...record.overlay,
      activeConditions: ['replacement'],
    },
  });

  const fetched = await repository.getCharacter(record.character.id);

  assert.equal(fetched.character.name, 'Replacement Aria');
  assert.deepEqual(fetched.overlay.activeConditions, ['replacement']);
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
