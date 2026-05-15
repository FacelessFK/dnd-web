import type { CharacterLibraryEntry } from '@dnd/protocol';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFForm,
  type PDFPage,
} from 'pdf-lib';

import { abilityKeys, type AbilityKey } from './character-builder-data';
import {
  getRuleClassById,
  getRuleProfileById,
  getRulesProfileLabel,
} from './character-builder-rules-helpers';
import {
  deriveCharacterRuleReviewSummary,
  deriveRuleDerivedPreview,
} from './character-builder-rules-helpers';
import { characterLibraryEntryToDraft } from './character-library-mappers';

type PdfTextLine = {
  size?: number;
  text: string;
  x: number;
  y: number;
};

export type CharacterSheetTemplateId =
  | 'dnd-2024-template'
  | 'dnd-2014-template'
  | 'simple-fallback';

export type CharacterSheetTemplateDescriptor = {
  era: '2014' | '2024' | 'fallback';
  hasAcroForm: boolean;
  id: CharacterSheetTemplateId;
  label: string;
  publicPath: string | null;
};

export type CharacterSheetMappedFields = {
  fieldValues: Record<string, string>;
  notes: string;
  profileLabel: string;
  savingThrowValues: Record<AbilityKey, string>;
  skillValues: Record<string, string>;
  spellNames: string[];
};

export type CharacterSheetPdfResult = {
  bytes: Uint8Array;
  fallbackReason?: string;
  fileName: string;
  mappedFields: CharacterSheetMappedFields;
  template: CharacterSheetTemplateDescriptor;
};

export type CharacterSheetPdfGenerationOptions = {
  availableTemplateIds?: CharacterSheetTemplateId[];
  forceFallback?: boolean;
  loadTemplateBytes?: (
    template: CharacterSheetTemplateDescriptor,
  ) => Promise<Uint8Array>;
  preserveFormFields?: boolean;
  templateId?: CharacterSheetTemplateId;
};

export const characterSheetPdfTemplates: CharacterSheetTemplateDescriptor[] = [
  {
    era: '2024',
    hasAcroForm: false,
    id: 'dnd-2024-template',
    label: '2024 Character Sheet',
    publicPath: '/assets/character-sheets/DnD_2024_Character-Sheet.pdf',
  },
  {
    era: '2014',
    hasAcroForm: true,
    id: 'dnd-2014-template',
    label: '2014 Fillable Character Sheet',
    publicPath:
      '/assets/character-sheets/dnd_5e_charactersheet_formfillable.pdf',
  },
  {
    era: 'fallback',
    hasAcroForm: false,
    id: 'simple-fallback',
    label: 'DND-web Simple Character Sheet',
    publicPath: null,
  },
];

const pageWidth = 612;
const pageHeight = 792;

const skillAbilityMap: Record<string, AbilityKey> = {
  Acrobatics: 'dex',
  'Animal Handling': 'wis',
  Arcana: 'int',
  Athletics: 'str',
  Deception: 'cha',
  History: 'int',
  Insight: 'wis',
  Intimidation: 'cha',
  Investigation: 'int',
  Medicine: 'wis',
  Nature: 'int',
  Perception: 'wis',
  Performance: 'cha',
  Persuasion: 'cha',
  Religion: 'int',
  'Sleight of Hand': 'dex',
  Stealth: 'dex',
  Survival: 'wis',
};

const dnd2014SkillFieldNames: Record<string, string> = {
  Acrobatics: 'Acrobatics',
  'Animal Handling': 'Animal',
  Arcana: 'Arcana',
  Athletics: 'Athletics',
  Deception: 'Deception ',
  History: 'History ',
  Insight: 'Insight',
  Intimidation: 'Intimidation',
  Investigation: 'Investigation ',
  Medicine: 'Medicine',
  Nature: 'Nature',
  Perception: 'Perception ',
  Performance: 'Performance',
  Persuasion: 'Persuasion',
  Religion: 'Religion',
  'Sleight of Hand': 'SleightofHand',
  Stealth: 'Stealth ',
  Survival: 'Survival',
};

const dnd2014SpellFieldNames = Array.from(
  { length: 100 },
  (_, index) => `Spells 10${14 + index}`,
);

