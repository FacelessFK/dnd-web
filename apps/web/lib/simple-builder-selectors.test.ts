import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RACES } from '../app/characters/simple-builder/data/races';
import { getFinalAbilityScores } from '../app/characters/simple-builder/store/selectors';
import type {
  AbilityName,
  CharacterState,
} from '../app/characters/simple-builder/types';

const baseScores: Record<AbilityName, number> = {
  CHA: 10,
  CON: 10,
  DEX: 10,
  INT: 10,
  STR: 10,
  WIS: 10,
};

function createSimpleState(
  overrides: Partial<CharacterState> = {},
): CharacterState {
  return {
    abilityScores: { ...baseScores },
    age: '',
    alignment: null,
    background: null,
    backgroundLanguageChoices: [],
    backgroundSkillOverride: null,
    backstory: '',
    classEquipmentChoices: {},
    classSkillChoices: [],
    classSpellChoices: {
      cantrips: [],
      preparedSpells: [],
    },
    currentStep: 'race',
    dndClass: null,
    height: '',
    name: '',
    portraitDataUrl: '',
    pronouns: '',
    race: null,
    raceAbilityChoices: [],
    raceLanguageChoices: [],
    raceSkillChoices: [],
    subrace: null,
    weight: '',
    ...overrides,
  };
}

describe('simple builder selectors', () => {
  it('applies Half-Elf CHA and two chosen ability score increases', () => {
    const halfElf = RACES.find((race) => race.id === 'half-elf');
    assert.ok(halfElf);

    const finalScores = getFinalAbilityScores(
      createSimpleState({
        race: halfElf,
        raceAbilityChoices: ['STR', 'DEX'],
      }),
    );

    assert.equal(finalScores.CHA, 12);
    assert.equal(finalScores.STR, 11);
    assert.equal(finalScores.DEX, 11);
    assert.equal(finalScores.CON, 10);
    assert.equal(finalScores.INT, 10);
    assert.equal(finalScores.WIS, 10);
  });
});
