import type {
  AbilityScores,
  Character,
  DerivedCharacterStats,
  GridDefinition,
  SceneEntity,
  SceneEntityFootprint,
  ScenePosition,
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

export function isGridDefinitionValid(grid: GridDefinition): boolean {
  return (
    Number.isInteger(grid.cellSizeFeet) &&
    grid.cellSizeFeet > 0 &&
    Number.isInteger(grid.width) &&
    grid.width > 0 &&
    Number.isInteger(grid.height) &&
    grid.height > 0
  );
}

export function doesSceneEntityFitWithinGrid(
  grid: GridDefinition,
  position: ScenePosition,
  footprint: SceneEntityFootprint,
): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    footprint.width >= 1 &&
    footprint.height >= 1 &&
    position.x + footprint.width <= grid.width &&
    position.y + footprint.height <= grid.height
  );
}

export function doSceneEntitiesOverlap(
  left: Pick<SceneEntity, 'position' | 'footprint'>,
  right: Pick<SceneEntity, 'position' | 'footprint'>,
): boolean {
  return !(
    left.position.x + left.footprint.width <= right.position.x ||
    right.position.x + right.footprint.width <= left.position.x ||
    left.position.y + left.footprint.height <= right.position.y ||
    right.position.y + right.footprint.height <= left.position.y
  );
}