const dnd2014AbilityFields: Record<
  AbilityKey,
  { modifier: string; score: string; savingThrow: string }
> = {
  cha: { modifier: 'CHamod', savingThrow: 'ST Charisma', score: 'CHA' },
  con: { modifier: 'CONmod', savingThrow: 'ST Constitution', score: 'CON' },
  dex: { modifier: 'DEXmod ', savingThrow: 'ST Dexterity', score: 'DEX' },
  int: { modifier: 'INTmod', savingThrow: 'ST Intelligence', score: 'INT' },
  str: { modifier: 'STRmod', savingThrow: 'ST Strength', score: 'STR' },
  wis: { modifier: 'WISmod', savingThrow: 'ST Wisdom', score: 'WIS' },
};

export function getCharacterSheetPdfFileName(
  entry: Pick<CharacterLibraryEntry, 'name' | 'id'>,
  template?: Pick<CharacterSheetTemplateDescriptor, 'era'>,
): string {
  const slug =
    entry.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || entry.id;
  const editionPrefix =
    template && template.era !== 'fallback' ? `${template.era}-` : '';

  return `${slug}-${editionPrefix}character-sheet.pdf`;
}

export function selectCharacterSheetPdfTemplate(
  rulesProfileId: string | undefined,
  availableTemplateIds: CharacterSheetTemplateId[] = characterSheetPdfTemplates.map(
    (template) => template.id,
  ),
): CharacterSheetTemplateDescriptor {
  const profile = getRuleProfileById(rulesProfileId);
  const prefersLegacy =
    profile.status === 'legacy' ||
    profile.year.includes('2014') ||
    profile.id.includes('2014');
  const preferredId: CharacterSheetTemplateId = prefersLegacy
    ? 'dnd-2014-template'
    : 'dnd-2024-template';
  const fallbackId: CharacterSheetTemplateId = prefersLegacy
    ? 'dnd-2024-template'
    : 'dnd-2014-template';
  const selected =
    findAvailableTemplate(preferredId, availableTemplateIds) ??
    findAvailableTemplate(fallbackId, availableTemplateIds) ??
    findAvailableTemplate('simple-fallback', availableTemplateIds) ??
    characterSheetPdfTemplates.find(
      (template) => template.id === 'simple-fallback',
    );

  if (!selected) {
    throw new Error('No character sheet PDF templates are configured.');
  }

  return selected;
}

