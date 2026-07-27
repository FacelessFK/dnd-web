import { sceneTerrainTiles } from '@dnd/shared';
import type {
  AbilityScores,
  Character,
  DerivedCharacterStats,
  GridDefinition,
  SceneCombatant,
  SceneTerrain,
  SceneTerrainTile,
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
  combatantId?: string | null;
  initiative: number;
  participantId: string;
  characterId?: string | null;
};

export const BASELINE_MELEE_REACH_FEET = 5;

// Baseline melee damage for the current narrow attack foundation. This is a
// documented default in the same spirit as BASELINE_MELEE_REACH_FEET, not a
// weapon system: there is no weapon model, no damage type, and no resistance
// handling. Replace this constant only as part of a dedicated weapon slice.
export const BASELINE_MELEE_DAMAGE_DICE: DamageDice = { count: 1, sides: 8 };

export type DamageDice = {
  count: number;
  sides: number;
};

export type DamageRollBreakdown = {
  critical: boolean;
  dice: number[];
  diceTotal: number;
  modifier: number;
  notation: string;
  total: number;
};

export type AttackRollOutcome = {
  critical: boolean;
  criticalMiss: boolean;
  d20: number;
  hit: boolean;
  modifier: number;
  total: number;
};

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

export function isCriticalHit(d20: number): boolean {
  return d20 === 20;
}

export function isCriticalMiss(d20: number): boolean {
  return d20 === 1;
}

// A natural 20 always hits and a natural 1 always misses, regardless of the
// attack total. Otherwise the total is compared against the target's AC.
export function resolveAttackRoll(params: {
  d20: number;
  modifier: number;
  targetArmorClass: number;
}): AttackRollOutcome {
  const critical = isCriticalHit(params.d20);
  const criticalMiss = isCriticalMiss(params.d20);
  const total = calculateAttackTotal(params.d20, params.modifier);

  return {
    critical,
    criticalMiss,
    d20: params.d20,
    hit:
      critical ||
      (!criticalMiss && isAttackHit(total, params.targetArmorClass)),
    modifier: params.modifier,
    total,
  };
}

export function rollDie(
  sides: number,
  roller: (dieSides: number) => number = (dieSides) =>
    Math.floor(Math.random() * dieSides) + 1,
): number {
  if (!Number.isInteger(sides) || sides < 2) {
    throw new RangeError('Die sides must be a whole number of at least 2.');
  }

  const result = roller(sides);

  if (Number.isInteger(result) && result >= 1 && result <= sides) {
    return result;
  }

  throw new RangeError(`Die roller must return an integer from 1 to ${sides}.`);
}

// Damage uses the attacker's Strength modifier for the current melee baseline.
// A finesse/ranged split belongs to a dedicated weapon slice, not here.
export function calculateDamageModifier(
  character: Pick<Character, 'abilities'>,
): number {
  return calculateAbilityModifier(character.abilities.str);
}

export function formatDamageDiceNotation(
  dice: DamageDice,
  modifier: number,
): string {
  const base = `${dice.count}d${dice.sides}`;

  if (modifier === 0) {
    return base;
  }

  return `${base}${modifier > 0 ? '+' : '-'}${Math.abs(modifier)}`;
}

// A critical hit doubles the number of damage dice rolled; the flat modifier is
// added once, per the baseline 5e rule.
export function rollAttackDamage(params: {
  critical?: boolean;
  dice?: DamageDice;
  modifier: number;
  roller?: (dieSides: number) => number;
}): DamageRollBreakdown {
  const baseDice = params.dice ?? BASELINE_MELEE_DAMAGE_DICE;
  const critical = params.critical ?? false;
  const rolledDice: DamageDice = {
    count: critical ? baseDice.count * 2 : baseDice.count,
    sides: baseDice.sides,
  };

  if (!Number.isInteger(rolledDice.count) || rolledDice.count < 1) {
    throw new RangeError(
      'Damage dice count must be a whole number above zero.',
    );
  }

  const dice: number[] = [];

  for (let index = 0; index < rolledDice.count; index += 1) {
    dice.push(rollDie(rolledDice.sides, params.roller));
  }

  const diceTotal = dice.reduce((sum, value) => sum + value, 0);

  return {
    critical,
    dice,
    diceTotal,
    modifier: params.modifier,
    notation: formatDamageDiceNotation(rolledDice, params.modifier),
    // Damage never heals the target, so the applied total has a floor of zero.
    total: Math.max(0, diceTotal + params.modifier),
  };
}

