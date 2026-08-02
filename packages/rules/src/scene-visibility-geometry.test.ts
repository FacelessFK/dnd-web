import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blocksVisionAt,
  chebyshevDistance,
  computeVisibleCells,
  createVisionBlockerGrid,
  hasLineOfSight,
  isWithinGrid,
  toCellIndex,
  type VisionBlockerGrid,
} from './scene-visibility-geometry.js';

/**
 * Build a blocker grid from a picture, so a test reads as the map it describes.
 * `#` blocks vision, anything else does not.
 */
function parseGrid(picture: string): VisionBlockerGrid {
  const rows = picture
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  const width = rows[0]!.length;

  for (const row of rows) {
    assert.equal(row.length, width, 'every row must be the same width');
  }

  const grid = createVisionBlockerGrid({
    cellSizeFeet: 5,
    width,
    height: rows.length,
  });

  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '#') {
        grid.blocked[toCellIndex(grid, x, y)] = 1;
      }
    });
  });

  return grid;
}

function visibleCellKeys(
  grid: VisionBlockerGrid,
  visible: Uint8Array,
): string[] {
  const keys: string[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (visible[toCellIndex(grid, x, y)] === 1) {
        keys.push(`${x},${y}`);
      }
    }
  }

  return keys;
}

test('an observer always sees its own cell', () => {
  const grid = parseGrid(`
    ###
    ###
    ###
  `);

  assert.equal(hasLineOfSight(grid, 1, 1, 1, 1), true);
});

test('an empty room is entirely visible', () => {
  const grid = parseGrid(`
    .....
    .....
    .....
    .....
    .....
  `);

  const visible = computeVisibleCells(grid, [{ x: 2, y: 2 }]);

  assert.equal(visibleCellKeys(grid, visible).length, 25);
});

test('a single orthogonal blocker is itself seen but hides what is behind it', () => {
  const grid = parseGrid(`
    .....
    .....
    .#...
    .....
    .....
  `);

  // The blocker's near face is visible.
  assert.equal(hasLineOfSight(grid, 0, 2, 1, 2), true);
  // Everything strictly behind it on the same row is not.
  assert.equal(hasLineOfSight(grid, 0, 2, 2, 2), false);
  assert.equal(hasLineOfSight(grid, 0, 2, 4, 2), false);
  // A cell whose ray never enters the blocker still is. Note that (4,0) is
  // *not* such a cell: the segment from (0,2) to (4,0) has slope -1/2 and
  // crosses column 1 while still inside row 2, so it passes through the blocker
  // and is correctly hidden. Only rays steep enough to leave row 2 before
  // column 1 miss it.
  assert.equal(hasLineOfSight(grid, 0, 2, 4, 0), false);
  assert.equal(hasLineOfSight(grid, 0, 2, 1, 0), true);
  assert.equal(hasLineOfSight(grid, 0, 2, 0, 0), true);
  assert.equal(hasLineOfSight(grid, 0, 2, 1, 4), true);
});

test('two orthogonal blockers meeting at a corner seal the diagonal', () => {
  const grid = parseGrid(`
    ....
    ..#.
    .#..
    ....
  `);

  assert.equal(hasLineOfSight(grid, 0, 0, 3, 3), false);
});

test('one blocker beside a corner does not seal it', () => {
  const grid = parseGrid(`
    ....
    ..#.
    ....
    ....
  `);

  assert.equal(hasLineOfSight(grid, 0, 0, 3, 3), true);
});

test('a zero-width crack between two touching blockers cannot be seen through', () => {
  const grid = parseGrid(`
    .#.
    #..
    ...
  `);

  assert.equal(hasLineOfSight(grid, 0, 0, 1, 1), false);
  assert.equal(hasLineOfSight(grid, 0, 0, 2, 2), false);
});

