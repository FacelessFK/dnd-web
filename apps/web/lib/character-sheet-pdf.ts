import type { CharacterLibraryEntry } from '@dnd/protocol';

import { abilityKeys } from './character-builder-data';
import { formatAbilityModifier } from './character-builder-helpers';
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

const pageWidth = 612;
const pageHeight = 792;

export function getCharacterSheetPdfFileName(
  entry: Pick<CharacterLibraryEntry, 'name' | 'id'>,
): string {
  const slug =
    entry.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || entry.id;

  return `${slug}-character-sheet.pdf`;
}

export function generateCharacterSheetPdf(
  entry: CharacterLibraryEntry,
): Uint8Array {
  const draft = characterLibraryEntryToDraft(entry);
  const review = deriveCharacterRuleReviewSummary(draft);
  const preview = deriveRuleDerivedPreview(draft);
  const lines = buildPdfLines(entry, review, preview);
  const content = buildPageContent(lines);

  return new TextEncoder().encode(buildPdfDocument(content));
}

export function downloadCharacterSheetPdf(entry: CharacterLibraryEntry): void {
  const pdfBytes = generateCharacterSheetPdf(entry);
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = getCharacterSheetPdfFileName(entry);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildPdfLines(
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
        text: `${ability.toUpperCase()} ${score} (${formatAbilityModifier(score)})`,
        x: 64 + (index % 2) * 160,
        y: 510 - Math.floor(index / 2) * 18,
      };
    }),
    { size: 13, text: 'Saving Throws', x: 48, y: 438 },
    {
      text: joinOrNone(
        review.savingThrows.map((ability) => ability.toUpperCase()),
      ),
      x: 64,
      y: 420,
    },
    { size: 13, text: 'Skills', x: 48, y: 390 },
    { text: joinOrNone(review.skills), x: 64, y: 372 },
    { size: 13, text: 'Languages and Tools', x: 48, y: 342 },
    { text: `Languages: ${joinOrNone(review.languages)}`, x: 64, y: 324 },
    { text: `Tools: ${joinOrNone(review.tools)}`, x: 64, y: 306 },
    { size: 13, text: 'Equipment', x: 48, y: 276 },
    { text: joinOrNone(review.equipment), x: 64, y: 258 },
    { size: 13, text: 'Spells', x: 48, y: 228 },
    { text: `Cantrips: ${joinOrNone(review.spells.cantrips)}`, x: 64, y: 210 },
    { text: `Leveled: ${joinOrNone(review.spells.leveled)}`, x: 64, y: 192 },
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

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function joinOrNone(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'None';
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
