import type { SceneEntityFootprint, ScenePosition } from '@dnd/shared';

/**
 * A rectangle of grid cells something stands on.
 *
 * `position` is the top-left cell and the footprint extends right and down, so
 * a `2x3` at `(4, 5)` covers `x in [4, 6)` and `y in [5, 8)`. Movement blocking,
 * terrain blocking, and visibility all read a footprint this way; there is
 * deliberately only one convention.
 */
export type OccupancyShape = {
  position: ScenePosition;
  footprint: SceneEntityFootprint;
};

/**
 * The cells an occupancy covers, row-major, clipped to nothing.
 *
 * Callers that need grid clipping do it themselves - this returns exactly what
 * the occupancy claims, so an out-of-bounds cell stays visible to the caller
 * instead of being silently dropped here.
 */
export function expandOccupancyCells(
  occupancy: OccupancyShape,
): ScenePosition[] {
  const cells: ScenePosition[] = [];

  for (let y = 0; y < occupancy.footprint.height; y += 1) {
    for (let x = 0; x < occupancy.footprint.width; x += 1) {
      cells.push({
        x: occupancy.position.x + x,
        y: occupancy.position.y + y,
      });
    }
  }

  return cells;
}
