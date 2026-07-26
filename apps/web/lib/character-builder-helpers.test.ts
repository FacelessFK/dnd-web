import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CharacterBuilderLibraryEntry } from './character-builder-data';
import {
  createDefaultCharacterBuilderDraft,
  deriveCharacterBuilderSummary,
  filterCharacterLibraryEntries,
  getStatusLabel,
  normalizeCharacterBuilderDraft,
} from './character-builder-helpers';

const libraryEntries: CharacterBuilderLibraryEntry[] = [
  {
    armorClass: 12,
    className: 'Wizard',
    id: 'entry-elara',
    level: 1,
    name: 'Elara Nightbloom',
    portrait: null,
    speciesOrRace: 'Elf',
    status: 'draft',
    summary: 'A moonlit scholar drawn to forgotten arcane ruins.',
  },
  {
    armorClass: 16,
    className: 'Fighter',
    id: 'entry-thorn',
    level: 3,
    name: 'Thorn Blackoak',
    portrait: null,
    speciesOrRace: 'Human',
    status: 'ready',
    summary: 'A weathered sellsword with an oath heavier than steel.',
  },
  {
    armorClass: 14,
    className: 'Rogue',
    id: 'entry-kael',
    level: 4,
    name: 'Kael Emberstep',
    portrait: null,
    speciesOrRace: 'Tiefling',
    status: 'ready',
    summary: 'A smiling blade with ash in his boots and secrets to sell.',
  },
];

describe('character builder helpers', () => {
  it('creates a local mock draft with sensible builder defaults', () => {
    const draft = createDefaultCharacterBuilderDraft();

    assert.equal(draft.name, 'Elara Nightbloom');
    assert.equal(draft.speciesOrRace, 'Elf');
    assert.equal(draft.className, 'Wizard');
    assert.equal(draft.background, 'Sage');
    assert.equal(draft.rulesProfileId, 'dnd-2025-srd-5-2-1');
    assert.equal(draft.abilityScoreMethod, 'standard-array');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.builderStep, 'identity');
    assert.equal(draft.abilities.int, 15);
    assert.deepEqual(draft.builderSelections.skills, [
      'Arcana',
      'History',
      'Investigation',
      'Insight',
    ]);
    assert.deepEqual(draft.builderSelections.spells, [
      'Detect Magic',
      'Mage Armor',
      'Magic Missile',
      'Shield',
    ]);
  });

  it('normalizes numeric draft fields while preserving local-only state', () => {
    const draft = normalizeCharacterBuilderDraft(
      createDefaultCharacterBuilderDraft({
        armorClass: -1,
        hp: {
          current: 99,
          max: 0,
          temp: -2,
        },
        level: 99,
        speed: -10,
      }),
    );

    assert.equal(draft.level, 20);
    assert.equal(draft.armorClass, 1);
    assert.equal(draft.hp.max, 1);
    assert.equal(draft.hp.current, 1);
    assert.equal(draft.hp.temp, 0);
    assert.equal(draft.speed, 0);
  });

  it('clamps out-of-range manual ability scores when normalizing a draft', () => {
    const draft = normalizeCharacterBuilderDraft(
      createDefaultCharacterBuilderDraft({
        abilityScoreMethod: 'manual',
        abilities: {
          cha: 10,
          con: 13,
          dex: 14,
          int: 99,
          str: -4,
          wis: 12,
        },
      }),
    );

    assert.equal(draft.abilities.int, 18);
    assert.equal(draft.abilities.str, 3);
    assert.equal(draft.abilities.dex, 14);
  });

  it('filters library entries by text and status', () => {
    assert.deepEqual(
      filterCharacterLibraryEntries(libraryEntries, {
        query: 'wizard',
        status: 'all',
      }).map((entry) => entry.name),
      ['Elara Nightbloom'],
    );

    assert.deepEqual(
      filterCharacterLibraryEntries(libraryEntries, {
        query: '',
        status: 'ready',
      }).map((entry) => entry.name),
      ['Thorn Blackoak', 'Kael Emberstep'],
    );
  });

  it('derives the review summary from the draft', () => {
    const draft = createDefaultCharacterBuilderDraft();
    const summary = deriveCharacterBuilderSummary(draft);

    assert.equal(summary.name, 'Elara Nightbloom');
    assert.equal(summary.title, 'Level 1 Elf Wizard (Sage)');
    assert.equal(summary.proficiencyBonus, 2);
    assert.equal(summary.initiative, 2);
    assert.equal(summary.hitPoints, 8);
  });

  it('labels library statuses in Persian', () => {
    assert.equal(getStatusLabel('draft'), 'پیش‌نویس');
    assert.equal(getStatusLabel('ready'), 'آماده');
    assert.equal(getStatusLabel('in_session'), 'داخل جلسه');
  });
});
