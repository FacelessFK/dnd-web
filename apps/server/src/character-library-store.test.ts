import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CharacterLibraryEntryDatabase,
  CharacterLibraryEntryRow,
  CharacterLibraryEntryWrite,
} from '@dnd/db';
import type {
  CharacterLibraryCommand,
  CharacterLibraryCommandResponse,
  CharacterLibraryEntryInput,
} from '@dnd/protocol';

import {
  CharacterLibraryService,
  DbBackedCharacterLibraryRepository,
} from './character-library-store.js';
import { createSessionServer } from './session-server.js';

const ownerParticipantId = 'dev-player-001';

function createEntryInput(
  overrides: Partial<CharacterLibraryEntryInput> = {},
): CharacterLibraryEntryInput {
  return {
    abilities: {
      cha: 10,
      con: 14,
      dex: 14,
      int: 12,
      str: 15,
      wis: 10,
    },
    abilityScoreMethod: 'standard-array',
    armorClass: 16,
    background: 'Soldier',
    builderSelections: {
      cantrips: [],
      equipment: ['Chain Mail', 'Shield', 'Explorer Pack'],
      languages: ['Common'],
      skills: ['Athletics', 'Intimidation'],
      spells: [],
      tools: ["Smith's Tools"],
    },
    builderStep: 'review',
    className: 'Fighter',
    concept: 'A steady defender with a battered shield.',
    hp: {
      current: 12,
      max: 12,
      temp: 0,
    },
    level: 1,
    name: 'Persisted Test Fighter',
    notes: 'Created by the character library command tests.',
    portrait: {
      assetKey: 'species.human',
      kind: 'asset',
    },
    pronouns: 'they / them',
    rulesProfileId: 'dnd-2025-srd-5-2-1',
    speciesOrRace: 'Human',
    speed: 30,
    ...overrides,
  };
}

function command<TType extends CharacterLibraryCommand['type']>(
  type: TType,
  payload: Extract<CharacterLibraryCommand, { type: TType }>['payload'],
  commandId: string,
): Extract<CharacterLibraryCommand, { type: TType }> {
  return {
    actor: {
      participantId: ownerParticipantId,
    },
    commandId,
    payload,
    type,
  } as Extract<CharacterLibraryCommand, { type: TType }>;
}