export function mapCharacterSheetFields(
  entry: CharacterLibraryEntry,
): CharacterSheetMappedFields {
  const draft = characterLibraryEntryToDraft(entry);
  const review = deriveCharacterRuleReviewSummary(draft);
  const preview = deriveRuleDerivedPreview(draft);
  const profile = getRuleProfileById(draft.rulesProfileId);
  const characterClass = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const profileLabel = getRulesProfileLabel(profile);
  const savingThrowValues = Object.fromEntries(
    abilityKeys.map((ability) => {
      const modifier = preview.abilityScores[ability].modifier;
      const value =
        modifier +
        (review.savingThrows.includes(ability) ? review.proficiencyBonus : 0);

      return [ability, formatSigned(value)];
    }),
  ) as Record<AbilityKey, string>;
  const skillValues = Object.fromEntries(
    Object.entries(skillAbilityMap).map(([skill, ability]) => {
      const modifier = preview.abilityScores[ability].modifier;
      const value =
        modifier +
        (review.skills.includes(skill) ? review.proficiencyBonus : 0);

      return [skill, formatSigned(value)];
    }),
  );
  const spellNames = uniqueValues([
    ...review.spells.cantrips,
    ...review.spells.leveled,
  ]);
  const spellcastingAbility = characterClass?.spellcasting?.ability;
  const spellcastingModifier = spellcastingAbility
    ? preview.abilityScores[spellcastingAbility].modifier
    : 0;
  const spellcastingAbilityLabel = spellcastingAbility
    ? spellcastingAbility.toUpperCase()
    : '';
  const portraitLabel =
    entry.portrait?.kind === 'uploaded'
      ? `Uploaded portrait: ${entry.portrait.fileName ?? 'stored upload'}`
      : entry.portrait?.kind === 'asset'
        ? `Portrait asset: ${entry.portrait.assetKey}`
        : 'Portrait: species fallback';
  const notes = [entry.concept, entry.notes ?? '', portraitLabel]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n');
  const fieldValues: Record<string, string> = {
    AC: String(review.armorClass),
    AttacksSpellcasting: summarizeList(spellNames),
    Background: review.background,
    Bonds: entry.notes ?? '',
    CharacterName: entry.name,
    'CharacterName 2': entry.name,
    ClassLevel: `${review.characterClass} ${entry.level}`,
    Equipment: summarizeList(review.equipment),
    'Features and Traits': [
      `${profileLabel}`,
      `${review.species} ${review.characterClass}`,
      `Saving Throws: ${summarizeList(
        review.savingThrows.map((ability) => ability.toUpperCase()),
      )}`,
    ].join('\n'),
    Flaws: '',
    HD: `d${characterClass?.hitDie ?? 8}`,
    HDTotal: `${entry.level}d${characterClass?.hitDie ?? 8}`,
    HPCurrent: String(entry.hp.current || review.hitPoints),
    HPMax: String(review.hitPoints),
    HPTemp: String(entry.hp.temp || ''),
    Ideals: entry.concept,
    Initiative: formatSigned(review.initiative),
    Passive: String(
      10 +
        preview.abilityScores.wis.modifier +
        (review.skills.includes('Perception') ? review.proficiencyBonus : 0),
    ),
    PersonalityTraits: entry.concept,
    'PersonalityTraits ': entry.concept,
    PlayerName: entry.ownerParticipantId,
    ProfBonus: formatSigned(review.proficiencyBonus),
    ProficienciesLang: [
      `Languages: ${summarizeList(review.languages)}`,
      `Tools: ${summarizeList(review.tools)}`,
      `Skills: ${summarizeList(review.skills)}`,
    ].join('\n'),
    'Race ': review.species,
    'SpellAtkBonus 2': spellcastingAbility
      ? formatSigned(review.proficiencyBonus + spellcastingModifier)
      : '',
    'SpellSaveDC  2': spellcastingAbility
      ? String(8 + review.proficiencyBonus + spellcastingModifier)
      : '',
    'Spellcasting Class 2': characterClass?.spellcasting
      ? review.characterClass
      : '',
    'SpellcastingAbility 2': spellcastingAbilityLabel,
    Speed: String(review.speed),
  };

  for (const ability of abilityKeys) {
    const field = dnd2014AbilityFields[ability];
    const score = preview.abilityScores[ability].final;

    fieldValues[field.score] = String(score);
    fieldValues[field.modifier] = formatSigned(
      preview.abilityScores[ability].modifier,
    );
    fieldValues[field.savingThrow] = savingThrowValues[ability];
  }

  for (const [skill, fieldName] of Object.entries(dnd2014SkillFieldNames)) {
    fieldValues[fieldName] = skillValues[skill] ?? '';
  }

  spellNames.forEach((spell, index) => {
    const fieldName = dnd2014SpellFieldNames[index];

    if (fieldName) {
      fieldValues[fieldName] = spell;
    }
  });

  return {
    fieldValues,
    notes,
    profileLabel,
    savingThrowValues,
    skillValues,
    spellNames,
  };
}

