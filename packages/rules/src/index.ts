import type {
  AbilityScores,
  Character,
  DerivedCharacterStats,
  GridDefinition,
  TurnUsage,
  SceneEntity,
  SceneEntityFootprint,
  ScenePosition,
} from '@dnd/shared';

export type OccupancyShape = {
  position: ScenePosition;
  footprint: SceneEntityFootprint;
};

export type InitiativeOrderEntry = {
  initiative: number;
  participantId: string;
  characterId: string;
};

export const BASELINE_MELEE_REACH_FEET = 5;

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
  return doesOccupancyFitWithinGrid(grid, { position, footprint });
}

export function doesOccupancyFitWithinGrid(
  grid: GridDefinition,
  occupancy: OccupancyShape,
): boolean {
  return (
    occupancy.position.x >= 0 &&
    occupancy.position.y >= 0 &&
    occupancy.footprint.width >= 1 &&
    occupancy.footprint.height >= 1 &&
    occupancy.position.x + occupancy.footprint.width <= grid.width &&
    occupancy.position.y + occupancy.footprint.height <= grid.height
  );
}

export function doSceneEntitiesOverlap(
  left: Pick<SceneEntity, 'position' | 'footprint'>,
  right: Pick<SceneEntity, 'position' | 'footprint'>,
): boolean {
  return doOccupanciesOverlap(left, right);
}

export function doOccupanciesOverlap(
  left: OccupancyShape,
  right: OccupancyShape,
): boolean {
  return !(
    left.position.x + left.footprint.width <= right.position.x ||
    right.position.x + right.footprint.width <= left.position.x ||
    left.position.y + left.footprint.height <= right.position.y ||
    right.position.y + right.footprint.height <= left.position.y
  );
}

export function doesDestinationOverlapBlockingOccupancy(
  destination: OccupancyShape,
  blockingOccupancies: OccupancyShape[],
): boolean {
  return blockingOccupancies.some((occupancy) =>
    doOccupanciesOverlap(destination, occupancy),
  );
}

// Until diagonal/path policies are tied to the rules profile, movement cost
// uses Manhattan grid distance as the narrow authoritative baseline.
export function calculateGridDistance(
  origin: ScenePosition,
  destination: ScenePosition,
): number {
  return (
    Math.abs(destination.x - origin.x) + Math.abs(destination.y - origin.y)
  );
}

export function calculateMovementDistanceFeet(
  origin: ScenePosition,
  destination: ScenePosition,
  cellSizeFeet: number,
): number {
  return calculateGridDistance(origin, destination) * cellSizeFeet;
}

export function rollD20(
  roller: () => number = () => Math.floor(Math.random() * 20) + 1,
): number {
  const result = roller();

  if (Number.isInteger(result) && result >= 1 && result <= 20) {
    return result;
  }

  throw new RangeError('D20 roller must return an integer from 1 to 20.');
}

export function calculateAttackModifier(
  character: Pick<Character, 'abilities' | 'level'>,
): number {
  return (
    calculateAbilityModifier(character.abilities.str) +
    calculateProficiencyBonus(character.level)
  );
}

export function calculateAttackTotal(d20: number, modifier: number): number {
  return d20 + modifier;
}

export function isAttackHit(
  attackTotal: number,
  targetArmorClass: number,
): boolean {
  return attackTotal >= targetArmorClass;
}

export function applyFixedDamage(currentHp: number, damage: number): number {
  return Math.max(0, currentHp - damage);
}

// Phase 7 derives downed/unconscious state from HP only. Do not add a
// canonical condition/status field until death saves or a condition engine
// exists as a dedicated slice.
export function isCharacterDowned(character: Pick<Character, 'hp'>): boolean {
  return character.hp.current === 0;
}

