/**
 * Deterministic grid line of sight.
 *
 * This module is the geometry, and nothing else. It knows about a rectangle of
 * cells, which of them stop light, and how to decide whether one cell can see
 * another. It does not know what a scene, an entity, a player, or a light is.
 *
 * ---------------------------------------------------------------------------
 * Semantics
 * ---------------------------------------------------------------------------
 * These are the rules the rest of M3 is built on. They are stated here rather
 * than left implicit because a visibility rule that is only expressed as code
 * gets "fixed" into a different rule the first time someone tunes it, and this
 * one decides what a player is allowed to know.
 *
 * **Origin.** Cell `(0, 0)` is the top-left cell. `x` grows right, `y` grows
 * down. This matches the row-major terrain encoding, where cell `(x, y)` is
 * index `y * width + x`.
 *
 * **Positions are cells, not points.** Every coordinate in this module is a
 * whole cell. There are no sub-cell positions and no fractional coordinates.
 *
 * **Footprints.** An occupancy's `position` is its top-left cell and its
 * footprint extends right and down, so a `2x3` at `(4, 5)` occupies
 * `x in [4, 6)`, `y in [5, 8)`. That is already how movement blocking reads a
 * footprint (`doesOccupancyFitWithinGrid`), and visibility does not get a
 * second convention.
 *
 * **Observer cells.** An observer is a set of cells, not a point. A creature
 * with a multi-cell footprint sees from every cell it occupies, and its own
 * cells are always visible to it - including when it is standing in something
 * that blocks vision.
 *
 * **Line traversal.** A cell is visible from an observer cell when the straight
 * segment joining the two cell *centres* reaches the target without passing
 * through a vision blocker. The segment is walked as a **supercover**: every
 * cell the segment enters is tested, not just one per column. A thin
 * Bresenham line would skip cells the segment genuinely crosses and let vision
 * leak diagonally through solid walls.
 *
 * All of that traversal is integer arithmetic. Boundary crossings are compared
 * by cross-multiplication (`(1 + 2n) * other` on each axis) rather than by
 * dividing to get a distance, so no floating-point comparison decides whether a
 * player may see a cell. That is a deliberate constraint: this is a security
 * boundary, and an epsilon is not a rule.
 *
 * **Range.** Distance is Chebyshev - `max(|dx|, |dy|)` - so one diagonal step
 * costs the same as one orthogonal step. That is the `dnd-5e-2014` grid rule
 * this product is built on, and it keeps every distance an integer. Line of
 * sight itself is unbounded within the grid; only light sources have a radius.
 *
 * **Diagonals and corners.** When the segment passes *exactly* through the
 * lattice point shared by four cells - which happens on a true diagonal, and on
 * any slope that lands on a corner - the step is diagonal and touches the two
 * flanking cells at a single point of zero width.
 *
 * The corner policy is: **a diagonal step is blocked when both flanking cells
 * block vision.** Two blockers meeting at a corner therefore seal it, and a
 * player cannot see between two touching walls through a crack of zero width.
 * A single blocker at one side of the corner does not seal it, which is the
 * conventional grid behaviour and keeps a lone pillar from casting a shadow
 * shaped nothing like a pillar.
 *
 * **Blocking cells.** A blocker may itself be seen: traversal tests every cell
 * it enters *except* the observer's own cell and the target. So the near face
 * of a wall is visible and everything strictly behind it is not.
 *
 * **Map bounds.** A cell outside the grid does not exist and cannot block
 * anything, so there are no blockers beyond the edge. Origins outside the grid
 * are ignored rather than clamped - clamping would silently move an observer to
 * a cell it is not on and show its owner someone else's view.
 *
 * **Multiple observers.** Visibility is a union: a cell is visible when any
 * observer cell can see it. Duplicate observers change nothing.
 *
 * **Determinism.** The same grid and the same origins always produce the same
 * bitmap, and callers that turn a bitmap into a list walk it row-major. There
 * is no randomness, no clock, and no iteration over a hash map's insertion
 * order anywhere in this file.
 */
import type { GridDefinition, ScenePosition } from '@dnd/shared';

/**
 * A rectangle of cells and which of them stop vision.
 *
 * `blocked` is row-major with one byte per cell - `1` blocks, `0` does not -
 * because line of sight reads it once per traversal step and a typed array
 * keeps that a bounds-checked index rather than a hash lookup.
 */
export type VisionBlockerGrid = {
  width: number;
  height: number;
  blocked: Uint8Array;
};

