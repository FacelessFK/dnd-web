/**
 * One scene, pre-chewed into the shape the visibility engine wants.
 *
 * Every observer and every light source in a scene asks the same three
 * questions - which cells block vision, what tile is at a cell, what is
 * emitting light - and answering them from the authoritative `Scene` means
 * decoding the run-length terrain layer again for each. On a 100x100 map with
 * four observers and several torches that is a dozen full decodes per
 * recomputation, all producing the same array.
 *
 * So the scene is indexed once and the engine reads the index. Nothing here
 * touches React, the network, a store, the clock, or a random number: it is a
 * pure function of the scene it is given.
 */
import type {
  Scene,
  SceneAmbientLight,
  SceneEntity,
  SceneLightSource,
  ScenePosition,
  SceneTerrain,
  SceneTerrainTile,
  GridDefinition,
} from '@dnd/shared';

import { expandOccupancyCells, type OccupancyShape } from './occupancy.js';
import {
  decodeSceneTerrain,
  doesSceneTerrainTileBlockVision,
} from './scene-terrain.js';
import {
  createVisionBlockerGrid,
  isWithinGrid,
  toCellIndex,
  type VisionBlockerGrid,
} from './scene-visibility-geometry.js';

/**
 * A scene's ambient light, with absence resolved.
 *
 * Every scene authored before M3 has no `ambientLight` field at all, and scene
 * records are JSONB documents that the store clones rather than re-parses, so
 * the schema default never runs on the way out. Absence therefore has to mean
 * something, and it means `'bright'`: a map that never had lighting keeps
 * looking exactly as it did.
 */
export function resolveSceneAmbientLight(
  scene: Pick<Scene, 'ambientLight'>,
): SceneAmbientLight {
  return scene.ambientLight ?? 'bright';
}

/**
 * An entity's light source, with absence resolved. Absent and `null` are the
 * same thing: this entity emits nothing.
 */
export function resolveSceneEntityLightSource(
  entity: Pick<SceneEntity, 'lightSource'>,
): SceneLightSource | null {
  return entity.lightSource ?? null;
}

/** Whether a light source contributes anything at all. */
export function isEmittingLightSource(
  lightSource: SceneLightSource | null,
): lightSource is SceneLightSource {
  return lightSource !== null && lightSource.enabled;
}

/** The cells of a terrain layer whose tile blocks vision, row-major. */
export function buildVisionBlockingTerrainCells(
  grid: GridDefinition,
  terrain: SceneTerrain | null | undefined,
): ScenePosition[] {
  const tiles = decodeSceneTerrain(grid, terrain);
  const cells: ScenePosition[] = [];

  for (let index = 0; index < tiles.length; index += 1) {
    if (!doesSceneTerrainTileBlockVision(tiles[index]!)) {
      continue;
    }

    cells.push({ x: index % grid.width, y: Math.floor(index / grid.width) });
  }

  return cells;
}

/**
 * The cells an entity occupies, when that entity blocks vision.
 *
 * A concealed entity blocks vision exactly like a visible one. That is not an
 * oversight: the server is the authority on geometry, and a wall the GM has
 * hidden is still a wall. It leaks nothing, because its only effect on a player
 * is that they see *less*.
 */
export function buildVisionBlockingEntityCells(
  entities: readonly SceneEntity[],
): ScenePosition[] {
  const cells: ScenePosition[] = [];

  for (const entity of entities) {
    if (!entity.blocksVision) {
      continue;
    }

    cells.push(
      ...expandOccupancyCells({
        position: entity.position,
        footprint: entity.footprint,
      }),
    );
  }

  return cells;
}

/** A light source resolved to the cells it emits from. */
export type IndexedLightSource = {
  entityId: SceneEntity['id'];
  cells: ScenePosition[];
  brightRadius: number;
  dimRadius: number;
};

export type SceneVisibilityIndex = {
  grid: GridDefinition;
  ambientLight: SceneAmbientLight;
  blockers: VisionBlockerGrid;
  /** Row-major, one tile per cell. Decoded once for the whole computation. */
  tiles: SceneTerrainTile[];
  /**
   * Enabled light sources in scene-entity order, so two runs over the same
   * scene combine them in the same order and produce identical output.
   */
  lightSources: IndexedLightSource[];
};

export function buildSceneVisibilityIndex(scene: Scene): SceneVisibilityIndex {
  const blockers = createVisionBlockerGrid(scene.grid);
  const tiles = decodeSceneTerrain(scene.grid, scene.terrain);

  for (let index = 0; index < tiles.length; index += 1) {
    if (doesSceneTerrainTileBlockVision(tiles[index]!)) {
      blockers.blocked[index] = 1;
    }
  }

  for (const cell of buildVisionBlockingEntityCells(scene.entities)) {
    // Out-of-grid cells are dropped rather than clamped. A footprint that
    // overhangs the map is a placement bug, and folding it back onto the edge
    // would invent a blocker on a cell nothing stands on.
    if (isWithinGrid(blockers, cell.x, cell.y)) {
      blockers.blocked[toCellIndex(blockers, cell.x, cell.y)] = 1;
    }
  }

  const lightSources: IndexedLightSource[] = [];

  for (const entity of scene.entities) {
    const lightSource = resolveSceneEntityLightSource(entity);

    if (!isEmittingLightSource(lightSource)) {
      continue;
    }

    const cells = expandOccupancyCells({
      position: entity.position,
      footprint: entity.footprint,
    }).filter((cell) => isWithinGrid(blockers, cell.x, cell.y));

    // A light entirely off the map emits nothing, rather than being pulled back
    // onto the edge and lighting cells it is not standing on.
    if (cells.length === 0) {
      continue;
    }

    lightSources.push({
      entityId: entity.id,
      cells,
      brightRadius: lightSource.brightRadius,
      // Defensive rather than trusting: the command schemas reject an outer
      // radius smaller than the bright one, but a scene document persisted by
      // an older or hand-edited path has not been through them.
      dimRadius: Math.max(lightSource.dimRadius, lightSource.brightRadius),
    });
  }

  return {
    grid: scene.grid,
    ambientLight: resolveSceneAmbientLight(scene),
    blockers,
    tiles,
    lightSources,
  };
}

/** The cells an observer occupies, clipped to the grid. */
export function buildObserverCells(
  grid: Pick<VisionBlockerGrid, 'width' | 'height'>,
  observers: readonly OccupancyShape[],
): ScenePosition[] {
  const cells: ScenePosition[] = [];

  for (const observer of observers) {
    for (const cell of expandOccupancyCells(observer)) {
      if (isWithinGrid(grid, cell.x, cell.y)) {
        cells.push(cell);
      }
    }
  }

  return cells;
}
