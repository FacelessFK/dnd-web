import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getCharacterBuilderAssetFallbackLabel,
  getCharacterBuilderAssetPath,
} from './character-builder-assets';
import {
  builderSteps,
  mockCharacterLibraryEntries,
} from './character-builder-data';
import {
  createDefaultCharacterBuilderDraft,
  deriveCharacterBuilderSummary,
  filterCharacterLibraryEntries,
  formatAbilityModifier,
  getBuilderCompletionCount,
  getNextBuilderStep,
  getPreviousBuilderStep,
  getSelectedBackground,
  getSelectedClass,
  getSelectedSpecies,
  isStepComplete,
  normalizeCharacterBuilderDraft,
  toggleBuilderSelection,
  updateAbilityScore,
} from './character-builder-helpers';

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

  it('derives ability modifiers and clamps local ability editing', () => {
    const draft = createDefaultCharacterBuilderDraft({
      abilities: {
        cha: 10,
        con: 13,
        dex: 14,
        int: 20,
        str: 3,
        wis: 12,
      },
    });

    assert.equal(formatAbilityModifier(8), '-1');
    assert.equal(formatAbilityModifier(14), '+2');
    assert.equal(updateAbilityScore(draft, 'int', 5).abilities.int, 15);
    assert.equal(updateAbilityScore(draft, 'str', -5).abilities.str, 8);
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

  it('filters mock library entries by text and status', () => {
    assert.deepEqual(
      filterCharacterLibraryEntries(mockCharacterLibraryEntries, {
        query: 'wizard',
        status: 'all',
      }).map((entry) => entry.name),
      ['Elara Nightbloom'],
    );

    assert.deepEqual(
      filterCharacterLibraryEntries(mockCharacterLibraryEntries, {
        query: '',
        status: 'ready',
      }).map((entry) => entry.name),
      ['Thorn Blackoak', 'Kael Emberstep'],
    );
  });

  it('navigates the nine builder steps predictably', () => {
    assert.equal(builderSteps.length, 9);
    assert.equal(getNextBuilderStep('identity'), 'species');
    assert.equal(getPreviousBuilderStep('identity'), 'identity');
    assert.equal(getNextBuilderStep('review'), 'review');
    assert.equal(getPreviousBuilderStep('review'), 'spells');
  });

  it('derives selected cards and review summary from the draft', () => {
    const draft = createDefaultCharacterBuilderDraft();
    const summary = deriveCharacterBuilderSummary(draft);

    assert.equal(getSelectedSpecies(draft)?.title, 'Elf');
    assert.equal(getSelectedClass(draft)?.title, 'Wizard');
    assert.equal(getSelectedBackground(draft)?.title, 'Sage');
    assert.equal(summary.name, 'Elara Nightbloom');
    assert.equal(summary.title, 'Level 1 Elf Wizard (Sage)');
    assert.equal(summary.proficiencyBonus, 2);
    assert.equal(summary.initiative, 2);
    assert.equal(summary.hitPoints, 8);
  });

  it('tracks step completeness for local scaffold guidance', () => {
    const completeDraft = createDefaultCharacterBuilderDraft();
    const incompleteDraft = createDefaultCharacterBuilderDraft({
      name: '',
    });

    assert.equal(isStepComplete(completeDraft, 'identity'), true);
    assert.equal(isStepComplete(incompleteDraft, 'identity'), false);
    assert.equal(isStepComplete(incompleteDraft, 'species'), true);
    assert.equal(getBuilderCompletionCount(completeDraft), 9);
  });

  it('toggles capped local metadata selections', () => {
    assert.deepEqual(toggleBuilderSelection(['Arcana'], 'Arcana'), []);
    assert.deepEqual(toggleBuilderSelection(['Arcana'], 'History', 2), [
      'Arcana',
      'History',
    ]);
    assert.deepEqual(
      toggleBuilderSelection(['Arcana', 'History'], 'Investigation', 2),
      ['Arcana', 'History'],
    );
  });

  it('provides future asset paths and safe placeholder labels', () => {
    assert.equal(
      getCharacterBuilderAssetPath('portrait.elara'),
      '/assets/character-builder/portraits/elara-nightbloom.webp',
    );
    assert.equal(
      getCharacterBuilderAssetFallbackLabel('equipment.arcane_focus'),
      'Arcane Focus',
    );
  });
});