export function createVisionBlockerGrid(
  grid: GridDefinition,
): VisionBlockerGrid {
  return {
    width: grid.width,
    height: grid.height,
    blocked: new Uint8Array(grid.width * grid.height),
  };
}

export function isWithinGrid(
  grid: Pick<VisionBlockerGrid, 'width' | 'height'>,
  x: number,
  y: number,
): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function toCellIndex(
  grid: Pick<VisionBlockerGrid, 'width'>,
  x: number,
  y: number,
): number {
  return y * grid.width + x;
}

/** Cells outside the grid do not exist, so they never block. */
export function blocksVisionAt(
  grid: VisionBlockerGrid,
  x: number,
  y: number,
): boolean {
  return (
    isWithinGrid(grid, x, y) && grid.blocked[toCellIndex(grid, x, y)] === 1
  );
}

/** Diagonals cost one step, per the 2014 grid rules. Always an integer. */
export function chebyshevDistance(
  from: ScenePosition,
  to: ScenePosition,
): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

/**
 * Whether the centre of `(fromX, fromY)` can see the centre of `(toX, toY)`.
 *
 * Symmetric by construction: the segment between two cell centres is the same
 * segment travelled either way, and the corner rule is symmetric in its two
 * flanking cells, so `hasLineOfSight(a, b) === hasLineOfSight(b, a)`. A test
 * asserts that over a randomised-but-seeded grid rather than trusting the
 * argument.
 */
export function hasLineOfSight(
  grid: VisionBlockerGrid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  if (fromX === toX && fromY === toY) {
    return true;
  }

  const dx = toX - fromX;
  const dy = toY - fromY;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);

  let x = fromX;
  let y = fromY;
  // How many cell boundaries the segment has already crossed on each axis. The
  // next crossing on an axis sits at `(1 + 2n)` half-cells from the origin
  // centre, which is what keeps the comparison below in integers.
  let crossedX = 0;
  let crossedY = 0;

  for (;;) {
    if (ady === 0) {
      x += stepX;
    } else if (adx === 0) {
      y += stepY;
    } else {
      const nextX = (1 + 2 * crossedX) * ady;
      const nextY = (1 + 2 * crossedY) * adx;

      if (nextX < nextY) {
        x += stepX;
        crossedX += 1;
      } else if (nextY < nextX) {
        y += stepY;
        crossedY += 1;
      } else {
        // The segment passes exactly through the shared corner of four cells.
        // It touches the two flanking cells at a point of zero width; sealing
        // the corner requires both of them.
        if (
          blocksVisionAt(grid, x + stepX, y) &&
          blocksVisionAt(grid, x, y + stepY)
        ) {
          return false;
        }

        x += stepX;
        y += stepY;
        crossedX += 1;
        crossedY += 1;
      }
    }

    // The target itself may block vision and still be seen - a wall has a near
    // face - so it is never tested as an obstruction.
    if (x === toX && y === toY) {
      return true;
    }

    if (blocksVisionAt(grid, x, y)) {
      return false;
    }
  }
}

/**
 * The union of what a set of origin cells can see, as a row-major bitmap.
 *
 * `maxRange` is a Chebyshev radius in cells, or `null` for "as far as the grid
 * goes". Origins outside the grid contribute nothing. Duplicate origins are
 * harmless: the second pass finds every cell already marked and skips it.
 */
export function computeVisibleCells(
  grid: VisionBlockerGrid,
  origins: readonly ScenePosition[],
  maxRange: number | null = null,
): Uint8Array {
  const visible = new Uint8Array(grid.width * grid.height);

  for (const origin of origins) {
    if (!isWithinGrid(grid, origin.x, origin.y)) {
      continue;
    }

    visible[toCellIndex(grid, origin.x, origin.y)] = 1;

    const minX = maxRange === null ? 0 : Math.max(0, origin.x - maxRange);
    const minY = maxRange === null ? 0 : Math.max(0, origin.y - maxRange);
    const maxX =
      maxRange === null
        ? grid.width - 1
        : Math.min(grid.width - 1, origin.x + maxRange);
    const maxY =
      maxRange === null
        ? grid.height - 1
        : Math.min(grid.height - 1, origin.y + maxRange);

    for (let y = minY; y <= maxY; y += 1) {
      const rowOffset = y * grid.width;

      for (let x = minX; x <= maxX; x += 1) {
        if (visible[rowOffset + x] === 1) {
          continue;
        }

        if (hasLineOfSight(grid, origin.x, origin.y, x, y)) {
          visible[rowOffset + x] = 1;
        }
      }
    }
  }

  return visible;
}