export async function generateCharacterSheetPdf(
  entry: CharacterLibraryEntry,
  options: CharacterSheetPdfGenerationOptions = {},
): Promise<CharacterSheetPdfResult> {
  const mappedFields = mapCharacterSheetFields(entry);
  const availableTemplateIds =
    options.availableTemplateIds ??
    characterSheetPdfTemplates.map((template) => template.id);
  const selectedTemplate = options.templateId
    ? findAvailableTemplate(options.templateId, availableTemplateIds)
    : selectCharacterSheetPdfTemplate(
        entry.rulesProfileId,
        availableTemplateIds,
      );

  if (!selectedTemplate) {
    throw new Error(`The requested character sheet template is not available.`);
  }

  const fileName = getCharacterSheetPdfFileName(entry, selectedTemplate);

  if (options.forceFallback || selectedTemplate.id === 'simple-fallback') {
    return {
      bytes: generateSimpleCharacterSheetPdf(entry),
      fallbackReason: options.forceFallback
        ? 'Template filling was explicitly bypassed.'
        : 'No local character sheet template was available.',
      fileName,
      mappedFields,
      template: fallbackTemplate(),
    };
  }

  try {
    const loadTemplateBytes =
      options.loadTemplateBytes ?? defaultLoadTemplateBytes;
    const templateBytes = await loadTemplateBytes(selectedTemplate);
    const pdfDocument = await PDFDocument.load(templateBytes, {
      ignoreEncryption: true,
    });
    const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
    const form = pdfDocument.getForm();

    if (selectedTemplate.hasAcroForm && form.getFields().length > 0) {
      fillAcroForm(form, mappedFields.fieldValues);
      form.updateFieldAppearances(font);

      if (!options.preserveFormFields) {
        form.flatten();
      }
    } else {
      overlayTemplateText(pdfDocument, font, entry, mappedFields);
    }

    return {
      bytes: await pdfDocument.save(),
      fileName,
      mappedFields,
      template: selectedTemplate,
    };
  } catch (error) {
    const fallbackReason =
      error instanceof Error
        ? `Template PDF filling failed: ${error.message}`
        : 'Template PDF filling failed for an unknown reason.';

    if (options.templateId) {
      throw new Error(fallbackReason);
    }

    return {
      bytes: generateSimpleCharacterSheetPdf(entry),
      fallbackReason,
      fileName,
      mappedFields,
      template: fallbackTemplate(),
    };
  }
}

