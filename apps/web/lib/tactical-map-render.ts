import {
  DEFAULT_SCENE_TERRAIN_TILE,
  calculateGridDistance,
  doesSceneTerrainTileBlockMovement,
} from '@dnd/rules';
import type {
  ActiveSceneState,
  GridDefinition,
  SceneTerrainTile,
  ScenePosition,
} from '@dnd/protocol';
import {
  buildRenderedTerrain,
  type RuntimeScene,
  type RuntimeSceneEntity,
} from './runtime-scene-view';

// Pure geometry, palette, and derivation helpers for the tactical map canvas.
// The canvas component stays a thin drawing/eventing shell so all of the map
// logic here can be unit tested without a DOM.

export type MapCamera = {
  /** World-space centre of the viewport, in cells. */
  centerX: number;
  centerY: number;
  /** Screen pixels per cell. */
  scale: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type CellRange = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export const MIN_MAP_SCALE = 12;
export const MAX_MAP_SCALE = 160;
export const DEFAULT_MAP_SCALE = 64;

export type TileStyle = {
  /** Base fill. */
  base: string;
  /** Darker tone used for edges, cracks, and depth. */
  shade: string;
  /** Lighter tone used for highlights and top faces. */
  light: string;
  /** Fleck colour scattered deterministically across the cell. */
  speckle: string;
  /** Rendered as a raised block with a top face and a cast shadow. */
  raised: boolean;
  /** Rendered with a moving sheen. */
  liquid: boolean;
  /** Emits light onto neighbouring cells. */
  glow: string | null;
};

// A deliberately warm, low-key dungeon palette: saturated enough to read at a
// glance, dark enough that tokens and light are the brightest things on screen.
export const tacticalTileStyles: Record<SceneTerrainTile, TileStyle> = {
  void: {
    base: '#07060a',
    shade: '#000000',
    light: '#131019',
    speckle: '#1b1726',
    raised: false,
    liquid: false,
    glow: null,
  },
  stone: {
    base: '#3b3630',
    shade: '#241f1b',
    light: '#544c43',
    speckle: '#635a4f',
    raised: false,
    liquid: false,
    glow: null,
  },
  flagstone: {
    base: '#4a443c',
    shade: '#2b2620',
    light: '#655c51',
    speckle: '#786d5f',
    raised: false,
    liquid: false,
    glow: null,
  },
  wood: {
    base: '#4a3520',
    shade: '#2c1e12',
    light: '#66492c',
    speckle: '#7b5a37',
    raised: false,
    liquid: false,
    glow: null,
  },
  dirt: {
    base: '#3f3125',
    shade: '#261d15',
    light: '#57432f',
    speckle: '#6b533a',
    raised: false,
    liquid: false,
    glow: null,
  },
  grass: {
    base: '#2f4429',
    shade: '#1a2817',
    light: '#436138',
    speckle: '#587a45',
    raised: false,
    liquid: false,
    glow: null,
  },
  sand: {
    base: '#6b5c3c',
    shade: '#493d26',
    light: '#8a7850',
    speckle: '#a08a5d',
    raised: false,
    liquid: false,
    glow: null,
  },
  water: {
    base: '#1d3a4d',
    shade: '#112533',
    light: '#2f5c78',
    speckle: '#4a86a8',
    raised: false,
    liquid: true,
    glow: null,
  },
  deep_water: {
    base: '#12222f',
    shade: '#08131c',
    light: '#1d3a4f',
    speckle: '#2c5872',
    raised: false,
    liquid: true,
    glow: null,
  },
  ice: {
    base: '#3f5764',
    shade: '#27363f',
    light: '#6e8c9b',
    speckle: '#96b6c4',
    raised: false,
    liquid: false,
    glow: null,
  },
  rubble: {
    base: '#413a33',
    shade: '#262119',
    light: '#5b5145',
    speckle: '#6f6252',
    raised: false,
    liquid: false,
    glow: null,
  },
  lava: {
    base: '#7a2410',
    shade: '#3d1006',
    light: '#e0561a',
    speckle: '#ffb03a',
    raised: false,
    liquid: true,
    glow: 'rgba(255, 122, 26, 0.55)',
  },
  chasm: {
    base: '#0d0b10',
    shade: '#000000',
    light: '#1d1826',
    speckle: '#241d30',
    raised: false,
    liquid: false,
    glow: null,
  },
  wall: {
    base: '#2e2a26',
    shade: '#15120f',
    light: '#4c453d',
    speckle: '#5c534a',
    raised: true,
    liquid: false,
    glow: null,
  },
  wall_brick: {
    base: '#3a2b24',
    shade: '#1c130f',
    light: '#5c443a',
    speckle: '#6d5245',
    raised: true,
    liquid: false,
    glow: null,
  },
};

export function getTileStyle(tile: SceneTerrainTile): TileStyle {
  return (
    tacticalTileStyles[tile] ?? tacticalTileStyles[DEFAULT_SCENE_TERRAIN_TILE]
  );
}

/**
 * Deterministic 0..1 value per cell and salt. Terrain detail has to be stable
 * across redraws and pans, so texture is hashed from coordinates rather than
 * randomised or stored.
 */
export function hashCell(x: number, y: number, salt: number): number {
  let hash = Math.imul(x + 0x9e3779b9, 0x85ebca6b);

  hash ^= Math.imul(y + 0x165667b1, 0xc2b2ae35);
  hash ^= Math.imul(salt + 0x27d4eb2f, 0x165667b1);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2545f491);
  hash ^= hash >>> 13;

  return (hash >>> 0) / 4294967296;
}

