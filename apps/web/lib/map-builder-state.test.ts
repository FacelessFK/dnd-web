import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeSceneTerrain, getSceneTerrainTileAt } from '@dnd/rules';

import {
  MAX_MAP_BUILDER_DIMENSION,
  MIN_MAP_BUILDER_DIMENSION,
  addEntity,
  canRedo,
  canUndo,
  clampDimension,
  commit,
  createEmptyDocument,
  createInitialState,
  findEntityAt,
  getBrushCells,
  getFloodFillCells,
  getLineCells,
  getRectangleCells,
  paintCells,
  parseDocument,
  redo,
  removeEntityAt,
  resizeDocument,
  serializeDocument,
  undo,
  type MapBuilderDocument,
} from './map-builder-state.js';

function createTestDocument(): MapBuilderDocument {
  return createEmptyDocument({
    baseTile: 'stone',
    height: 6,
    name: 'Test Map',
    width: 8,
  });
}

test('createEmptyDocument produces a fully painted grid at the requested size', () => {
  const document = createTestDocument();

  assert.equal(document.grid.width, 8);
  assert.equal(document.grid.height, 6);
  assert.equal(decodeSceneTerrain(document.grid, document.terrain).length, 48);
  assert.deepEqual(document.entities, []);
});

test('clampDimension keeps map sizes inside the supported range', () => {
  assert.equal(clampDimension(0), MIN_MAP_BUILDER_DIMENSION);
  assert.equal(clampDimension(9999), MAX_MAP_BUILDER_DIMENSION);
  assert.equal(clampDimension(30.9), 30);
  assert.equal(clampDimension(Number.NaN), MIN_MAP_BUILDER_DIMENSION);
});

test('paintCells writes tiles and ignores out-of-bounds cells', () => {
  const document = createTestDocument();
  const painted = paintCells(
    document,
    [
      { x: 0, y: 0 },
      { x: 7, y: 5 },
      { x: -1, y: 0 },
      { x: 8, y: 0 },
      { x: 0, y: 6 },
    ],
    'lava',
  );

  assert.equal(
    getSceneTerrainTileAt(painted.grid, painted.terrain, { x: 0, y: 0 }),
    'lava',
  );
  assert.equal(
    getSceneTerrainTileAt(painted.grid, painted.terrain, { x: 7, y: 5 }),
    'lava',
  );
  assert.equal(
    decodeSceneTerrain(painted.grid, painted.terrain).filter(
      (tile) => tile === 'lava',
    ).length,
    2,
  );
});

test('paintCells returns the same document when nothing changes', () => {
  const document = createTestDocument();

  assert.equal(paintCells(document, [], 'lava'), document);
  assert.equal(paintCells(document, [{ x: 0, y: 0 }], 'stone'), document);
  assert.equal(paintCells(document, [{ x: 99, y: 99 }], 'lava'), document);
});

test('getBrushCells returns a centred square footprint', () => {
  assert.deepEqual(getBrushCells({ x: 3, y: 3 }, 1), [{ x: 3, y: 3 }]);
  assert.equal(getBrushCells({ x: 3, y: 3 }, 3).length, 9);
  assert.equal(getBrushCells({ x: 3, y: 3 }, 5).length, 25);
  assert.ok(
    getBrushCells({ x: 3, y: 3 }, 3).some(
      (cell) => cell.x === 2 && cell.y === 2,
    ),
  );
});

test('getRectangleCells fills a region and can outline it instead', () => {
  const filled = getRectangleCells({ x: 1, y: 1 }, { x: 3, y: 3 });
  assert.equal(filled.length, 9);

  const outline = getRectangleCells(
    { x: 1, y: 1 },
    { x: 3, y: 3 },
    {
      outlineOnly: true,
    },
  );
  assert.equal(outline.length, 8);
  assert.equal(
    outline.some((cell) => cell.x === 2 && cell.y === 2),
    false,
    'the interior cell is excluded from an outline',
  );
});

test('getRectangleCells normalises reversed corners', () => {
  assert.deepEqual(
    getRectangleCells({ x: 3, y: 3 }, { x: 1, y: 1 }),
    getRectangleCells({ x: 1, y: 1 }, { x: 3, y: 3 }),
  );
});

