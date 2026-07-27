import {
  DEFAULT_SCENE_TERRAIN_TILE,
  createSceneTerrain,
  decodeSceneTerrain,
  encodeSceneTerrain,
  resizeSceneTerrain,
} from '@dnd/rules';
import type {
  GridDefinition,
  SceneEntityType,
  SceneTerrain,
  SceneTerrainTile,
  ScenePosition,
} from '@dnd/protocol';

// Pure state and tool maths for the map builder. The editor component owns
// pointers and rendering; every mutation a user can perform lives here so it
// can be unit tested and replayed for undo/redo.

export const mapBuilderTools = [
  'brush',
  'rectangle',
  'fill',
  'line',
  'eraser',
  'entity',
  'select',
] as const;

export type MapBuilderTool = (typeof mapBuilderTools)[number];

export const MAX_MAP_BUILDER_DIMENSION = 120;
export const MIN_MAP_BUILDER_DIMENSION = 4;
export const MAX_MAP_BUILDER_UNDO_STEPS = 60;

export type MapBuilderEntity = {
  id: string;
  type: SceneEntityType;
  name: string;
  position: ScenePosition;
  footprint: { width: number; height: number };
  blocksMovement: boolean;
  blocksVision: boolean;
  hidden: boolean;
};

export type MapBuilderDocument = {
  name: string;
  grid: GridDefinition;
  terrain: SceneTerrain;
  entities: MapBuilderEntity[];
};

export type MapBuilderState = {
  document: MapBuilderDocument;
  past: MapBuilderDocument[];
  future: MapBuilderDocument[];
};

export function createEmptyDocument(
  options: {
    baseTile?: SceneTerrainTile;
    height?: number;
    name?: string;
    width?: number;
  } = {},
): MapBuilderDocument {
  const grid: GridDefinition = {
    cellSizeFeet: 5,
    height: clampDimension(options.height ?? 20),
    width: clampDimension(options.width ?? 28),
  };

  return {
    entities: [],
    grid,
    name: options.name ?? 'Untitled Map',
    terrain: createSceneTerrain(
      grid,
      options.baseTile ?? DEFAULT_SCENE_TERRAIN_TILE,
    ),
  };
}

export function createInitialState(
  document = createEmptyDocument(),
): MapBuilderState {
  return { document, future: [], past: [] };
}

export function clampDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_MAP_BUILDER_DIMENSION;
  }

  return Math.min(
    MAX_MAP_BUILDER_DIMENSION,
    Math.max(MIN_MAP_BUILDER_DIMENSION, Math.trunc(value)),
  );
}

/**
 * Commits a new document as an undoable step. Identical documents are ignored
 * so that a no-op stroke does not consume an undo slot.
 */
export function commit(
  state: MapBuilderState,
  nextDocument: MapBuilderDocument,
): MapBuilderState {
  if (documentsAreEqual(state.document, nextDocument)) {
    return state;
  }

  const past = [...state.past, state.document];

  return {
    document: nextDocument,
    future: [],
    past: past.slice(-MAX_MAP_BUILDER_UNDO_STEPS),
  };
}

export function undo(state: MapBuilderState): MapBuilderState {
  const previous = state.past[state.past.length - 1];

  if (!previous) {
    return state;
  }

  return {
    document: previous,
    future: [state.document, ...state.future],
    past: state.past.slice(0, -1),
  };
}

export function redo(state: MapBuilderState): MapBuilderState {
  const next = state.future[0];

  if (!next) {
    return state;
  }

  return {
    document: next,
    future: state.future.slice(1),
    past: [...state.past, state.document],
  };
}

export function canUndo(state: MapBuilderState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: MapBuilderState): boolean {
  return state.future.length > 0;
}