test('a diagonal observer sees a diagonal target across open ground', () => {
  const grid = parseGrid(`
    ....
    ....
    ....
    ....
  `);

  assert.equal(hasLineOfSight(grid, 0, 0, 3, 3), true);
  assert.equal(hasLineOfSight(grid, 3, 0, 0, 3), true);
});

test('a solid diagonal wall cannot be seen through', () => {
  const grid = parseGrid(`
    .#..
    .#..
    .#..
    .#..
  `);

  assert.equal(hasLineOfSight(grid, 0, 0, 3, 3), false);
  assert.equal(hasLineOfSight(grid, 0, 2, 2, 2), false);
});

test('traversal is a supercover, so vision does not leak through a staircase wall', () => {
  // A thin Bresenham line skips (1,1) here and reports the target visible. The
  // supercover enters it and correctly reports the wall.
  const grid = parseGrid(`
    ..#.
    .#..
    ....
    ....
  `);

  assert.equal(hasLineOfSight(grid, 0, 0, 3, 1), false);
});

test('blockers on the map edge behave like any other blocker', () => {
  const grid = parseGrid(`
    #....
    #....
    #....
    .....
    .....
  `);

  // Along the edge column, the first blocker stops the rest.
  assert.equal(hasLineOfSight(grid, 0, 4, 0, 3), true);
  assert.equal(hasLineOfSight(grid, 0, 4, 0, 2), true);
  assert.equal(hasLineOfSight(grid, 0, 4, 0, 1), false);
  assert.equal(hasLineOfSight(grid, 0, 4, 0, 0), false);
});

test('there are no blockers outside the grid', () => {
  const grid = parseGrid(`
    ...
    ...
    ...
  `);

  assert.equal(blocksVisionAt(grid, -1, 0), false);
  assert.equal(blocksVisionAt(grid, 0, -1), false);
  assert.equal(blocksVisionAt(grid, 3, 0), false);
  assert.equal(blocksVisionAt(grid, 0, 3), false);
  assert.equal(isWithinGrid(grid, 3, 3), false);
});

test('a 1x1 map is entirely visible to the one cell it has', () => {
  const grid = parseGrid('.');
  const visible = computeVisibleCells(grid, [{ x: 0, y: 0 }]);

  assert.deepEqual(visibleCellKeys(grid, visible), ['0,0']);
});

test('an observer outside the map contributes no visibility', () => {
  const grid = parseGrid(`
    ...
    ...
    ...
  `);

  for (const origin of [
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 3, y: 1 },
    { x: 1, y: 3 },
  ]) {
    assert.deepEqual(
      visibleCellKeys(grid, computeVisibleCells(grid, [origin])),
      [],
      `origin ${origin.x},${origin.y} must contribute nothing`,
    );
  }
});

test('multiple observers union their visibility', () => {
  const grid = parseGrid(`
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
  `);

  const west = computeVisibleCells(grid, [{ x: 0, y: 2 }]);
  const east = computeVisibleCells(grid, [{ x: 4, y: 2 }]);
  const both = computeVisibleCells(grid, [
    { x: 0, y: 2 },
    { x: 4, y: 2 },
  ]);

  const westKeys = new Set(visibleCellKeys(grid, west));
  const eastKeys = new Set(visibleCellKeys(grid, east));

  assert.equal(westKeys.has('4,2'), false, 'the wall hides the far side');
  assert.equal(eastKeys.has('0,2'), false);

  for (const key of visibleCellKeys(grid, both)) {
    assert.equal(
      westKeys.has(key) || eastKeys.has(key),
      true,
      `${key} must come from one of the observers`,
    );
  }

  for (const key of [...westKeys, ...eastKeys]) {
    assert.equal(
      visibleCellKeys(grid, both).includes(key),
      true,
      `${key} must survive the union`,
    );
  }
});

test('a duplicated observer changes nothing', () => {
  const grid = parseGrid(`
    .....
    ..#..
    .....
  `);

  const once = computeVisibleCells(grid, [{ x: 0, y: 1 }]);
  const twice = computeVisibleCells(grid, [
    { x: 0, y: 1 },
    { x: 0, y: 1 },
  ]);

  assert.deepEqual([...twice], [...once]);
});