export function clampMapScale(scale: number): number {
  return Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, scale));
}

/**
 * Keeps the map centred when it is smaller than the viewport, and otherwise
 * stops the camera from panning past the map edge.
 */
export function clampCamera(
  camera: MapCamera,
  grid: GridDefinition,
  viewport: ViewportSize,
): MapCamera {
  const scale = clampMapScale(camera.scale);
  const halfViewportCellsX = viewport.width / scale / 2;
  const halfViewportCellsY = viewport.height / scale / 2;

  const clampAxis = (center: number, half: number, extent: number): number => {
    if (extent <= half * 2) {
      return extent / 2;
    }

    return Math.min(extent - half, Math.max(half, center));
  };

  return {
    centerX: clampAxis(camera.centerX, halfViewportCellsX, grid.width),
    centerY: clampAxis(camera.centerY, halfViewportCellsY, grid.height),
    scale,
  };
}

/** Camera that frames the whole map with a small margin. */
export function createFitCamera(
  grid: GridDefinition,
  viewport: ViewportSize,
  marginCells = 0.6,
): MapCamera {
  const paddedWidth = grid.width + marginCells * 2;
  const paddedHeight = grid.height + marginCells * 2;
  const scale =
    viewport.width > 0 && viewport.height > 0
      ? clampMapScale(
          Math.min(
            viewport.width / paddedWidth,
            viewport.height / paddedHeight,
          ),
        )
      : DEFAULT_MAP_SCALE;

  return clampCamera(
    { centerX: grid.width / 2, centerY: grid.height / 2, scale },
    grid,
    viewport,
  );
}

export function worldToScreen(
  world: { x: number; y: number },
  camera: MapCamera,
  viewport: ViewportSize,
): { x: number; y: number } {
  return {
    x: (world.x - camera.centerX) * camera.scale + viewport.width / 2,
    y: (world.y - camera.centerY) * camera.scale + viewport.height / 2,
  };
}

export function screenToWorld(
  screen: { x: number; y: number },
  camera: MapCamera,
  viewport: ViewportSize,
): { x: number; y: number } {
  return {
    x: (screen.x - viewport.width / 2) / camera.scale + camera.centerX,
    y: (screen.y - viewport.height / 2) / camera.scale + camera.centerY,
  };
}

/** Cell under a screen point, or null when the point is off the map. */
export function screenToCell(
  screen: { x: number; y: number },
  camera: MapCamera,
  viewport: ViewportSize,
  grid: GridDefinition,
): ScenePosition | null {
  const world = screenToWorld(screen, camera, viewport);
  const x = Math.floor(world.x);
  const y = Math.floor(world.y);

  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
    return null;
  }

  return { x, y };
}