test('getLineCells produces a connected run between two cells', () => {
  const line = getLineCells({ x: 0, y: 0 }, { x: 4, y: 2 });

  assert.deepEqual(line[0], { x: 0, y: 0 });
  assert.deepEqual(line[line.length - 1], { x: 4, y: 2 });

  for (let index = 1; index < line.length; index += 1) {
    const step =
      Math.abs(line[index]!.x - line[index - 1]!.x) +
      Math.abs(line[index]!.y - line[index - 1]!.y);

    assert.ok(step <= 2, 'line steps stay adjacent');
  }
});

test('getLineCells handles a single-cell line', () => {
  assert.deepEqual(getLineCells({ x: 2, y: 2 }, { x: 2, y: 2 }), [
    { x: 2, y: 2 },
  ]);
});

test('getFloodFillCells covers only the connected region of the same tile', () => {
  let document = createTestDocument();

  // Split the map with a vertical wall of a different tile at x = 3.
  document = paintCells(
    document,
    Array.from({ length: 6 }, (_unused, y) => ({ x: 3, y })),
    'wall',
  );

  const leftRegion = getFloodFillCells(document, { x: 0, y: 0 });

  assert.equal(leftRegion.length, 18, 'three columns of six cells');
  assert.equal(
    leftRegion.some((cell) => cell.x >= 3),
    false,
    'the fill stops at the wall',
  );

  const rightRegion = getFloodFillCells(document, { x: 7, y: 5 });

  assert.equal(rightRegion.length, 24, 'four columns of six cells');
});

test('getFloodFillCells returns nothing for an out-of-bounds origin', () => {
  assert.deepEqual(
    getFloodFillCells(createTestDocument(), { x: 50, y: 50 }),
    [],
  );
});

test('resizeDocument preserves painted terrain inside the new bounds', () => {
  let document = createTestDocument();

  document = paintCells(document, [{ x: 1, y: 1 }], 'lava');

  const grown = resizeDocument(document, { height: 10, width: 12 });

  assert.equal(grown.grid.width, 12);
  assert.equal(grown.grid.height, 10);
  assert.equal(
    getSceneTerrainTileAt(grown.grid, grown.terrain, { x: 1, y: 1 }),
    'lava',
  );
  assert.equal(decodeSceneTerrain(grown.grid, grown.terrain).length, 120);
});

test('resizeDocument drops entities that fall outside a shrunken map', () => {
  let document = createTestDocument();

  document = addEntity(
    document,
    {
      blocksMovement: true,
      blocksVision: true,
      footprint: { width: 1, height: 1 },
      hidden: false,
      name: 'Far Pillar',
      position: { x: 7, y: 5 },
      type: 'object',
    },
    'entity-far',
  );
  document = addEntity(
    document,
    {
      blocksMovement: true,
      blocksVision: true,
      footprint: { width: 1, height: 1 },
      hidden: false,
      name: 'Near Pillar',
      position: { x: 1, y: 1 },
      type: 'object',
    },
    'entity-near',
  );

  const shrunk = resizeDocument(document, { height: 4, width: 4 });

  assert.equal(shrunk.entities.length, 1);
  assert.equal(shrunk.entities[0]?.id, 'entity-near');
});

test('resizeDocument is a no-op when the size is unchanged', () => {
  const document = createTestDocument();

  assert.equal(resizeDocument(document, { height: 6, width: 8 }), document);
});

test('addEntity rejects out-of-bounds and overlapping placements', () => {
  const document = createTestDocument();
  const base = {
    blocksMovement: true,
    blocksVision: false,
    footprint: { width: 2, height: 2 },
    hidden: false,
    name: 'Crates',
    type: 'object' as const,
  };

  const placed = addEntity(
    document,
    { ...base, position: { x: 1, y: 1 } },
    'a',
  );
  assert.equal(placed.entities.length, 1);

  const overlapping = addEntity(
    placed,
    { ...base, position: { x: 2, y: 2 } },
    'b',
  );
  assert.equal(
    overlapping.entities.length,
    1,
    'overlapping placement rejected',
  );

  const offMap = addEntity(placed, { ...base, position: { x: 7, y: 5 } }, 'c');
  assert.equal(offMap.entities.length, 1, 'out-of-bounds placement rejected');

  const adjacent = addEntity(
    placed,
    { ...base, position: { x: 3, y: 1 } },
    'd',
  );
  assert.equal(adjacent.entities.length, 2, 'adjacent placement accepted');
});