test('observer order does not change the union', () => {
  const grid = parseGrid(`
    .#...
    ...#.
    .....
    ..#..
    .....
  `);

  const forward = computeVisibleCells(grid, [
    { x: 0, y: 0 },
    { x: 4, y: 4 },
    { x: 2, y: 2 },
  ]);
  const reversed = computeVisibleCells(grid, [
    { x: 2, y: 2 },
    { x: 4, y: 4 },
    { x: 0, y: 0 },
  ]);

  assert.deepEqual([...reversed], [...forward]);
});

test('the same input always produces the same ordered output', () => {
  const grid = parseGrid(`
    .....#....
    ..#.......
    ......#...
    .#........
    .......#..
    ....#.....
    ..........
    ...#......
    ..........
    .....#....
  `);
  const origins = [
    { x: 0, y: 0 },
    { x: 9, y: 9 },
  ];

  const first = visibleCellKeys(grid, computeVisibleCells(grid, origins));
  const second = visibleCellKeys(grid, computeVisibleCells(grid, origins));

  assert.deepEqual(second, first);
});

test('line of sight is symmetric', () => {
  // A fixed pseudo-random scatter, so the property is exercised over many
  // slopes rather than the handful a hand-drawn map covers - and the same
  // scatter every run, because a flaky security test is worthless.
  const size = 24;
  const grid = createVisionBlockerGrid({
    cellSizeFeet: 5,
    width: size,
    height: size,
  });
  let seed = 20260802;

  for (let index = 0; index < size * size; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;

    if (seed % 5 === 0) {
      grid.blocked[index] = 1;
    }
  }

  for (let ay = 0; ay < size; ay += 1) {
    for (let ax = 0; ax < size; ax += 1) {
      for (let by = 0; by < size; by += 1) {
        for (let bx = 0; bx < size; bx += 1) {
          assert.equal(
            hasLineOfSight(grid, ax, ay, bx, by),
            hasLineOfSight(grid, bx, by, ax, ay),
            `asymmetric between ${ax},${ay} and ${bx},${by}`,
          );
        }
      }
    }
  }
});

test('range is measured in Chebyshev cells, so a diagonal step costs one', () => {
  assert.equal(chebyshevDistance({ x: 0, y: 0 }, { x: 3, y: 3 }), 3);
  assert.equal(chebyshevDistance({ x: 0, y: 0 }, { x: 3, y: 1 }), 3);
  assert.equal(chebyshevDistance({ x: 5, y: 5 }, { x: 5, y: 5 }), 0);
  assert.equal(chebyshevDistance({ x: 4, y: 1 }, { x: 1, y: 4 }), 3);
});

test('a bounded range stops at the Chebyshev radius', () => {
  const grid = parseGrid(`
    .......
    .......
    .......
    .......
    .......
    .......
    .......
  `);

  const visible = computeVisibleCells(grid, [{ x: 3, y: 3 }], 2);
  const keys = new Set(visibleCellKeys(grid, visible));

  assert.equal(keys.has('1,1'), true, 'the corner of the radius is inside it');
  assert.equal(keys.has('5,5'), true);
  assert.equal(keys.has('0,3'), false, 'one cell beyond the radius is outside');
  assert.equal(keys.has('6,3'), false);
  assert.equal(keys.size, 25);
});

test('the maximum supported grid resolves its far corner', () => {
  const grid = createVisionBlockerGrid({
    cellSizeFeet: 5,
    width: 500,
    height: 500,
  });

  assert.equal(hasLineOfSight(grid, 0, 0, 499, 499), true);
  assert.equal(hasLineOfSight(grid, 0, 0, 499, 137), true);

  grid.blocked[toCellIndex(grid, 250, 250)] = 1;

  assert.equal(hasLineOfSight(grid, 0, 0, 499, 499), false);
});