function documentsAreEqual(
  left: MapBuilderDocument,
  right: MapBuilderDocument,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function paintCells(
  document: MapBuilderDocument,
  cells: ScenePosition[],
  tile: SceneTerrainTile,
): MapBuilderDocument {
  if (cells.length === 0) {
    return document;
  }

  const tiles = decodeSceneTerrain(document.grid, document.terrain);
  let changed = false;

  for (const cell of cells) {
    if (!isInsideGrid(document.grid, cell)) {
      continue;
    }

    const index = cell.y * document.grid.width + cell.x;

    if (tiles[index] !== tile) {
      tiles[index] = tile;
      changed = true;
    }
  }

  if (!changed) {
    return document;
  }

  return { ...document, terrain: encodeSceneTerrain(tiles) };
}

export function isInsideGrid(
  grid: GridDefinition,
  cell: ScenePosition,
): boolean {
  return (
    cell.x >= 0 && cell.y >= 0 && cell.x < grid.width && cell.y < grid.height
  );
}

/** Square brush footprint centred on `center`. */
export function getBrushCells(
  center: ScenePosition,
  size: number,
): ScenePosition[] {
  const radius = Math.floor(Math.max(1, size) / 2);
  const cells: ScenePosition[] = [];

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      cells.push({ x: center.x + dx, y: center.y + dy });
    }
  }

  return cells;
}

/** All cells inside the rectangle spanned by two corners, inclusive. */
export function getRectangleCells(
  from: ScenePosition,
  to: ScenePosition,
  options: { outlineOnly?: boolean } = {},
): ScenePosition[] {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  const cells: ScenePosition[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (
        options.outlineOnly &&
        x !== minX &&
        x !== maxX &&
        y !== minY &&
        y !== maxY
      ) {
        continue;
      }

      cells.push({ x, y });
    }
  }

  return cells;
}

/** Bresenham line so dragged strokes stay connected at any pointer speed. */
export function getLineCells(
  from: ScenePosition,
  to: ScenePosition,
): ScenePosition[] {
  const cells: ScenePosition[] = [];
  const deltaX = Math.abs(to.x - from.x);
  const deltaY = -Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;

  let error = deltaX + deltaY;
  let x = from.x;
  let y = from.y;

  for (;;) {
    cells.push({ x, y });

    if (x === to.x && y === to.y) {
      break;
    }

    const doubledError = error * 2;

    if (doubledError >= deltaY) {
      error += deltaY;
      x += stepX;
    }

    if (doubledError <= deltaX) {
      error += deltaX;
      y += stepY;
    }
  }

  return cells;
}

/** Four-way flood fill over cells sharing the origin's tile. */
export function getFloodFillCells(
  document: MapBuilderDocument,
  origin: ScenePosition,
): ScenePosition[] {
  if (!isInsideGrid(document.grid, origin)) {
    return [];
  }

  const tiles = decodeSceneTerrain(document.grid, document.terrain);
  const targetTile = tiles[origin.y * document.grid.width + origin.x];
  const seen = new Set<string>([`${origin.x},${origin.y}`]);
  const queue: ScenePosition[] = [origin];
  const filled: ScenePosition[] = [];

  while (queue.length > 0) {
    const cell = queue.shift()!;

    filled.push(cell);

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      const key = `${next.x},${next.y}`;

      if (seen.has(key) || !isInsideGrid(document.grid, next)) {
        continue;
      }

      if (tiles[next.y * document.grid.width + next.x] !== targetTile) {
        continue;
      }

      seen.add(key);
      queue.push(next);
    }
  }

  return filled;
}

export function resizeDocument(
  document: MapBuilderDocument,
  size: { width: number; height: number },
): MapBuilderDocument {
  const nextGrid: GridDefinition = {
    cellSizeFeet: document.grid.cellSizeFeet,
    height: clampDimension(size.height),
    width: clampDimension(size.width),
  };

  if (
    nextGrid.width === document.grid.width &&
    nextGrid.height === document.grid.height
  ) {
    return document;
  }

  return {
    ...document,
    // Entities outside the new bounds are dropped rather than clamped, so a
    // shrink never silently stacks props on the new edge.
    entities: document.entities.filter(
      (entity) =>
        entity.position.x + entity.footprint.width <= nextGrid.width &&
        entity.position.y + entity.footprint.height <= nextGrid.height,
    ),
    grid: nextGrid,
    terrain: resizeSceneTerrain(document.grid, nextGrid, document.terrain),
  };
}

