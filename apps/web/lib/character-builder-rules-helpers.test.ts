import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDefaultCharacterBuilderDraft } from './character-builder-helpers';
import {
  defaultRulesProfileId,
  rulesBackgrounds,
  rulesClasses,
  rulesProfiles,
  rulesSourceInfo,
  rulesSpecies,
  rulesSpells,
} from './character-builder-rules-data';
import {
  changeAbilityScoreMethod,
  deriveAbilityScoreAssignmentState,
  deriveAbilityScorePreview,
  deriveArmorClassPreview,
  deriveCharacterRuleReviewSummary,
  deriveDefaultBuilderSelections,
  deriveHitPointPreview,
  deriveProficiencyChoiceState,
  deriveSpeedPreview,
  getAvailableRuleClasses,
  getAvailableRuleSpecies,
  getAvailableSpellsForClass,
  getProficiencyBonus,
  getRuleAbilityModifier,
  getRuleBackgroundById,
  getRuleClassById,
  getRuleProfileById,
  getRuleSpeciesById,
  sanitizeRuleSelections,
  sanitizeDraftForRulesProfile,
  toggleRuleSelection,
  validateCharacterBuilderDraft,
} from './character-builder-rules-helpers';

describe('character builder rules data and helpers', () => {
  it('loads a basic SRD 5.2.1 rules data shape', () => {
    assert.equal(rulesSourceInfo.license.includes('CC-BY-4.0'), true);
    assert.equal(rulesProfiles.length, 5);
    assert.equal(getRuleProfileById(defaultRulesProfileId).status, 'current');
    assert.equal(rulesSpecies.length, 9);
    assert.equal(rulesClasses.length, 12);
    assert.deepEqual(
      rulesBackgrounds.map((background) => background.id).sort(),
      ['Acolyte', 'Criminal', 'Sage', 'Soldier'],
    );
    assert.equal(
      rulesSpells.some(
        (spell) =>
          spell.name === 'Magic Missile' &&
          spell.level === 1 &&
          spell.classes.includes('Wizard'),
      ),
      true,
    );
  });

  it('looks up species and applies species speed or fallback speed', () => {
    const goliath = getRuleSpeciesById('Goliath');
    const draft = createDefaultCharacterBuilderDraft({
      speciesOrRace: 'Goliath',
    });

    assert.equal(goliath?.speed, 35);
    assert.equal(deriveSpeedPreview(draft), 35);
    assert.equal(
      deriveSpeedPreview(
        createDefaultCharacterBuilderDraft({
          speciesOrRace: 'Unknown Species',
        }),
      ),
      30,
    );
  });

  it('looks up class and background rule details', () => {
    const fighter = getRuleClassById('Fighter');
    const sage = getRuleBackgroundById('Sage');

    assert.equal(fighter?.hitDie, 10);
    assert.deepEqual(fighter?.savingThrowProficiencies, ['str', 'con']);
    assert.equal(fighter?.skillChoices.choose, 2);
    assert.deepEqual(sage?.skills, ['Arcana', 'History']);
    assert.equal(sage?.originFeat, 'Magic Initiate (Wizard)');
  });

  it('calculates ability modifiers and proficiency bonus by level', () => {
    assert.equal(getRuleAbilityModifier(8), -1);
    assert.equal(getRuleAbilityModifier(18), 4);
    assert.equal(getProficiencyBonus(1), 2);
    assert.equal(getProficiencyBonus(5), 3);
    assert.equal(getProficiencyBonus(13), 5);
    assert.equal(getProficiencyBonus(20), 6);
  });

  it('previews background ability boosts and HP from class hit die and CON', () => {
    const draft = createDefaultCharacterBuilderDraft();
    const abilityPreview = deriveAbilityScorePreview(draft);
    const hpPreview = deriveHitPointPreview(draft);

    assert.equal(abilityPreview.int.base, 15);
    assert.equal(abilityPreview.int.rulesBonus, 2);
    assert.equal(abilityPreview.int.final, 17);
    assert.equal(abilityPreview.con.rulesBonus, 1);
    assert.equal(hpPreview.hitDie, 6);
    assert.equal(hpPreview.conModifier, 2);
    assert.equal(hpPreview.value, 8);
  });

  it('filters legal options by selected rules profile', () => {
    const basicSpecies = getAvailableRuleSpecies('dnd-2014-basic-rules').map(
      (species) => species.id,
    );
    const basicClasses = getAvailableRuleClasses('dnd-2014-basic-rules').map(
      (characterClass) => characterClass.id,
    );

    assert.deepEqual(basicSpecies, ['Dwarf', 'Elf', 'Halfling', 'Human']);
    assert.deepEqual(basicClasses, ['Cleric', 'Fighter', 'Rogue', 'Wizard']);
    assert.equal(
      getAvailableRuleSpecies(defaultRulesProfileId).some(
        (species) => species.id === 'Goliath',
      ),
      true,
    );
  });

  it('sanitizes profile changes and stale selections', () => {
    const sanitized = sanitizeDraftForRulesProfile(
      createDefaultCharacterBuilderDraft({
        className: 'Warlock',
        speciesOrRace: 'Goliath',
      }),
      'dnd-2014-basic-rules',
    );

    assert.equal(sanitized.rulesProfileId, 'dnd-2014-basic-rules');
    assert.equal(sanitized.speciesOrRace, 'Dwarf');
    assert.equal(sanitized.className, 'Cleric');
    assert.equal(sanitized.abilityScoreMethod, 'standard-array');
    assert.deepEqual(
      Object.values(sanitized.abilities).sort((left, right) => left - right),
      [8, 10, 12, 13, 14, 15],
    );
  });

  it('validates score assignment modes and final score caps', () => {
    const draft = {
      ...createDefaultCharacterBuilderDraft({
        background: 'Soldier',
        className: 'Fighter',
        speciesOrRace: 'Human',
      }),
      abilities: {
        cha: 8,
        con: 13,
        dex: 14,
        int: 15,
        str: 20,
        wis: 12,
      },
    };
    const issues = validateCharacterBuilderDraft(draft);

    assert.equal(
      issues.some((issue) =>
        issue.message.includes('STR base score must be 8-15'),
      ),
      true,
    );

    const pointBuyDraft = changeAbilityScoreMethod(
      createDefaultCharacterBuilderDraft(),
      'point-buy',
    );
    const pointBuy = deriveAbilityScoreAssignmentState(pointBuyDraft);

    assert.equal(pointBuy.budget, 27);
    assert.equal(pointBuy.remaining, 0);

    const manualDraft = changeAbilityScoreMethod(
      {
        ...draft,
        abilities: {
          cha: 8,
          con: 13,
          dex: 14,
          int: 15,
          str: 18,
          wis: 12,
        },
      },
      'manual',
    );

    assert.equal(validateCharacterBuilderDraft(manualDraft).length, 0);
    assert.equal(deriveAbilityScorePreview(manualDraft).str.final, 20);
  });

  it('includes species HP bonuses and equipment AC preview metadata', () => {
    const dwarfWizard = createDefaultCharacterBuilderDraft({
      speciesOrRace: 'Dwarf',
    });
    const fighter = createDefaultCharacterBuilderDraft({
      className: 'Fighter',
      speciesOrRace: 'Human',
    });
    const fighterWithDefaults = {
      ...fighter,
      builderSelections: deriveDefaultBuilderSelections(fighter),
    };

    assert.equal(deriveHitPointPreview(dwarfWizard).speciesBonus, 1);
    assert.equal(deriveHitPointPreview(dwarfWizard).value, 9);
    assert.equal(deriveArmorClassPreview(fighterWithDefaults).value, 16);
  });

  it('derives class/background-dependent proficiency choices', () => {
    const rogueSage = createDefaultCharacterBuilderDraft({
      background: 'Sage',
      className: 'Rogue',
    });
    const state = deriveProficiencyChoiceState(rogueSage);

    assert.deepEqual(state.fixedSkills, ['Arcana', 'History']);
    assert.equal(state.skillChoiceLimit, 4);
    assert.equal(state.skillOptions.includes('Stealth'), true);
    assert.equal(state.skillOptions.includes('Arcana'), false);
    assert.deepEqual(state.fixedLanguages, ['Common']);
  });

  it('enforces local selection limits without replacing existing choices', () => {
    assert.deepEqual(toggleRuleSelection(['Arcana'], 'Arcana', 2), []);
    assert.deepEqual(toggleRuleSelection(['Arcana'], 'History', 2), [
      'Arcana',
      'History',
    ]);
    assert.deepEqual(toggleRuleSelection(['Arcana', 'History'], 'Stealth', 2), [
      'Arcana',
      'History',
    ]);

    const sanitized = sanitizeRuleSelections(
      createDefaultCharacterBuilderDraft({
        builderSelections: {
          cantrips: ['Light', 'Mage Hand', 'Ray of Frost', 'Fire Bolt'],
          equipment: [],
          languages: ['Common', 'Elvish', 'Draconic', 'Dwarvish'],
          skills: ['Arcana', 'History', 'Investigation', 'Insight', 'Religion'],
          spells: [
            'Detect Magic',
            'Mage Armor',
            'Magic Missile',
            'Shield',
            'Sleep',
          ],
          tools: ["Calligrapher's Supplies"],
        },
      }),
    );

    assert.equal(sanitized.builderSelections.cantrips.length, 3);
    assert.equal(sanitized.builderSelections.languages.length, 3);
    assert.equal(sanitized.builderSelections.skills.length, 4);
    assert.equal(sanitized.builderSelections.spells.length, 4);
  });

  it('filters spell metadata for caster and non-caster classes', () => {
    const wizardSpells = getAvailableSpellsForClass('Wizard');
    const fighterSpells = getAvailableSpellsForClass('Fighter');

    assert.equal(
      wizardSpells.some((spell) => spell.name === 'Mage Hand'),
      true,
    );
    assert.equal(
      wizardSpells.some((spell) => spell.name === 'Magic Missile'),
      true,
    );
    assert.deepEqual(fighterSpells, []);
  });

  it('derives a review summary from rule data and local selections', () => {
    const draft = createDefaultCharacterBuilderDraft();
    const review = deriveCharacterRuleReviewSummary(draft);

    assert.equal(review.species, 'Elf');
    assert.equal(review.characterClass, 'Wizard');
    assert.equal(review.background, 'Sage');
    assert.equal(review.hitPoints, 8);
    assert.equal(review.armorClass, 12);
    assert.deepEqual(review.savingThrows, ['int', 'wis']);
    assert.deepEqual(review.skills, [
      'Arcana',
      'History',
      'Investigation',
      'Insight',
    ]);
    assert.equal(review.spells.leveled.includes('Magic Missile'), true);
  });
});