export async function downloadCharacterSheetPdf(
  entry: CharacterLibraryEntry,
  options: CharacterSheetPdfGenerationOptions = {},
): Promise<CharacterSheetPdfResult> {
  const result = await generateCharacterSheetPdf(entry, options);
  const blob = new Blob([result.bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = result.fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return result;
}

function findAvailableTemplate(
  id: CharacterSheetTemplateId,
  availableTemplateIds: CharacterSheetTemplateId[],
): CharacterSheetTemplateDescriptor | undefined {
  return characterSheetPdfTemplates.find(
    (template) => template.id === id && availableTemplateIds.includes(id),
  );
}

async function defaultLoadTemplateBytes(
  template: CharacterSheetTemplateDescriptor,
): Promise<Uint8Array> {
  if (!template.publicPath) {
    throw new Error('The selected template has no public PDF path.');
  }

  if (typeof fetch !== 'function') {
    throw new Error('Browser fetch is unavailable for template loading.');
  }

  const response = await fetch(template.publicPath);

  if (!response.ok) {
    throw new Error(
      `Unable to load ${template.label} (${response.status} ${response.statusText}).`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

function fillAcroForm(
  form: PDFForm,
  fieldValues: Record<string, string>,
): void {
  for (const [fieldName, value] of Object.entries(fieldValues)) {
    try {
      form.getTextField(fieldName).setText(normalizePdfText(value));
    } catch {
      // The provided templates vary by edition; missing fields stay blank.
    }
  }
}

function overlayTemplateText(
  pdfDocument: PDFDocument,
  font: PDFFont,
  entry: CharacterLibraryEntry,
  mappedFields: CharacterSheetMappedFields,
): void {
  const [pageOne, pageTwo] = pdfDocument.getPages();

  if (pageOne) {
    draw2024PageOne(pageOne, font, entry, mappedFields);
  }

  if (pageTwo) {
    draw2024PageTwo(pageTwo, font, mappedFields);
  }
}

function draw2024PageOne(
  page: PDFPage,
  font: PDFFont,
  entry: CharacterLibraryEntry,
  mappedFields: CharacterSheetMappedFields,
): void {
  const { height } = page.getSize();
  const fieldValues = mappedFields.fieldValues;

  drawText(page, font, entry.name, 56, height - 86, 13);
  drawText(page, font, fieldValues.ClassLevel ?? '', 302, height - 86, 9);
  drawText(page, font, fieldValues['Race '] ?? '', 302, height - 111, 9);
  drawText(page, font, fieldValues.Background ?? '', 302, height - 136, 9);
  drawText(page, font, mappedFields.profileLabel, 302, height - 161, 7);

  abilityKeys.forEach((ability, index) => {
    const x = 55;
    const y = height - 193 - index * 78;
    const score = fieldValues[dnd2014AbilityFields[ability].score] ?? '';
    const modifier = fieldValues[dnd2014AbilityFields[ability].modifier] ?? '';

    drawText(page, font, score, x + 24, y, 16);
    drawText(page, font, modifier, x + 25, y - 28, 10);
  });

  drawText(page, font, fieldValues.ProfBonus ?? '', 158, height - 199, 11);
  drawText(page, font, fieldValues.AC ?? '', 272, height - 205, 16);
  drawText(page, font, fieldValues.Initiative ?? '', 337, height - 205, 13);
  drawText(page, font, fieldValues.Speed ?? '', 399, height - 205, 13);
  drawText(page, font, fieldValues.HPMax ?? '', 297, height - 294, 12);
  drawText(page, font, fieldValues.HPCurrent ?? '', 360, height - 294, 12);

  drawWrappedText(page, font, fieldValues.ProficienciesLang ?? '', 155, 364, {
    lineHeight: 10,
    maxLines: 12,
    size: 7,
    width: 120,
  });
  drawWrappedText(page, font, fieldValues.Equipment ?? '', 300, 298, {
    lineHeight: 10,
    maxLines: 12,
    size: 7,
    width: 230,
  });
  drawWrappedText(page, font, mappedFields.notes, 300, 144, {
    lineHeight: 10,
    maxLines: 8,
    size: 7,
    width: 230,
  });
}

function draw2024PageTwo(
  page: PDFPage,
  font: PDFFont,
  mappedFields: CharacterSheetMappedFields,
): void {
  const { height } = page.getSize();
  const fieldValues = mappedFields.fieldValues;

  drawText(
    page,
    font,
    fieldValues['Spellcasting Class 2'] ?? '',
    74,
    height - 89,
    9,
  );
  drawText(
    page,
    font,
    fieldValues['SpellcastingAbility 2'] ?? '',
    262,
    height - 89,
    9,
  );
  drawText(
    page,
    font,
    fieldValues['SpellSaveDC  2'] ?? '',
    379,
    height - 89,
    9,
  );
  drawText(
    page,
    font,
    fieldValues['SpellAtkBonus 2'] ?? '',
    491,
    height - 89,
    9,
  );
  drawWrappedText(
    page,
    font,
    summarizeList(mappedFields.spellNames),
    55,
    height - 140,
    {
      lineHeight: 11,
      maxLines: 28,
      size: 8,
      width: 490,
    },
  );
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
): void {
  page.drawText(normalizePdfText(text).slice(0, 120), {
    color: rgb(0.09, 0.07, 0.05),
    font,
    size,
    x,
    y,
  });
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  options: {
    lineHeight: number;
    maxLines: number;
    size: number;
    width: number;
  },
): void {
  wrapTextByWidth(value, font, options.size, options.width)
    .slice(0, options.maxLines)
    .forEach((line, index) => {
      drawText(
        page,
        font,
        line,
        x,
        y - index * options.lineHeight,
        options.size,
      );
    });
}

function generateSimpleCharacterSheetPdf(
  entry: CharacterLibraryEntry,
): Uint8Array {
  const draft = characterLibraryEntryToDraft(entry);
  const review = deriveCharacterRuleReviewSummary(draft);
  const preview = deriveRuleDerivedPreview(draft);
  const lines = buildSimplePdfLines(entry, review, preview);
  const content = buildPageContent(lines);

  return new TextEncoder().encode(buildPdfDocument(content));
}

function buildSimplePdfLines(
  entry: CharacterLibraryEntry,
  review: ReturnType<typeof deriveCharacterRuleReviewSummary>,
  preview: ReturnType<typeof deriveRuleDerivedPreview>,
): PdfTextLine[] {
  const portraitLabel =
    entry.portrait?.kind === 'uploaded'
      ? `Uploaded portrait: ${entry.portrait.fileName ?? 'stored data URL'}`
      : entry.portrait?.kind === 'asset'
        ? `Portrait asset: ${entry.portrait.assetKey}`
        : 'Portrait: species fallback';

  return [
    { size: 20, text: 'DND-web Character Sheet', x: 48, y: 744 },
    { size: 14, text: entry.name, x: 48, y: 716 },
    {
      text: `${entry.speciesOrRace} ${entry.className} ${entry.level}`,
      x: 48,
      y: 696,
    },
    { text: `Background: ${entry.background}`, x: 48, y: 678 },
    { text: `Rules Profile: ${entry.rulesProfileId}`, x: 48, y: 660 },
    { text: `Status: ${entry.status}`, x: 48, y: 642 },
    { text: portraitLabel, x: 48, y: 624 },
    { size: 13, text: 'Combat Basics', x: 48, y: 594 },
    {
      text: `HP ${entry.hp.max}  AC ${entry.armorClass}  Speed ${entry.speed}`,
      x: 64,
      y: 576,
    },
    {
      text: `Initiative ${formatSigned(review.initiative)}  Proficiency +${review.proficiencyBonus}`,
      x: 64,
      y: 558,
    },
    { size: 13, text: 'Ability Scores', x: 48, y: 528 },
    ...abilityKeys.map((ability, index) => {
      const score = preview.abilityScores[ability].final;

      return {
        text: `${ability.toUpperCase()} ${score} (${formatAbilityScoreModifier(
          score,
        )})`,
        x: 64 + (index % 2) * 160,
        y: 510 - Math.floor(index / 2) * 18,
      };
    }),
    { size: 13, text: 'Saving Throws', x: 48, y: 438 },
    {
      text: summarizeList(
        review.savingThrows.map((ability) => ability.toUpperCase()),
      ),
      x: 64,
      y: 420,
    },
    { size: 13, text: 'Skills', x: 48, y: 390 },
    { text: summarizeList(review.skills), x: 64, y: 372 },
    { size: 13, text: 'Languages and Tools', x: 48, y: 342 },
    {
      text: `Languages: ${summarizeList(review.languages)}`,
      x: 64,
      y: 324,
    },
    { text: `Tools: ${summarizeList(review.tools)}`, x: 64, y: 306 },
    { size: 13, text: 'Equipment', x: 48, y: 276 },
    { text: summarizeList(review.equipment), x: 64, y: 258 },
    { size: 13, text: 'Spells', x: 48, y: 228 },
    {
      text: `Cantrips: ${summarizeList(review.spells.cantrips)}`,
      x: 64,
      y: 210,
    },
    {
      text: `Leveled: ${summarizeList(review.spells.leveled)}`,
      x: 64,
      y: 192,
    },
    { size: 13, text: 'Notes', x: 48, y: 162 },
    ...wrapText(entry.notes ?? entry.concept, 84)
      .slice(0, 4)
      .map((text, index) => ({ text, x: 64, y: 144 - index * 18 })),
  ];
}

function buildPageContent(lines: PdfTextLine[]): string {
  const textCommands = lines
    .flatMap((line) => [
      'BT',
      `/F1 ${line.size ?? 10} Tf`,
      `${line.x} ${line.y} Td`,
      `(${escapePdfText(line.text)}) Tj`,
      'ET',
    ])
    .join('\n');

  return [
    '0.92 0.82 0.62 rg',
    '36 36 540 720 re f',
    '0.11 0.08 0.05 rg',
    '44 44 524 704 re S',
    textCommands,
  ].join('\n');
}

function buildPdfDocument(content: string): string {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(document.length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length + 1}\n`;
  document += '0000000000 65535 f \n';
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return document;
}

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function fallbackTemplate(): CharacterSheetTemplateDescriptor {
  const fallback = characterSheetPdfTemplates.find(
    (template) => template.id === 'simple-fallback',
  );

  if (!fallback) {
    throw new Error('No fallback character sheet template is configured.');
  }

  return fallback;
}

function formatAbilityScoreModifier(score: number): string {
  return formatSigned(Math.floor((score - 10) / 2));
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function summarizeList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'None';
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function wrapText(value: string, length: number): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > length && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function wrapTextByWidth(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  return normalizePdfText(value)
    .split(/\r?\n/)
    .flatMap((line) => {
      const words = line.trim().split(/\s+/);
      const lines: string[] = [];
      let current = '';

      for (const word of words) {
        const next = current ? `${current} ${word}` : word;

        if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = next;
        }
      }

      if (current) {
        lines.push(current);
      }

      return lines;
    });
}

function normalizePdfText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7e\r\n]/g, ' ')
    .replace(/[ \t]+/g, ' ');
}