export function addEntity(
  document: MapBuilderDocument,
  entity: Omit<MapBuilderEntity, 'id'>,
  id: string,
): MapBuilderDocument {
  if (
    entity.position.x + entity.footprint.width > document.grid.width ||
    entity.position.y + entity.footprint.height > document.grid.height ||
    entity.position.x < 0 ||
    entity.position.y < 0
  ) {
    return document;
  }

  // One entity per cell keeps the builder's click-to-place unambiguous and
  // matches the server's overlap rejection.
  const overlaps = document.entities.some((existing) =>
    entitiesOverlap(existing, { ...entity, id }),
  );

  if (overlaps) {
    return document;
  }

  return { ...document, entities: [...document.entities, { ...entity, id }] };
}

export function removeEntityAt(
  document: MapBuilderDocument,
  cell: ScenePosition,
): MapBuilderDocument {
  const remaining = document.entities.filter(
    (entity) => !entityCoversCell(entity, cell),
  );

  if (remaining.length === document.entities.length) {
    return document;
  }

  return { ...document, entities: remaining };
}

export function findEntityAt(
  document: MapBuilderDocument,
  cell: ScenePosition,
): MapBuilderEntity | null {
  return (
    document.entities.find((entity) => entityCoversCell(entity, cell)) ?? null
  );
}

export function entityCoversCell(
  entity: MapBuilderEntity,
  cell: ScenePosition,
): boolean {
  return (
    cell.x >= entity.position.x &&
    cell.x < entity.position.x + entity.footprint.width &&
    cell.y >= entity.position.y &&
    cell.y < entity.position.y + entity.footprint.height
  );
}

function entitiesOverlap(
  left: MapBuilderEntity,
  right: MapBuilderEntity,
): boolean {
  return !(
    left.position.x + left.footprint.width <= right.position.x ||
    right.position.x + right.footprint.width <= left.position.x ||
    left.position.y + left.footprint.height <= right.position.y ||
    right.position.y + right.footprint.height <= left.position.y
  );
}

/** Serialised form for local persistence and file export/import. */
export type MapBuilderFile = {
  version: 1;
  document: MapBuilderDocument;
};

export function serializeDocument(document: MapBuilderDocument): string {
  return JSON.stringify(
    { document, version: 1 } satisfies MapBuilderFile,
    null,
    2,
  );
}

/**
 * Parses a saved map. Returns null instead of throwing so a corrupt localStorage
 * entry or a hand-edited file degrades to "start a new map" rather than
 * breaking the editor.
 */
export function parseDocument(raw: string): MapBuilderDocument | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MapBuilderFile>;
    const document = parsed?.document;

    if (
      !document ||
      typeof document.name !== 'string' ||
      !document.grid ||
      !Number.isInteger(document.grid.width) ||
      !Number.isInteger(document.grid.height) ||
      !Array.isArray(document.entities)
    ) {
      return null;
    }

    const grid: GridDefinition = {
      cellSizeFeet: document.grid.cellSizeFeet || 5,
      height: clampDimension(document.grid.height),
      width: clampDimension(document.grid.width),
    };

    return {
      entities: document.entities.filter(
        (entity): entity is MapBuilderEntity =>
          Boolean(entity) &&
          typeof entity.id === 'string' &&
          Boolean(entity.position) &&
          Boolean(entity.footprint),
      ),
      grid,
      name: document.name,
      // Round-tripping through the terrain helpers normalises run lengths and
      // drops any tile identifiers the current build does not know about.
      terrain: encodeSceneTerrain(
        decodeSceneTerrain(grid, document.terrain ?? null),
      ),
    };
  } catch {
    return null;
  }
}