test('character library command route creates, lists, updates, finalizes, and idempotently replays entries', async () => {
  const app = createSessionServer();

  await new Promise<void>((resolve) => app.server.listen(0, resolve));

  try {
    const baseUrl = getServerBaseUrl(app.server);
    const createCommand = command(
      'create_character_library_entry',
      {
        entry: createEntryInput(),
        ownerParticipantId,
      },
      'character-library-create-idempotent',
    );
    const created = await postCommand(baseUrl, createCommand);

    assert.equal(created.status, 200);
    assert.equal(created.body.ok, true);
    assert.ok('entry' in created.body.data);
    const entry = created.body.data.entry;

    assert.match(entry.id, /^charlib_[a-f0-9-]{36}$/);
    assert.equal(entry.ownerParticipantId, ownerParticipantId);
    assert.equal(entry.status, 'draft');

    const replayedCreate = await postCommand(baseUrl, createCommand);

    assert.equal(replayedCreate.status, 200);
    assert.deepEqual(replayedCreate.body, created.body);

    const listed = await postCommand(
      baseUrl,
      command(
        'list_character_library_entries',
        { ownerParticipantId },
        'character-library-list',
      ),
    );

    assert.equal(listed.status, 200);
    assert.equal(listed.body.ok, true);
    assert.ok('entries' in listed.body.data);
    assert.equal(listed.body.data.entries.length, 1);

    const updated = await postCommand(
      baseUrl,
      command(
        'update_character_library_entry',
        {
          entry: createEntryInput({
            concept: 'Updated and saved to the reusable library.',
          }),
          entryId: entry.id,
          ownerParticipantId,
        },
        'character-library-update-idempotent',
      ),
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.ok, true);
    assert.ok('entry' in updated.body.data);
    assert.equal(
      updated.body.data.entry.concept,
      'Updated and saved to the reusable library.',
    );

    const finalized = await postCommand(
      baseUrl,
      command(
        'finalize_character_library_entry',
        {
          entryId: entry.id,
          ownerParticipantId,
        },
        'character-library-finalize-idempotent',
      ),
    );

    assert.equal(finalized.status, 200);
    assert.equal(finalized.body.ok, true);
    assert.ok('entry' in finalized.body.data);
    assert.equal(finalized.body.data.entry.status, 'finalized');

    const replayedFinalize = await postCommand(
      baseUrl,
      command(
        'finalize_character_library_entry',
        {
          entryId: entry.id,
          ownerParticipantId,
        },
        'character-library-finalize-idempotent',
      ),
    );

    assert.deepEqual(replayedFinalize.body, finalized.body);
  } finally {
    await new Promise<void>((resolve, reject) =>
      app.server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('character library command route validates uploaded portrait metadata', async () => {
  const app = createSessionServer();

  await new Promise<void>((resolve) => app.server.listen(0, resolve));

  try {
    const response = await postCommand(
      getServerBaseUrl(app.server),
      command(
        'create_character_library_entry',
        {
          entry: createEntryInput({
            portrait: {
              dataUrl: 'data:text/plain;base64,ZmFrZQ==',
              kind: 'uploaded',
              mimeType: 'image/png',
              sizeBytes: 16,
              uploadedAt: new Date(0).toISOString(),
            },
          }),
          ownerParticipantId,
        },
        'character-library-invalid-portrait',
      ),
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error.code, 'invalid_character_library_entry');
  } finally {
    await new Promise<void>((resolve, reject) =>
      app.server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('DB-backed character library repository reads entries after service restart', async () => {
  const database = new MemoryCharacterLibraryEntryDatabase();
  const firstService = new CharacterLibraryService(
    new DbBackedCharacterLibraryRepository(database),
  );
  const created = await firstService.createEntry(
    command(
      'create_character_library_entry',
      {
        entry: createEntryInput(),
        ownerParticipantId,
      },
      'db-create',
    ),
  );
  const restartedService = new CharacterLibraryService(
    new DbBackedCharacterLibraryRepository(database),
  );
  const listed = await restartedService.listEntries(
    command(
      'list_character_library_entries',
      {
        ownerParticipantId,
      },
      'db-list',
    ),
  );
  const loaded = await restartedService.getEntry(
    command(
      'get_character_library_entry',
      {
        entryId: created.id,
        ownerParticipantId,
      },
      'db-get',
    ),
  );

  assert.equal(listed.length, 1);
  assert.equal(loaded.id, created.id);
  assert.equal(loaded.name, 'Persisted Test Fighter');
});

class MemoryCharacterLibraryEntryDatabase implements CharacterLibraryEntryDatabase {
  private readonly rows = new Map<string, CharacterLibraryEntryRow>();

  async getCharacterLibraryEntry(
    params: Pick<CharacterLibraryEntryWrite, 'entryId' | 'ownerParticipantId'>,
  ): Promise<CharacterLibraryEntryRow | null> {
    const row = this.rows.get(params.entryId);

    if (!row || row.ownerParticipantId !== params.ownerParticipantId) {
      return null;
    }

    return structuredClone(row);
  }

  async insertCharacterLibraryEntry(
    write: CharacterLibraryEntryWrite,
  ): Promise<CharacterLibraryEntryRow | null> {
    if (this.rows.has(write.entryId)) {
      return null;
    }

    const row = this.toRow(write);
    this.rows.set(write.entryId, structuredClone(row));

    return structuredClone(row);
  }

  async listCharacterLibraryEntries(
    ownerParticipantId: string,
  ): Promise<CharacterLibraryEntryRow[]> {
    return [...this.rows.values()]
      .filter((row) => row.ownerParticipantId === ownerParticipantId)
      .map((row) => structuredClone(row));
  }

  async updateCharacterLibraryEntry(
    write: CharacterLibraryEntryWrite,
  ): Promise<CharacterLibraryEntryRow | null> {
    const existing = this.rows.get(write.entryId);

    if (!existing || existing.ownerParticipantId !== write.ownerParticipantId) {
      return null;
    }

    const row = {
      ...this.toRow(write),
      createdAt: existing.createdAt,
    };
    this.rows.set(write.entryId, structuredClone(row));

    return structuredClone(row);
  }

  private toRow(write: CharacterLibraryEntryWrite): CharacterLibraryEntryRow {
    return {
      createdAt: new Date(0),
      entry: structuredClone(write.entry),
      entryId: write.entryId,
      ownerParticipantId: write.ownerParticipantId,
      updatedAt: new Date(),
    };
  }
}

async function postCommand(
  baseUrl: string,
  body: CharacterLibraryCommand,
): Promise<{
  body: CharacterLibraryCommandResponse;
  status: number;
}> {
  const response = await fetch(`${baseUrl}/api/character-library/command`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  return {
    body: (await response.json()) as CharacterLibraryCommandResponse,
    status: response.status,
  };
}

function getServerBaseUrl(
  server: ReturnType<typeof createSessionServer>['server'],
): string {
  const address = server.address();

  assert(address && typeof address === 'object');

  return `http://127.0.0.1:${address.port}`;
}
