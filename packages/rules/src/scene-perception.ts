/**
 * What a set of observers can actually perceive in one scene.
 *
 * Two independent facts combine here, and keeping them separate matters:
 *
 *  - **Line of sight** is geometry. It says whether anything stands between an
 *    observer and a cell. It is computed from the observers.
 *  - **Illumination** is lighting. It says whether there is anything to see. It
 *    is computed from the scene, with no observer involved.
 *
 * A cell is *perceived* when both hold: the observer has line of sight to it
 * and it is not dark. Neither substitutes for the other. A lit room behind a
 * wall is unseen; a cell an observer is staring straight at in pitch darkness is
 * unseen too.
 *
 * Darkvision would change the second condition, not the first. It is
 * deliberately not implemented in M3.
 */
import type { OccupancyShape } from './occupancy.js';
import {
  ILLUMINATION_DARK,
  computeSceneIllumination,
} from './scene-illumination.js';
import { computeVisibleCells } from './scene-visibility-geometry.js';
import {
  buildObserverCells,
  type SceneVisibilityIndex,
} from './scene-visibility-index.js';

export type ScenePerception = {
  /** Row-major: 1 where an observer has line of sight, ignoring light. */
  lineOfSight: Uint8Array;
  /** Row-major illumination rank for the whole scene, ignoring observers. */
  illumination: Uint8Array;
  /** Row-major: 1 where the viewer both can see and has light to see by. */
  perceived: Uint8Array;
};

/**
 * Combine the observers' line of sight with the scene's lighting.
 *
 * Observers are unioned - a player controlling two characters perceives what
 * either of them perceives - and duplicates change nothing. An empty observer
 * list produces an empty perception rather than a full one: this is the
 * fail-closed direction, and the callers that matter rely on it.
 */
export function computeScenePerception(
  index: SceneVisibilityIndex,
  observers: readonly OccupancyShape[],
): ScenePerception {
  const cellCount = index.grid.width * index.grid.height;
  const illumination = computeSceneIllumination(index);
  const observerCells = buildObserverCells(index.blockers, observers);

  if (observerCells.length === 0) {
    return {
      lineOfSight: new Uint8Array(cellCount),
      illumination,
      perceived: new Uint8Array(cellCount),
    };
  }

  const lineOfSight = computeVisibleCells(index.blockers, observerCells, null);
  const perceived = new Uint8Array(cellCount);

  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    if (
      lineOfSight[cellIndex] === 1 &&
      illumination[cellIndex]! > ILLUMINATION_DARK
    ) {
      perceived[cellIndex] = 1;
    }
  }

  return { lineOfSight, illumination, perceived };
}

/** How many cells a row-major bitmap marks. Used by tests and the benchmark. */
export function countMarkedCells(bitmap: Uint8Array): number {
  let total = 0;

  for (let index = 0; index < bitmap.length; index += 1) {
    if (bitmap[index] === 1) {
      total += 1;
    }
  }

  return total;
}
