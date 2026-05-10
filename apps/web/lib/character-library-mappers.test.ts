import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import type { CharacterLibraryEntry } from '@dnd/protocol';

import { createDefaultCharacterBuilderDraft } from './character-builder-helpers';
import {
  createCharacterLibraryEntry,
  listCharacterLibraryEntries,
} from './character-library-api';
import {
  characterLibraryEntryToCard,
  characterLibraryEntryToDraft,
  draftToCharacterLibraryEntryInput,
  getPortraitImageSource,
} from './character-library-mappers';
import { generateCharacterSheetPdf } from './character-sheet-pdf';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createEntry(): CharacterLibraryEntry {
  const input = draftToCharacterLibraryEntryInput(
    createDefaultCharacterBuilderDraft({
      className: 'Fighter',
      concept: 'A persisted character for tests.',
      name: 'Persisted Test Hero',
      speciesOrRace: 'Human',
    }),
  );

  return {
    ...input,
    createdAt: new Date(0).toISOString(),
    id: 'charlib_00000000-0000-4000-8000-000000000001',
    ownerParticipantId: 'dev-player-001',
    status: 'draft',
    updatedAt: new Date(0).toISOString(),
  };
}

describe('character library mappers', () => {
  it('stores species fallback portrait metadata when no upload is present', () => {
    const draft = createDefaultCharacterBuilderDraft({
      portrait: null,
      speciesOrRace: 'Human',
    });
    const input = draftToCharacterLibraryEntryInput(draft);

    assert.deepEqual(input.portrait, {
      assetKey: 'species.human',
      kind: 'asset',
    });
  });

  it('maps persisted entries back to builder drafts and library cards', () => {
    const entry = createEntry();
    const draft = characterLibraryEntryToDraft(entry);
    const card = characterLibraryEntryToCard(entry);

    assert.equal(draft.id, entry.id);
    assert.equal(draft.ownerParticipantId, 'dev-player-001');
    assert.equal(card.name, 'Persisted Test Hero');
    assert.equal(card.status, 'draft');
    assert.equal(
      getPortraitImageSource(card.portrait),
      '/assets/character-builder/species/human.webp',
    );
  });

  it('generates a repo-owned PDF containing key character fields', () => {
    const pdfText = Buffer.from(
      generateCharacterSheetPdf(createEntry()),
    ).toString('latin1');

    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.match(pdfText, /Persisted Test Hero/);
    assert.match(pdfText, /Human Fighter 1/);
    assert.match(pdfText, /Armor|AC|HP/);
  });
});

describe('character library API helpers', () => {
  it('sends list and create commands to the character library route', async () => {
    const calls: string[] = [];
    const entry = createEntry();

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));

      calls.push(
        `${init?.method ?? 'GET'} ${new URL(url).pathname} ${body.type}`,
      );

      const payload =
        body.type === 'list_character_library_entries'
          ? {
              data: {
                entries: [entry],
              },
              ok: true,
            }
          : {
              data: {
                entry,
              },
              ok: true,
            };

      return new Response(JSON.stringify(payload), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      });
    }) as typeof fetch;

    const listed = await listCharacterLibraryEntries('dev-player-001');
    const created = await createCharacterLibraryEntry(
      'dev-player-001',
      draftToCharacterLibraryEntryInput(characterLibraryEntryToDraft(entry)),
    );

    assert.equal(listed.ok, true);
    assert.equal(created.ok, true);
    assert.deepEqual(calls, [
      'POST /api/character-library/command list_character_library_entries',
      'POST /api/character-library/command create_character_library_entry',
    ]);
  });
});