/**
 * Visible cell bounds, padded by one cell so partially visible edges still get
 * drawn. Large maps rely on this to keep per-frame work proportional to the
 * viewport rather than the grid.
 */
export function getVisibleCellRange(
  camera: MapCamera,
  viewport: ViewportSize,
  grid: GridDefinition,
  padding = 1,
): CellRange {
  const topLeft = screenToWorld({ x: 0, y: 0 }, camera, viewport);
  const bottomRight = screenToWorld(
    { x: viewport.width, y: viewport.height },
    camera,
    viewport,
  );

  return {
    startX: Math.max(0, Math.floor(topLeft.x) - padding),
    startY: Math.max(0, Math.floor(topLeft.y) - padding),
    endX: Math.min(grid.width - 1, Math.ceil(bottomRight.x) + padding),
    endY: Math.min(grid.height - 1, Math.ceil(bottomRight.y) + padding),
  };
}

export function getCameraAfterZoom(params: {
  camera: MapCamera;
  /** Positive zooms in, negative zooms out. */
  delta: number;
  anchor: { x: number; y: number };
  viewport: ViewportSize;
  grid: GridDefinition;
}): MapCamera {
  const nextScale = clampMapScale(params.camera.scale * Math.exp(params.delta));

  if (nextScale === params.camera.scale) {
    return params.camera;
  }

  // Keep the world point under the cursor pinned while the scale changes.
  const anchorWorld = screenToWorld(
    params.anchor,
    params.camera,
    params.viewport,
  );
  const zoomed: MapCamera = { ...params.camera, scale: nextScale };
  const anchorAfter = screenToWorld(params.anchor, zoomed, params.viewport);

  return clampCamera(
    {
      centerX: zoomed.centerX + (anchorWorld.x - anchorAfter.x),
      centerY: zoomed.centerY + (anchorWorld.y - anchorAfter.y),
      scale: nextScale,
    },
    params.grid,
    params.viewport,
  );
}

export function getCameraAfterPan(params: {
  camera: MapCamera;
  deltaScreenX: number;
  deltaScreenY: number;
  viewport: ViewportSize;
  grid: GridDefinition;
}): MapCamera {
  return clampCamera(
    {
      centerX:
        params.camera.centerX - params.deltaScreenX / params.camera.scale,
      centerY:
        params.camera.centerY - params.deltaScreenY / params.camera.scale,
      scale: params.camera.scale,
    },
    params.grid,
    params.viewport,
  );
}

export type MapTokenKind = 'player' | 'ally' | 'monster' | 'npc';

export type MapToken = {
  id: string;
  kind: MapTokenKind;
  /** Short label drawn inside the token when no portrait is available. */
  initials: string;
  name: string;
  position: ScenePosition;
  footprint: { width: number; height: number };
  hp: { current: number; max: number } | null;
  defeated: boolean;
  isCurrentTurn: boolean;
  isSelected: boolean;
  isTarget: boolean;
  /** Set for character tokens so the cockpit can map a token back to a seat. */
  participantId: string | null;
  /** Set for scene-entity combatants. */
  entityId: string | null;
};

export function getTokenInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return '?';
  }

  if (words.length === 1) {
    return [...words[0]!].slice(0, 2).join('').toLocaleUpperCase();
  }

  return [...words[0]!][0]!.concat([...words[1]!][0]!).toLocaleUpperCase();
}

/**
 * Flattens placed characters and combatant scene entities into a single draw
 * list. Selection/turn/target flags are resolved here so the canvas only has to
 * paint what it is handed.
 */
