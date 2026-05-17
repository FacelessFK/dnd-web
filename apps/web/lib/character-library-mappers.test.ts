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
} from './character-library-api';
import {
  characterLibraryEntryToCard,
  characterLibraryEntryToDraft,
  createUploadedPortraitReferenceFromDataUrl,
  draftToCharacterLibraryEntryInput,
  getPortraitImageSource,
} from './character-library-mappers';
import {
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

  it('rejects unsupported uploaded portrait data URLs before persistence', () => {
    assert.equal(
      createUploadedPortraitReferenceFromDataUrl(
        'data:image/gif;base64,R0lGODlhAQABAIA=',
      ),
      null,
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
});
