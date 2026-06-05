import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { CharacterLibraryEntry } from '@dnd/protocol';
import { PDFDocument } from 'pdf-lib';

import { createDefaultCharacterBuilderDraft } from './character-builder-helpers';
import {
  createCharacterLibraryEntry,
  listCharacterLibraryEntries,
  submitCharacterLibraryEntryForAssignment,
} from './character-library-api';
import {
  formatCharacterLibrarySaveFailure,
  getPortraitFileValidationMessage,
  getPortraitDataUrlValidationMessage,
} from './character-library-errors';
import {
  characterLibraryEntryToCard,
  characterLibraryEntryToDraft,
  createUploadedPortraitReferenceFromDataUrl,
  draftToCharacterLibraryEntryInput,
  getPortraitImageSource,
} from './character-library-mappers';
import {
  buildCharacterSheetPreviewModel,
  generateCharacterSheetPdf,
  mapCharacterSheetFields,
  selectCharacterSheetPdfTemplate,
  type CharacterSheetTemplateDescriptor,
  type CharacterSheetTemplateId,
} from './character-sheet-pdf';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createEntry(
  overrides: Partial<CharacterLibraryEntry> = {},
): CharacterLibraryEntry {
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
    ...overrides,
  };
}

async function loadProvidedTemplate(
  template: CharacterSheetTemplateDescriptor,
): Promise<Uint8Array> {
  const fileNameByTemplate: Partial<Record<CharacterSheetTemplateId, string>> =
    {
      'dnd-2014-template': 'dnd_5e_charactersheet_formfillable.pdf',
      'dnd-2024-template': 'DnD_2024_Character-Sheet.pdf',
    };
  const fileName = fileNameByTemplate[template.id];

  if (!fileName) {
    throw new Error(`No fixture template for ${template.id}`);
  }

  return new Uint8Array(
    await readFile(
      fileURLToPath(
        new URL(
          `../public/assets/character-sheets/${fileName}`,
          import.meta.url,
        ),
      ),
    ),
  );
}

async function createBlankTemplate(): Promise<Uint8Array> {
  const document = await PDFDocument.create();

  document.addPage([603, 774]);
  document.addPage([603, 774]);

  return document.save();
}