export function buildMapTokens(params: {
  activeScene: ActiveSceneState | null;
  characterNamesByParticipant: Record<
    string,
    { name: string; hp: { current: number; max: number } } | undefined
  >;
  currentTurnCombatantId: string | null;
  currentTurnParticipantId: string | null;
  ownParticipantId: string | null;
  scene: RuntimeScene | null;
  selectedCombatantId: string | null;
  selectedParticipantId: string | null;
  targetCombatantId: string | null;
  targetParticipantId: string | null;
}): MapToken[] {
  const tokens: MapToken[] = [];

  for (const placement of params.activeScene?.placedCharacters ?? []) {
    const character =
      params.characterNamesByParticipant[placement.participantId];
    const name = character?.name ?? placement.participantId;

    tokens.push({
      defeated: character ? character.hp.current <= 0 : false,
      entityId: null,
      footprint: { width: 1, height: 1 },
      hp: character?.hp ?? null,
      id: `participant:${placement.participantId}`,
      initials: getTokenInitials(name),
      isCurrentTurn:
        placement.participantId === params.currentTurnParticipantId,
      isSelected: placement.participantId === params.selectedParticipantId,
      isTarget: placement.participantId === params.targetParticipantId,
      kind:
        placement.participantId === params.ownParticipantId ? 'player' : 'ally',
      name,
      participantId: placement.participantId,
      position: { x: placement.position.x, y: placement.position.y },
    });
  }

  for (const entity of params.scene?.entities ?? []) {
    if (!entity.combatant) {
      continue;
    }

    tokens.push({
      defeated: entity.combatant.hp.current <= 0,
      entityId: entity.id,
      footprint: {
        width: entity.footprint.width,
        height: entity.footprint.height,
      },
      hp: {
        current: entity.combatant.hp.current,
        max: entity.combatant.hp.max,
      },
      id: `entity:${entity.id}`,
      initials: getTokenInitials(entity.name),
      isCurrentTurn: entity.id === params.currentTurnCombatantId,
      isSelected: entity.id === params.selectedCombatantId,
      isTarget: entity.id === params.targetCombatantId,
      kind: entity.combatant.kind === 'npc' ? 'npc' : 'monster',
      name: entity.name,
      participantId: null,
      position: { x: entity.position.x, y: entity.position.y },
    });
  }

  return tokens;
}

export type MapDecorKind = 'object' | 'terrain' | 'spawn' | 'transition';

export type MapDecor = {
  id: string;
  kind: MapDecorKind;
  name: string;
  position: ScenePosition;
  footprint: { width: number; height: number };
  blocksVision: boolean;
  hidden: boolean;
};

/** Non-combatant scene entities: props, spawns, and transitions. */
export function buildMapDecor(
  scene: RuntimeScene | null,
  options: { includeHidden: boolean },
): MapDecor[] {
  // A projected entity carries no `hidden` flag, because a concealed entity is
  // absent from a player's payload entirely. Absence therefore reads as "not
  // concealed": everything that survived the server's projection is something
  // this seat is allowed to see.
  const isHidden = (entity: RuntimeSceneEntity): boolean =>
    'hidden' in entity && entity.hidden;

  return (scene?.entities ?? [])
    .filter((entity) => !entity.combatant)
    .filter((entity) => options.includeHidden || !isHidden(entity))
    .map((entity) => ({
      blocksVision: entity.blocksVision,
      footprint: {
        width: entity.footprint.width,
        height: entity.footprint.height,
      },
      hidden: isHidden(entity),
      id: entity.id,
      kind: resolveDecorKind(entity),
      name: entity.name,
      position: { x: entity.position.x, y: entity.position.y },
    }));
}

function resolveDecorKind(entity: RuntimeSceneEntity): MapDecorKind {
  if (entity.transition) {
    return 'transition';
  }

  if (entity.type === 'player_spawn') {
    return 'spawn';
  }

  if (entity.type === 'terrain') {
    return 'terrain';
  }

  return 'object';
}

/**
 * Cells the acting token may legally move to.
 *
 * This intentionally mirrors the server rule rather than running a pathfinding
 * search: `move_character_in_active_scene` validates Manhattan distance from
 * the origin plus a destination-occupancy check, so a flood fill would show a
 * smaller range than the server actually allows and mislead the player.
 */
