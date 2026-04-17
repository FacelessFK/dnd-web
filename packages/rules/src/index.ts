import type {
  AbilityScores,
  Character,
  DerivedCharacterStats,
} from '@dnd/shared';

export function calculateAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function calculateAbilityModifiers(
  abilities: AbilityScores,
): DerivedCharacterStats['abilityModifiers'] {
  return {
    str: calculateAbilityModifier(abilities.str),
    dex: calculateAbilityModifier(abilities.dex),
    con: calculateAbilityModifier(abilities.con),
    int: calculateAbilityModifier(abilities.int),
    wis: calculateAbilityModifier(abilities.wis),
    cha: calculateAbilityModifier(abilities.cha),
  };
}

export function calculateProficiencyBonus(level: number): number {
  return Math.min(6, 2 + Math.floor((level - 1) / 4));
}

export function calculateInitiativeModifier(abilities: AbilityScores): number {
  return calculateAbilityModifier(abilities.dex);
}

export function calculatePassivePerception(
  abilities: AbilityScores,
  options: { perceptionProficient?: boolean; proficiencyBonus?: number } = {},
): number {
  const baseValue = 10 + calculateAbilityModifier(abilities.wis);

  if (!options.perceptionProficient) {
    return baseValue;
  }

  return baseValue + (options.proficiencyBonus ?? 0);
}

export function calculateSpellSaveDc(options: {
  spellcastingAbilityScore?: number | null;
  proficiencyBonus: number;
}): number | null {
  if (options.spellcastingAbilityScore == null) {
    return null;
  }

  return (
    8 +
    options.proficiencyBonus +
    calculateAbilityModifier(options.spellcastingAbilityScore)
  );
}

export function deriveCharacterStats(
  character: Character,
): DerivedCharacterStats {
  const proficiencyBonus = calculateProficiencyBonus(character.level);

  return {
    abilityModifiers: calculateAbilityModifiers(character.abilities),
    proficiencyBonus,
    initiativeModifier: calculateInitiativeModifier(character.abilities),
    passivePerception: calculatePassivePerception(character.abilities),
    spellSaveDc: null,
  };
}