describe('character library mappers', () => {
  it('does not store species fallback portrait metadata when no portrait is present', () => {
    const draft = createDefaultCharacterBuilderDraft({
      portrait: null,
      speciesOrRace: 'Human',
    });
    const input = draftToCharacterLibraryEntryInput(draft);

    assert.equal(input.portrait, null);
  });

  it('maps persisted entries back to builder drafts and library cards', () => {
    const entry = createEntry();
    const draft = characterLibraryEntryToDraft(entry);
    const card = characterLibraryEntryToCard(entry);

    assert.equal(draft.id, entry.id);
    assert.equal(draft.ownerParticipantId, 'dev-player-001');
    assert.equal(card.name, 'Persisted Test Hero');
    assert.equal(card.status, 'draft');
    assert.equal(card.portrait, null);
    assert.equal(card.portraitAssetKey, undefined);
    assert.equal(getPortraitImageSource(card.portrait), null);
  });

  it('shows only explicit uploaded or portrait asset images on library cards', () => {
    const uploadedPortrait = createUploadedPortraitReferenceFromDataUrl(
      'data:image/png;base64,aGVybw==',
    );
    if (uploadedPortrait?.kind !== 'uploaded') {
      throw new Error('Expected uploaded portrait fixture');
    }
    const uploadedCard = characterLibraryEntryToCard(
      createEntry({
        portrait: uploadedPortrait,
      }),
    );
    const portraitAssetCard = characterLibraryEntryToCard(
      createEntry({
        portrait: {
          assetKey: 'portrait.elara',
          kind: 'asset',
        },
      }),
    );
    const speciesAssetCard = characterLibraryEntryToCard(
      createEntry({
        portrait: {
          assetKey: 'species.human',
          kind: 'asset',
        },
      }),
    );

    assert.equal(
      getPortraitImageSource(uploadedCard.portrait),
      uploadedPortrait.dataUrl,
    );
    assert.equal(
      getPortraitImageSource(portraitAssetCard.portrait),
      '/assets/character-builder/portraits/elara-nightbloom.webp',
    );
    assert.equal(speciesAssetCard.portraitAssetKey, undefined);
    assert.equal(getPortraitImageSource(speciesAssetCard.portrait), null);
  });

  it('normalizes uploaded portrait data URLs for persisted library entries', () => {
    const portrait = createUploadedPortraitReferenceFromDataUrl(
      'data:image/png;base64,aGVybw==',
      {
        fileName: 'hero.png',
        uploadedAt: new Date(0).toISOString(),
      },
    );

    assert.deepEqual(portrait, {
      dataUrl: 'data:image/png;base64,aGVybw==',
      fileName: 'hero.png',
      kind: 'uploaded',
      mimeType: 'image/png',
      sizeBytes: 4,
      uploadedAt: new Date(0).toISOString(),
    });
    assert.equal(getPortraitImageSource(portrait), portrait?.dataUrl);
  });

  it('uses stored uploaded portrait URLs after server-side storage', () => {
    assert.equal(
      getPortraitImageSource({
        fileName: 'stored.webp',
        kind: 'uploaded',
        mimeType: 'image/webp',
        sizeBytes: 512,
        storageKey:
          'usr_00000000-0000-4000-8000-000000000000/charlib_00000000-0000-4000-8000-000000000001/stored.webp',
        uploadedAt: new Date(0).toISOString(),
        url: '/api/character-library/portraits/usr_00000000-0000-4000-8000-000000000000/charlib_00000000-0000-4000-8000-000000000001/stored.webp',
      }),
      'http://localhost:2567/api/character-library/portraits/usr_00000000-0000-4000-8000-000000000000/charlib_00000000-0000-4000-8000-000000000001/stored.webp',
    );
  });

  it('rejects unsupported uploaded portrait data URLs before persistence', () => {
    assert.equal(
      createUploadedPortraitReferenceFromDataUrl(
        'data:image/gif;base64,R0lGODlhAQABAIA=',
      ),
      null,
    );
  });

  it('explains oversized uploaded portrait validation errors', () => {
    assert.match(
      getPortraitDataUrlValidationMessage(
        `data:image/png;base64,${'a'.repeat(1_500_001)}`,
        false,
      ) ?? '',
      /portrait image is too large/i,
    );
    assert.match(
      formatCharacterLibrarySaveFailure(
        'String must contain at most 1500000 character(s)',
        false,
      ),
      /portrait image is too large/i,
    );
    assert.equal(
      getPortraitFileValidationMessage(
        {
          size: 7_000_000,
          type: 'image/png',
        },
        false,
      ),
      null,
    );
    assert.match(
      getPortraitFileValidationMessage(
        {
          size: 8_000_001,
          type: 'image/png',
        },
        false,
      ) ?? '',
      /selected image is too large/i,
    );
  });

  it('selects 2024 and 2014 sheet templates from the rules profile', () => {
    assert.equal(
      selectCharacterSheetPdfTemplate('dnd-2025-srd-5-2-1').id,
      'dnd-2024-template',
    );
    assert.equal(
      selectCharacterSheetPdfTemplate('dnd-2014-srd-5-1').id,
      'dnd-2014-template',
    );
    assert.equal(
      selectCharacterSheetPdfTemplate(undefined).id,
      'dnd-2024-template',
    );
    assert.equal(
      selectCharacterSheetPdfTemplate('dnd-2014-basic-rules', [
        'dnd-2024-template',
      ]).id,
      'dnd-2024-template',
    );
  });

  it('maps persisted character fields for template filling', () => {
    const mapped = mapCharacterSheetFields(createEntry());

    assert.equal(mapped.fieldValues.CharacterName, 'Persisted Test Hero');
    assert.equal(mapped.fieldValues.ClassLevel, 'Fighter 1');
    assert.equal(mapped.fieldValues['Race '], 'Human');
    assert.equal(mapped.fieldValues.AC, '16');
    assert.equal(mapped.fieldValues.ProfBonus, '+2');
  });

  it('builds a web preview model from the same character sheet fields', () => {
    const preview = buildCharacterSheetPreviewModel(
      createEntry({
        rulesProfileId: 'dnd-2014-srd-5-1',
      }),
      'dnd-2014-template',
    );

    assert.equal(preview.title, 'Persisted Test Hero');
    assert.equal(preview.templateEra, '2014');
    assert.equal(
      preview.identity.find((field) => field.label === 'Character Name')?.value,
      'Persisted Test Hero',
    );
    assert.equal(preview.abilities.length, 6);
    assert.equal(
      preview.combat.find((field) => field.label === 'Armor Class')?.value,
      '16',
    );
    assert.ok(preview.skills.some((field) => field.label === 'Athletics'));
  });

  it('fills the provided 2014 AcroForm template with key fields', async () => {
    const result = await generateCharacterSheetPdf(
      createEntry({
        rulesProfileId: 'dnd-2014-srd-5-1',
      }),
      {
        availableTemplateIds: ['dnd-2014-template'],
        loadTemplateBytes: loadProvidedTemplate,
        preserveFormFields: true,
      },
    );
    const pdfText = Buffer.from(result.bytes).toString('latin1');
    const document = await PDFDocument.load(result.bytes);
    const form = document.getForm();

    assert.equal(result.template.id, 'dnd-2014-template');
    assert.ok(result.bytes.length > 100_000);
    assert.ok(pdfText.startsWith('%PDF-'));
    assert.equal(
      form.getTextField('CharacterName').getText(),
      'Persisted Test Hero',
    );
    assert.equal(form.getTextField('ClassLevel').getText(), 'Fighter 1');
    assert.equal(form.getTextField('Race ').getText(), 'Human');
  });

  it('keeps template exports on the official sheet when text has smart punctuation', async () => {
    const result = await generateCharacterSheetPdf(
      createEntry({
        notes: 'Curly’s dash — test',
        rulesProfileId: 'dnd-2014-srd-5-1',
      }),
      {
        availableTemplateIds: ['dnd-2014-template'],
        loadTemplateBytes: loadProvidedTemplate,
        preserveFormFields: true,
        templateId: 'dnd-2014-template',
      },
    );
    const document = await PDFDocument.load(result.bytes);
    const form = document.getForm();

    assert.equal(result.template.id, 'dnd-2014-template');
    assert.equal(result.fallbackReason, undefined);
    assert.equal(form.getTextField('Bonds').getText(), "Curly's dash - test");
  });

  it('flattens explicit 2014 template exports so filled text is visible in PDF viewers', async () => {
    const result = await generateCharacterSheetPdf(
      createEntry({
        rulesProfileId: 'dnd-2014-srd-5-1',
      }),
      {
        availableTemplateIds: ['dnd-2014-template'],
        loadTemplateBytes: loadProvidedTemplate,
        templateId: 'dnd-2014-template',
      },
    );
    const document = await PDFDocument.load(result.bytes);

    assert.equal(result.template.id, 'dnd-2014-template');
    assert.equal(document.getForm().getFields().length, 0);
  });

  it('overlays the 2024 template when no AcroForm fields are available', async () => {
    const result = await generateCharacterSheetPdf(createEntry(), {
      availableTemplateIds: ['dnd-2024-template'],
      loadTemplateBytes: async () => createBlankTemplate(),
    });

    assert.equal(result.template.id, 'dnd-2024-template');
    assert.ok(Buffer.from(result.bytes).toString('latin1').startsWith('%PDF-'));
    assert.ok(result.bytes.length > 700);
  });

  it('falls back to the simple PDF when template loading fails', async () => {
    const result = await generateCharacterSheetPdf(createEntry(), {
      loadTemplateBytes: async () => {
        throw new Error('missing fixture template');
      },
    });
    const pdfText = Buffer.from(result.bytes).toString('latin1');

    assert.equal(result.template.id, 'simple-fallback');
    assert.match(result.fallbackReason ?? '', /missing fixture template/);
    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.match(pdfText, /Persisted Test Hero/);
  });

  it('falls back to the simple PDF when an explicit template cannot be filled', async () => {
    const result = await generateCharacterSheetPdf(createEntry(), {
      loadTemplateBytes: async () => new Uint8Array([60, 33, 45, 45]),
      templateId: 'dnd-2024-template',
    });
    const pdfText = Buffer.from(result.bytes).toString('latin1');

    assert.equal(result.template.id, 'simple-fallback');
    assert.match(result.fallbackReason ?? '', /Template PDF filling failed/);
    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.match(pdfText, /Persisted Test Hero/);
  });

  it('handles missing optional character fields without crashing PDF generation', async () => {
    const result = await generateCharacterSheetPdf(
      createEntry({
        concept: '',
        notes: null,
        portrait: null,
      }),
      {
        forceFallback: true,
      },
    );

    assert.equal(result.template.id, 'simple-fallback');
    assert.ok(result.bytes.length > 500);
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

  it('submits finalized library entries through the runtime character command route', async () => {
    const calls: string[] = [];

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));

      calls.push(
        `${init?.method ?? 'GET'} ${new URL(url).pathname} ${body.type}`,
      );

      assert.equal(body.actor.participantId, 'player-001');
      assert.equal(body.payload.ownerParticipantId, 'usr_00000000');
      assert.equal(
        body.payload.entryId,
        'charlib_00000000-0000-4000-8000-000000000001',
      );

      return new Response(
        JSON.stringify({
          data: {
            characterId: 'char_00000000-0000-4000-8000-000000000002',
            participantId: 'player-001',
            sessionId: 'ABC123',
            state: {
              participants: [
                {
                  characterId: null,
                  connectionStatus: 'connected',
                  displayName: 'Player One',
                  id: 'player-001',
                  joinedAt: '2026-01-01T00:00:00.000Z',
                  lastSeenAt: '2026-01-01T00:00:00.000Z',
                  pendingCharacterId:
                    'char_00000000-0000-4000-8000-000000000002',
                  role: 'player',
                },
              ],
              session: {
                activeSceneId: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                dmParticipantId: 'dm-001',
                id: 'ABC123',
                playerParticipantIds: ['player-001'],
                revision: 2,
                rulesProfileId: 'dnd5e-2024-core',
                status: 'lobby',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            },
          },
          ok: true,
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      );
    }) as typeof fetch;

    const submitted = await submitCharacterLibraryEntryForAssignment({
      actorParticipantId: 'player-001',
      entryId: 'charlib_00000000-0000-4000-8000-000000000001',
      ownerParticipantId: 'usr_00000000',
      sessionId: 'ABC123',
    });

    assert.equal(submitted.ok, true);

    if (submitted.ok) {
      assert.equal(
        submitted.data.characterId,
        'char_00000000-0000-4000-8000-000000000002',
      );
    }

    assert.deepEqual(calls, [
      'POST /api/characters/command submit_character_library_entry_for_assignment',
    ]);
  });
});
