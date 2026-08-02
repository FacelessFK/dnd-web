/**
 * Turning "what this viewer perceives" into the bytes they are sent.
 *
 * This is the boundary the whole milestone exists for. Above it sits the
 * authoritative `Scene`: the full terrain layer, every entity including the
 * ones the GM concealed, and the lighting configuration. Below it sits a
 * `SceneView`, which contains only what one viewer is entitled to know.
 *
 * Two properties are load-bearing and are asserted by tests rather than
 * documented and hoped for:
 *
 *  - **Unknown is absent.** There is no fog tile and no null cell. A cell the
 *    viewer cannot perceive appears in no run, so the payload says nothing at
 *    all about what is there - not its tile, not its lighting, not that it
 *    exists. Masking would have left the answer in the bytes.
 *  - **Concealment survives.** `hidden` is a separate GM rule and visibility
 *    never overrides it. An entity the GM concealed is dropped even when it is
 *    standing in a brightly lit cell the viewer is looking straight at.
 *
 * The output is deterministic: runs are emitted row-major, left to right, and
 * entities keep their authoritative order.
 */
import type {
  Scene,
  SceneCellIllumination,
  SceneEntity,
  SceneView,
  SceneViewCellRun,
  SceneViewEntity,
} from '@dnd/shared';

import { expandOccupancyCells, type OccupancyShape } from './occupancy.js';
import { ILLUMINATION_BRIGHT, ILLUMINATION_DIM } from './scene-illumination.js';
import { isWithinGrid, toCellIndex } from './scene-visibility-geometry.js';
import {
  buildSceneVisibilityIndex,
  type SceneVisibilityIndex,
} from './scene-visibility-index.js';
import { computeScenePerception } from './scene-perception.js';

function toIlluminationLevel(rank: number): SceneCellIllumination {
  if (rank >= ILLUMINATION_BRIGHT) {
    return 'bright';
  }

  return rank >= ILLUMINATION_DIM ? 'dim' : 'dark';
}

/**
 * Compress a viewer's perceived cells into row-major runs.
 *
 * A run breaks whenever the tile, the illumination, or contiguity changes, so
 * the encoding is a function of the perception alone - the same perception
 * always yields byte-identical runs.
 */
export function buildSceneViewCellRuns(
  index: SceneVisibilityIndex,
  perceived: Uint8Array,
  illumination: Uint8Array,
): SceneViewCellRun[] {
  const runs: SceneViewCellRun[] = [];

  for (let y = 0; y < index.grid.height; y += 1) {
    let open: SceneViewCellRun | null = null;

    for (let x = 0; x < index.grid.width; x += 1) {
      const cellIndex = toCellIndex(index.grid, x, y);

      if (perceived[cellIndex] !== 1) {
        open = null;
        continue;
      }

      const tile = index.tiles[cellIndex]!;
      const level = toIlluminationLevel(illumination[cellIndex]!);

      if (open && open.tile === tile && open.illumination === level) {
        open.length += 1;
        continue;
      }

      open = {
        y,
        x,
        length: 1,
        tile,
        // Wave one emits `visible` only. `explored` exists in the vocabulary so
        // remembered terrain can land without a payload change, and a test
        // pins the fact that nothing produces it yet.
        visibility: 'visible',
        illumination: level,
      };
      runs.push(open);
    }
  }

  return runs;
}

/**
 * Whether a viewer perceives any part of an entity.
 *
 * Any occupied cell is enough. A creature standing half in a doorway is either
 * seen or not; splitting an entity across the fog line would mean sending its
 * position and footprint anyway, which is the thing being withheld.
 */
export function isSceneEntityPerceived(
  index: SceneVisibilityIndex,
  perceived: Uint8Array,
  entity: SceneEntity,
): boolean {
  for (const cell of expandOccupancyCells({
    position: entity.position,
    footprint: entity.footprint,
  })) {
    if (!isWithinGrid(index.blockers, cell.x, cell.y)) {
      continue;
    }

    if (perceived[toCellIndex(index.grid, cell.x, cell.y)] === 1) {
      return true;
    }
  }

  return false;
}

function toSceneViewEntity(entity: SceneEntity): SceneViewEntity {
  // Built field by field rather than by spreading and deleting. A spread would
  // carry every future `SceneEntity` field into the player payload by default,
  // which is exactly the wrong default for a projection boundary: adding a
  // secret to the authoritative entity would silently publish it.
  return {
    id: entity.id,
    type: entity.type,
    name: entity.name,
    position: { x: entity.position.x, y: entity.position.y },
    footprint: {
      width: entity.footprint.width,
      height: entity.footprint.height,
    },
    blocksMovement: entity.blocksMovement,
    blocksVision: entity.blocksVision,
    combatant: entity.combatant ? structuredClone(entity.combatant) : null,
    ...(entity.transition
      ? { transition: structuredClone(entity.transition) }
      : {}),
    meta: structuredClone(entity.meta),
  };
}

export type SceneViewProjectionParams = {
  scene: Scene;
  /** The cells this viewer's characters occupy. Empty means "sees nothing". */
  observers: readonly OccupancyShape[];
  /**
   * When the projection was computed, as an ISO timestamp supplied by the
   * caller. Injected rather than read from the clock here so this module stays
   * pure and a test can assert an exact payload.
   */
  projectedAt: string;
  /** Reuse an index across viewers of the same scene. Built if omitted. */
  index?: SceneVisibilityIndex;
};

/**
 * The scene as one viewer may know it.
 *
 * A viewer with no observers gets an empty view - no cells, no entities - not
 * the authoritative scene. That is the fail-closed default and it is what a
 * player with an unplaced or unassigned character receives.
 */
export function projectSceneViewForObservers(
  params: SceneViewProjectionParams,
): SceneView {
  const index = params.index ?? buildSceneVisibilityIndex(params.scene);
  const perception = computeScenePerception(index, params.observers);

  return {
    view: 'player_projection',
    id: params.scene.id,
    sessionId: params.scene.sessionId,
    name: params.scene.name,
    grid: { ...params.scene.grid },
    cells: buildSceneViewCellRuns(
      index,
      perception.perceived,
      perception.illumination,
    ),
    entities: params.scene.entities
      .filter(
        (entity) =>
          !entity.hidden &&
          isSceneEntityPerceived(index, perception.perceived, entity),
      )
      .map(toSceneViewEntity),
    updatedAt: params.scene.updatedAt,
    projectedAt: params.projectedAt,
  };
}
