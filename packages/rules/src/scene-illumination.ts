/**
 * How brightly each cell of a scene is lit.
 *
 * Illumination is computed for the whole scene, independently of who is
 * looking. That is not an optimisation - it is the rule. A torch lights the
 * room whether or not anyone can see the room, and folding the observer into
 * this step would make "is it lit" depend on "can I see it", which is circular.
 *
 * ---------------------------------------------------------------------------
 * Lighting semantics
 * ---------------------------------------------------------------------------
 * - Ambient `bright` lights every cell brightly; ambient `dim` lights every
 *   cell dimly; ambient `dark` lights nothing.
 * - A light source lights cells within `brightRadius` brightly, and cells
 *   beyond that but within `dimRadius` dimly. Both are Chebyshev radii in
 *   cells, measured from the nearest cell the emitter occupies.
 * - Light does not pass through a vision blocker. A source's reach is computed
 *   through the same grid geometry an observer uses, so a torch behind a wall
 *   does not light the far side of it.
 * - Where sources overlap, the strongest illumination wins. Ambient is just
 *   another contributor to that maximum, so a source can raise a dim room to
 *   bright but nothing can darken a bright one.
 *
 * Darkvision and other vision types are deliberately absent. M3 establishes
 * visibility; the perception ruleset is M7's.
 */
import {
  chebyshevDistance,
  computeVisibleCells,
  toCellIndex,
} from './scene-visibility-geometry.js';
import type { SceneVisibilityIndex } from './scene-visibility-index.js';

/**
 * Illumination as a comparable rank, so "strongest wins" is a `Math.max` over
 * integers rather than a lookup table of level pairs.
 */
export const ILLUMINATION_DARK = 0;
export const ILLUMINATION_DIM = 1;
export const ILLUMINATION_BRIGHT = 2;

export type IlluminationRank =
  | typeof ILLUMINATION_DARK
  | typeof ILLUMINATION_DIM
  | typeof ILLUMINATION_BRIGHT;

const ambientRanks = {
  bright: ILLUMINATION_BRIGHT,
  dim: ILLUMINATION_DIM,
  dark: ILLUMINATION_DARK,
} as const;

/** Row-major illumination rank per cell. */
export function computeSceneIllumination(
  index: SceneVisibilityIndex,
): Uint8Array {
  const cellCount = index.grid.width * index.grid.height;
  const illumination = new Uint8Array(cellCount);

  illumination.fill(ambientRanks[index.ambientLight]);

  for (const source of index.lightSources) {
    // Reach is bounded by the outer radius, so a small torch on a large map
    // costs a small box rather than a full-grid sweep.
    const lit = computeVisibleCells(
      index.blockers,
      source.cells,
      source.dimRadius,
    );

    const minX = Math.max(
      0,
      Math.min(...source.cells.map((cell) => cell.x)) - source.dimRadius,
    );
    const maxX = Math.min(
      index.grid.width - 1,
      Math.max(...source.cells.map((cell) => cell.x)) + source.dimRadius,
    );
    const minY = Math.max(
      0,
      Math.min(...source.cells.map((cell) => cell.y)) - source.dimRadius,
    );
    const maxY = Math.min(
      index.grid.height - 1,
      Math.max(...source.cells.map((cell) => cell.y)) + source.dimRadius,
    );

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const cellIndex = toCellIndex(index.grid, x, y);

        if (lit[cellIndex] !== 1) {
          continue;
        }

        let nearest = Number.POSITIVE_INFINITY;

        for (const cell of source.cells) {
          const distance = chebyshevDistance(cell, { x, y });

          if (distance < nearest) {
            nearest = distance;
          }
        }

        const rank =
          nearest <= source.brightRadius
            ? ILLUMINATION_BRIGHT
            : nearest <= source.dimRadius
              ? ILLUMINATION_DIM
              : ILLUMINATION_DARK;

        if (rank > illumination[cellIndex]!) {
          illumination[cellIndex] = rank;
        }
      }
    }
  }

  return illumination;
}
