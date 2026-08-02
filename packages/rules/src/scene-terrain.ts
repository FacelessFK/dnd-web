import { sceneTerrainTiles } from '@dnd/shared';
import type {
  GridDefinition,
  SceneTerrain,
  SceneTerrainTile,
  ScenePosition,
} from '@dnd/shared';

import type { OccupancyShape } from './occupancy.js';

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