export function getReachableCells(params: {
  budgetFeet: number;
  grid: GridDefinition;
  origin: ScenePosition;
  /** Cell keys ("x,y") that are occupied or impassable. */
  blockedCellKeys: ReadonlySet<string>;
}): ScenePosition[] {
  if (params.budgetFeet < params.grid.cellSizeFeet) {
    return [];
  }

  const budgetCells = Math.floor(params.budgetFeet / params.grid.cellSizeFeet);
  const reachable: ScenePosition[] = [];

  for (
    let y = Math.max(0, params.origin.y - budgetCells);
    y <= Math.min(params.grid.height - 1, params.origin.y + budgetCells);
    y += 1
  ) {
    for (
      let x = Math.max(0, params.origin.x - budgetCells);
      x <= Math.min(params.grid.width - 1, params.origin.x + budgetCells);
      x += 1
    ) {
      if (x === params.origin.x && y === params.origin.y) {
        continue;
      }

      if (calculateGridDistance(params.origin, { x, y }) > budgetCells) {
        continue;
      }

      if (params.blockedCellKeys.has(`${x},${y}`)) {
        continue;
      }

      reachable.push({ x, y });
    }
  }

  return reachable;
}

export function toCellKey(position: ScenePosition): string {
  return `${position.x},${position.y}`;
}

/**
 * Every cell a token or blocking entity or blocking tile occupies, as cell
 * keys. Used to grey out illegal movement targets.
 */
export function buildBlockedCellKeys(params: {
  scene: RuntimeScene | null;
  tokens: MapToken[];
  excludeTokenId: string | null;
}): Set<string> {
  const blocked = new Set<string>();

  if (params.scene) {
    // Built from the rendered terrain rather than the raw layer, so a projected
    // view contributes only the cells the server named. An unknown cell is left
    // out of the blocked set entirely: the client does not get to guess what is
    // there, and the server rejects an illegal move regardless.
    const { tiles } = buildRenderedTerrain(params.scene);

    for (let index = 0; index < tiles.length; index += 1) {
      const tile = tiles[index] ?? null;

      if (tile && doesSceneTerrainTileBlockMovement(tile)) {
        blocked.add(
          `${index % params.scene.grid.width},${Math.floor(index / params.scene.grid.width)}`,
        );
      }
    }

    for (const entity of params.scene.entities) {
      if (!entity.blocksMovement) {
        continue;
      }

      for (let dx = 0; dx < entity.footprint.width; dx += 1) {
        for (let dy = 0; dy < entity.footprint.height; dy += 1) {
          blocked.add(`${entity.position.x + dx},${entity.position.y + dy}`);
        }
      }
    }
  }

  for (const token of params.tokens) {
    if (token.id === params.excludeTokenId) {
      continue;
    }

    for (let dx = 0; dx < token.footprint.width; dx += 1) {
      for (let dy = 0; dy < token.footprint.height; dy += 1) {
        blocked.add(`${token.position.x + dx},${token.position.y + dy}`);
      }
    }
  }

  return blocked;
}

export type TokenPalette = {
  fill: string;
  fillLight: string;
  ring: string;
  glow: string;
};

export const tokenPalettes: Record<MapTokenKind, TokenPalette> = {
  player: {
    fill: '#1c5f86',
    fillLight: '#4aa8d8',
    ring: '#8fd6ff',
    glow: 'rgba(90, 190, 255, 0.55)',
  },
  ally: {
    fill: '#1f6b4a',
    fillLight: '#3fae78',
    ring: '#8ff0c0',
    glow: 'rgba(90, 235, 170, 0.5)',
  },
  monster: {
    fill: '#7a1f1f',
    fillLight: '#c14b3c',
    ring: '#ff9b86',
    glow: 'rgba(255, 110, 85, 0.55)',
  },
  npc: {
    fill: '#6b4b18',
    fillLight: '#c08a30',
    ring: '#ffd68a',
    glow: 'rgba(255, 200, 100, 0.5)',
  },
};

export function getTokenPalette(kind: MapTokenKind): TokenPalette {
  return tokenPalettes[kind] ?? tokenPalettes.monster;
}

/** Green→amber→red HP bar colour. */
export function getHealthColor(ratio: number): string {
  const clamped = Math.min(1, Math.max(0, ratio));

  if (clamped > 0.6) {
    return '#54d98c';
  }

  if (clamped > 0.3) {
    return '#e8b13c';
  }

  return '#e05252';
}