// Phase 6 uses a temporary melee-only baseline: one Manhattan grid step on a
// standard 5-foot grid. This intentionally ignores weapons, size, diagonals,
// cover, and ranged attacks until those systems exist explicitly.
export function isWithinBaselineMeleeReach(params: {
  attackerPosition: ScenePosition;
  targetPosition: ScenePosition;
  cellSizeFeet: number;
  reachFeet?: number;
}): boolean {
  if (
    !Number.isInteger(params.cellSizeFeet) ||
    params.cellSizeFeet < 1 ||
    (params.reachFeet != null &&
      (!Number.isInteger(params.reachFeet) || params.reachFeet < 1))
  ) {
    return false;
  }

  return (
    calculateMovementDistanceFeet(
      params.attackerPosition,
      params.targetPosition,
      params.cellSizeFeet,
    ) <= (params.reachFeet ?? BASELINE_MELEE_REACH_FEET)
  );
}

export function sortEncounterParticipantsByInitiative<
  T extends InitiativeOrderEntry,
>(participants: T[]): T[] {
  return [...participants].sort((left, right) => {
    if (right.initiative !== left.initiative) {
      return right.initiative - left.initiative;
    }

    const participantOrder = left.participantId.localeCompare(
      right.participantId,
    );

    if (participantOrder !== 0) {
      return participantOrder;
    }

    return left.characterId.localeCompare(right.characterId);
  });
}

export function getNextTurnState(params: {
  currentTurnIndex: number;
  participantCount: number;
  roundNumber: number;
}): {
  currentTurnIndex: number;
  roundNumber: number;
  wrapped: boolean;
} | null {
  if (
    !Number.isInteger(params.currentTurnIndex) ||
    !Number.isInteger(params.participantCount) ||
    !Number.isInteger(params.roundNumber) ||
    params.participantCount < 1 ||
    params.roundNumber < 1 ||
    params.currentTurnIndex < 0 ||
    params.currentTurnIndex >= params.participantCount
  ) {
    return null;
  }

  const nextTurnIndex = (params.currentTurnIndex + 1) % params.participantCount;
  const wrapped = nextTurnIndex === 0;

  return {
    currentTurnIndex: nextTurnIndex,
    roundNumber: wrapped ? params.roundNumber + 1 : params.roundNumber,
    wrapped,
  };
}

export function getCurrentTurnParticipant<T>(
  participants: T[],
  currentTurnIndex: number,
): T | null {
  if (
    !Number.isInteger(currentTurnIndex) ||
    currentTurnIndex < 0 ||
    currentTurnIndex >= participants.length
  ) {
    return null;
  }

  return participants[currentTurnIndex] ?? null;
}

export function markActionUsed(turnUsage: TurnUsage): TurnUsage | null {
  if (turnUsage.actionUsed) {
    return null;
  }

  return {
    ...turnUsage,
    actionUsed: true,
  };
}

export function markBonusActionUsed(turnUsage: TurnUsage): TurnUsage | null {
  if (turnUsage.bonusActionUsed) {
    return null;
  }

  return {
    ...turnUsage,
    bonusActionUsed: true,
  };
}

export function markReactionUsed(turnUsage: TurnUsage): TurnUsage | null {
  if (turnUsage.reactionUsed) {
    return null;
  }

  return {
    ...turnUsage,
    reactionUsed: true,
  };
}

export function getUpdatedMovementUsage(params: {
  currentMovementUsed: number;
  additionalMovementFeet: number;
  movementAllowanceFeet: number;
}): number | null {
  if (
    !Number.isInteger(params.currentMovementUsed) ||
    !Number.isInteger(params.additionalMovementFeet) ||
    !Number.isInteger(params.movementAllowanceFeet) ||
    params.currentMovementUsed < 0 ||
    params.additionalMovementFeet < 1 ||
    params.movementAllowanceFeet < 0
  ) {
    return null;
  }

  const updatedMovementUsage =
    params.currentMovementUsed + params.additionalMovementFeet;

  if (updatedMovementUsage > params.movementAllowanceFeet) {
    return null;
  }

  return updatedMovementUsage;
}