export function rollInitiative(params: {
  d20: number;
  initiativeModifier: number;
}): number {
  return params.d20 + params.initiativeModifier;
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

export function isCombatantDefeated(
  combatant: Pick<SceneCombatant, 'hp'>,
): boolean {
  return combatant.hp.current === 0;
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

export function isOccupancyWithinBaselineMeleeReach(params: {
  attacker: OccupancyShape;
  target: OccupancyShape;
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

  const attackerCells = getOccupiedCells(params.attacker);
  const targetCells = getOccupiedCells(params.target);
  const reachFeet = params.reachFeet ?? BASELINE_MELEE_REACH_FEET;

  return attackerCells.some((attackerCell) =>
    targetCells.some(
      (targetCell) =>
        calculateMovementDistanceFeet(
          attackerCell,
          targetCell,
          params.cellSizeFeet,
        ) <= reachFeet,
    ),
  );
}

function getOccupiedCells(occupancy: OccupancyShape): ScenePosition[] {
  const cells: ScenePosition[] = [];

  for (let x = 0; x < occupancy.footprint.width; x += 1) {
    for (let y = 0; y < occupancy.footprint.height; y += 1) {
      cells.push({
        x: occupancy.position.x + x,
        y: occupancy.position.y + y,
      });
    }
  }

  return cells;
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

    return (left.characterId ?? left.combatantId ?? '').localeCompare(
      right.characterId ?? right.combatantId ?? '',
    );
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

// ---------------------------------------------------------------------------
// Scene terrain layer
// ---------------------------------------------------------------------------
// The terrain layer is the paintable base surface of a map. These helpers are
// the single source of truth for how a run-length terrain document maps onto
// grid cells and which tiles obstruct movement or vision. The server validates
// against them; the renderer and map builder read from them.

export const DEFAULT_SCENE_TERRAIN_TILE: SceneTerrainTile = 'stone';

export type SceneTerrainTileProperties = {
  blocksMovement: boolean;
  blocksVision: boolean;
};

export const sceneTerrainTileProperties: Record<
  SceneTerrainTile,
  SceneTerrainTileProperties
> = {
  void: { blocksMovement: true, blocksVision: true },
  stone: { blocksMovement: false, blocksVision: false },
  flagstone: { blocksMovement: false, blocksVision: false },
  wood: { blocksMovement: false, blocksVision: false },
  dirt: { blocksMovement: false, blocksVision: false },
  grass: { blocksMovement: false, blocksVision: false },
  sand: { blocksMovement: false, blocksVision: false },
  water: { blocksMovement: false, blocksVision: false },
  deep_water: { blocksMovement: true, blocksVision: false },
  ice: { blocksMovement: false, blocksVision: false },
  rubble: { blocksMovement: false, blocksVision: false },
  lava: { blocksMovement: true, blocksVision: false },
  chasm: { blocksMovement: true, blocksVision: false },
  wall: { blocksMovement: true, blocksVision: true },
  wall_brick: { blocksMovement: true, blocksVision: true },
};

export function isSceneTerrainTile(value: unknown): value is SceneTerrainTile {
  return (
    typeof value === 'string' &&
    (sceneTerrainTiles as readonly string[]).includes(value)
  );
}

export function getSceneTerrainCellCount(grid: GridDefinition): number {
  return grid.width * grid.height;
}

/**
 * Expands a terrain document into a flat row-major tile array of exactly
 * `grid.width * grid.height` entries. Missing, short, or absent documents are
 * padded with `fallbackTile` so callers never have to handle partial terrain.
 */
export function decodeSceneTerrain(
  grid: GridDefinition,
  terrain: SceneTerrain | null | undefined,
  fallbackTile: SceneTerrainTile = DEFAULT_SCENE_TERRAIN_TILE,
): SceneTerrainTile[] {
  const cellCount = getSceneTerrainCellCount(grid);
  const tiles: SceneTerrainTile[] = [];

  for (const run of terrain?.runs ?? []) {
    if (tiles.length >= cellCount) {
      break;
    }

    const length = Math.min(
      Math.max(0, Math.trunc(run.length)),
      cellCount - tiles.length,
    );
    const tile = isSceneTerrainTile(run.tile) ? run.tile : fallbackTile;

    for (let index = 0; index < length; index += 1) {
      tiles.push(tile);
    }
  }

  while (tiles.length < cellCount) {
    tiles.push(fallbackTile);
  }

  return tiles;
}

/** Compresses a flat row-major tile array back into run-length form. */
export function encodeSceneTerrain(tiles: SceneTerrainTile[]): SceneTerrain {
  const runs: SceneTerrain['runs'] = [];

  for (const tile of tiles) {
    const lastRun = runs[runs.length - 1];

    if (lastRun && lastRun.tile === tile) {
      lastRun.length += 1;
      continue;
    }

    runs.push({ tile, length: 1 });
  }

  return { runs };
}

export function createSceneTerrain(
  grid: GridDefinition,
  tile: SceneTerrainTile = DEFAULT_SCENE_TERRAIN_TILE,
): SceneTerrain {
  const cellCount = getSceneTerrainCellCount(grid);

  return cellCount > 0 ? { runs: [{ tile, length: cellCount }] } : { runs: [] };
}

export function getSceneTerrainTileAt(
  grid: GridDefinition,
  terrain: SceneTerrain | null | undefined,
  position: ScenePosition,
  fallbackTile: SceneTerrainTile = DEFAULT_SCENE_TERRAIN_TILE,
): SceneTerrainTile {
  if (
    position.x < 0 ||
    position.y < 0 ||
    position.x >= grid.width ||
    position.y >= grid.height
  ) {
    return fallbackTile;
  }

  const tiles = decodeSceneTerrain(grid, terrain, fallbackTile);

  return tiles[position.y * grid.width + position.x] ?? fallbackTile;
}

export type SceneTerrainCellPaint = {
  position: ScenePosition;
  tile: SceneTerrainTile;
};

/**
 * Applies a sparse set of painted cells onto a terrain document. Out-of-bounds
 * cells are ignored rather than rejected so a brush stroke that runs off the
 * map edge still paints the cells it legitimately covers.
 */
export function applySceneTerrainCells(
  grid: GridDefinition,
  terrain: SceneTerrain | null | undefined,
  cells: SceneTerrainCellPaint[],
  fallbackTile: SceneTerrainTile = DEFAULT_SCENE_TERRAIN_TILE,
): SceneTerrain {
  const tiles = decodeSceneTerrain(grid, terrain, fallbackTile);

  for (const cell of cells) {
    if (
      !Number.isInteger(cell.position.x) ||
      !Number.isInteger(cell.position.y) ||
      cell.position.x < 0 ||
      cell.position.y < 0 ||
      cell.position.x >= grid.width ||
      cell.position.y >= grid.height ||
      !isSceneTerrainTile(cell.tile)
    ) {
      continue;
    }

    tiles[cell.position.y * grid.width + cell.position.x] = cell.tile;
  }

  return encodeSceneTerrain(tiles);
}

/**
 * Resamples a terrain document onto a new grid size, preserving painted cells
 * that still fall inside the new bounds. Used when a map is resized in the
 * builder so existing work is not silently discarded.
 */
export function resizeSceneTerrain(
  fromGrid: GridDefinition,
  toGrid: GridDefinition,
  terrain: SceneTerrain | null | undefined,
  fallbackTile: SceneTerrainTile = DEFAULT_SCENE_TERRAIN_TILE,
): SceneTerrain {
  const sourceTiles = decodeSceneTerrain(fromGrid, terrain, fallbackTile);
  const resizedTiles: SceneTerrainTile[] = [];

  for (let y = 0; y < toGrid.height; y += 1) {
    for (let x = 0; x < toGrid.width; x += 1) {
      const withinSource = x < fromGrid.width && y < fromGrid.height;

      resizedTiles.push(
        withinSource
          ? (sourceTiles[y * fromGrid.width + x] ?? fallbackTile)
          : fallbackTile,
      );
    }
  }

  return encodeSceneTerrain(resizedTiles);
}

export function doesSceneTerrainTileBlockMovement(
  tile: SceneTerrainTile,
): boolean {
  return sceneTerrainTileProperties[tile]?.blocksMovement ?? false;
}

export function doesSceneTerrainTileBlockVision(
  tile: SceneTerrainTile,
): boolean {
  return sceneTerrainTileProperties[tile]?.blocksVision ?? false;
}

/**
 * Movement-blocking terrain cells as single-cell occupancies, so terrain joins
 * entities in the existing blocking-occupancy pipeline without a second code
 * path in movement validation.
 */
export function buildBlockingTerrainOccupancies(
  grid: GridDefinition,
  terrain: SceneTerrain | null | undefined,
): OccupancyShape[] {
  const tiles = decodeSceneTerrain(grid, terrain);
  const occupancies: OccupancyShape[] = [];

  for (let index = 0; index < tiles.length; index += 1) {
    if (!doesSceneTerrainTileBlockMovement(tiles[index]!)) {
      continue;
    }

    occupancies.push({
      footprint: { width: 1, height: 1 },
      position: { x: index % grid.width, y: Math.floor(index / grid.width) },
    });
  }

  return occupancies;
}