test('findEntityAt and removeEntityAt address an entity by any covered cell', () => {
  const document = addEntity(
    createTestDocument(),
    {
      blocksMovement: true,
      blocksVision: false,
      footprint: { width: 2, height: 2 },
      hidden: false,
      name: 'Crates',
      position: { x: 1, y: 1 },
      type: 'object',
    },
    'crates',
  );

  assert.equal(findEntityAt(document, { x: 2, y: 2 })?.id, 'crates');
  assert.equal(findEntityAt(document, { x: 3, y: 3 }), null);

  const removed = removeEntityAt(document, { x: 2, y: 2 });
  assert.deepEqual(removed.entities, []);
  assert.equal(removeEntityAt(document, { x: 5, y: 5 }), document);
});

test('commit, undo, and redo walk the edit history', () => {
  const initial = createInitialState(createTestDocument());

  assert.equal(canUndo(initial), false);
  assert.equal(canRedo(initial), false);

  const painted = commit(
    initial,
    paintCells(initial.document, [{ x: 0, y: 0 }], 'lava'),
  );

  assert.equal(canUndo(painted), true);
  assert.equal(
    getSceneTerrainTileAt(painted.document.grid, painted.document.terrain, {
      x: 0,
      y: 0,
    }),
    'lava',
  );

  const undone = undo(painted);

  assert.equal(
    getSceneTerrainTileAt(undone.document.grid, undone.document.terrain, {
      x: 0,
      y: 0,
    }),
    'stone',
  );
  assert.equal(canRedo(undone), true);

  const redone = redo(undone);

  assert.equal(
    getSceneTerrainTileAt(redone.document.grid, redone.document.terrain, {
      x: 0,
      y: 0,
    }),
    'lava',
  );
});

test('commit ignores a no-op edit so undo does not stall', () => {
  const initial = createInitialState(createTestDocument());
  const unchanged = commit(initial, initial.document);

  assert.equal(unchanged, initial);
  assert.equal(canUndo(unchanged), false);
});

test('a new commit clears the redo branch', () => {
  const initial = createInitialState(createTestDocument());
  const first = commit(
    initial,
    paintCells(initial.document, [{ x: 0, y: 0 }], 'lava'),
  );
  const undone = undo(first);

  assert.equal(canRedo(undone), true);

  const diverged = commit(
    undone,
    paintCells(undone.document, [{ x: 1, y: 1 }], 'water'),
  );

  assert.equal(canRedo(diverged), false);
});

test('undo and redo at the ends of history are no-ops', () => {
  const initial = createInitialState(createTestDocument());

  assert.equal(undo(initial), initial);
  assert.equal(redo(initial), initial);
});

test('serializeDocument and parseDocument round-trip a map', () => {
  let document = createTestDocument();

  document = paintCells(document, [{ x: 2, y: 2 }], 'water');
  document = addEntity(
    document,
    {
      blocksMovement: true,
      blocksVision: true,
      footprint: { width: 1, height: 1 },
      hidden: false,
      name: 'Pillar',
      position: { x: 4, y: 4 },
      type: 'object',
    },
    'pillar',
  );

  const parsed = parseDocument(serializeDocument(document));

  assert.ok(parsed);
  assert.equal(parsed.name, 'Test Map');
  assert.equal(parsed.grid.width, 8);
  assert.equal(
    getSceneTerrainTileAt(parsed.grid, parsed.terrain, { x: 2, y: 2 }),
    'water',
  );
  assert.equal(parsed.entities.length, 1);
  assert.equal(parsed.entities[0]?.id, 'pillar');
});

test('parseDocument rejects malformed input instead of throwing', () => {
  assert.equal(parseDocument('not json'), null);
  assert.equal(parseDocument('{}'), null);
  assert.equal(parseDocument(JSON.stringify({ version: 1 })), null);
  assert.equal(
    parseDocument(JSON.stringify({ version: 1, document: { name: 'x' } })),
    null,
  );
});

test('parseDocument normalises unknown tiles and oversized grids', () => {
  const parsed = parseDocument(
    JSON.stringify({
      document: {
        entities: [],
        grid: { cellSizeFeet: 5, height: 4, width: 4 },
        name: 'Odd Map',
        terrain: { runs: [{ tile: 'not_a_real_tile', length: 16 }] },
      },
      version: 1,
    }),
  );

  assert.ok(parsed);
  assert.equal(decodeSceneTerrain(parsed.grid, parsed.terrain).length, 16);
  assert.equal(
    getSceneTerrainTileAt(parsed.grid, parsed.terrain, { x: 0, y: 0 }),
    'stone',
  );
});
