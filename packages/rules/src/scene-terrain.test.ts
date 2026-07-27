import assert from 'node:assert/strict';
import test from 'node:test';

import type { GridDefinition, SceneTerrainTile } from '@dnd/shared';

import {
  DEFAULT_SCENE_TERRAIN_TILE,
  applySceneTerrainCells,
  buildBlockingTerrainOccupancies,
  createSceneTerrain,
  decodeSceneTerrain,
  doesSceneTerrainTileBlockMovement,
  doesSceneTerrainTileBlockVision,
  encodeSceneTerrain,
  getSceneTerrainTileAt,
  isSceneTerrainTile,
  resizeSceneTerrain,
} from './index.js';

const grid: GridDefinition = { cellSizeFeet: 5, width: 4, height: 3 };

test('createSceneTerrain fills the whole grid with a single run', () => {
  const terrain = createSceneTerrain(grid, 'grass');

  assert.deepEqual(terrain.runs, [{ tile: 'grass', length: 12 }]);
  assert.equal(decodeSceneTerrain(grid, terrain).length, 12);
});

test('decodeSceneTerrain pads short documents with the fallback tile', () => {
  const tiles = decodeSceneTerrain(grid, {
    runs: [{ tile: 'wood', length: 2 }],
  });

  assert.equal(tiles.length, 12);
  assert.deepEqual(tiles.slice(0, 2), ['wood', 'wood']);
  assert.equal(tiles[2], DEFAULT_SCENE_TERRAIN_TILE);
  assert.equal(tiles[11], DEFAULT_SCENE_TERRAIN_TILE);
});

test('decodeSceneTerrain truncates documents longer than the grid', () => {
  const tiles = decodeSceneTerrain(grid, {
    runs: [{ tile: 'lava', length: 999 }],
  });

  assert.equal(tiles.length, 12);
  assert.ok(tiles.every((tile) => tile === 'lava'));
});

test('decodeSceneTerrain falls back on unknown tile identifiers', () => {
  const tiles = decodeSceneTerrain(grid, {
    runs: [{ tile: 'not_a_tile' as SceneTerrainTile, length: 12 }],
  });

  assert.ok(tiles.every((tile) => tile === DEFAULT_SCENE_TERRAIN_TILE));
});

test('decodeSceneTerrain treats a null terrain layer as an unpainted map', () => {
  const tiles = decodeSceneTerrain(grid, null);

  assert.equal(tiles.length, 12);
  assert.ok(tiles.every((tile) => tile === DEFAULT_SCENE_TERRAIN_TILE));
});

test('encodeSceneTerrain round-trips a decoded tile array', () => {
  const painted = applySceneTerrainCells(
    grid,
    createSceneTerrain(grid, 'dirt'),
    [
      { position: { x: 1, y: 1 }, tile: 'water' },
      { position: { x: 2, y: 1 }, tile: 'water' },
    ],
  );

  const tiles = decodeSceneTerrain(grid, painted);

  assert.deepEqual(encodeSceneTerrain(tiles), painted);
  assert.equal(tiles[grid.width * 1 + 1], 'water');
  assert.equal(tiles[grid.width * 1 + 2], 'water');
  assert.equal(tiles[0], 'dirt');
});

test('encodeSceneTerrain merges adjacent identical tiles into one run', () => {
  const terrain = encodeSceneTerrain([
    'stone',
    'stone',
    'wall',
    'stone',
  ] as SceneTerrainTile[]);

  assert.deepEqual(terrain.runs, [
    { tile: 'stone', length: 2 },
    { tile: 'wall', length: 1 },
    { tile: 'stone', length: 1 },
  ]);
});

test('applySceneTerrainCells ignores out-of-bounds and invalid cells', () => {
  const base = createSceneTerrain(grid, 'stone');
  const painted = applySceneTerrainCells(grid, base, [
    { position: { x: -1, y: 0 }, tile: 'lava' },
    { position: { x: 4, y: 0 }, tile: 'lava' },
    { position: { x: 0, y: 3 }, tile: 'lava' },
    { position: { x: 1.5, y: 0 }, tile: 'lava' },
    { position: { x: 0, y: 0 }, tile: 'bogus' as SceneTerrainTile },
    { position: { x: 3, y: 2 }, tile: 'lava' },
  ]);

  const tiles = decodeSceneTerrain(grid, painted);

  assert.equal(tiles[0], 'stone');
  assert.equal(tiles[11], 'lava');
  assert.equal(tiles.filter((tile) => tile === 'lava').length, 1);
});

test('getSceneTerrainTileAt reads row-major positions and clamps outside the grid', () => {
  const terrain = applySceneTerrainCells(
    grid,
    createSceneTerrain(grid, 'sand'),
    [{ position: { x: 3, y: 0 }, tile: 'ice' }],
  );

  assert.equal(getSceneTerrainTileAt(grid, terrain, { x: 3, y: 0 }), 'ice');
  assert.equal(getSceneTerrainTileAt(grid, terrain, { x: 0, y: 0 }), 'sand');
  assert.equal(
    getSceneTerrainTileAt(grid, terrain, { x: 99, y: 99 }),
    DEFAULT_SCENE_TERRAIN_TILE,
  );
});

test('resizeSceneTerrain preserves painted cells still inside the new bounds', () => {
  const terrain = applySceneTerrainCells(
    grid,
    createSceneTerrain(grid, 'stone'),
    [
      { position: { x: 0, y: 0 }, tile: 'wall' },
      { position: { x: 3, y: 2 }, tile: 'lava' },
    ],
  );

  const grown: GridDefinition = { cellSizeFeet: 5, width: 6, height: 5 };
  const resized = resizeSceneTerrain(grid, grown, terrain);

  assert.equal(getSceneTerrainTileAt(grown, resized, { x: 0, y: 0 }), 'wall');
  assert.equal(getSceneTerrainTileAt(grown, resized, { x: 3, y: 2 }), 'lava');
  assert.equal(
    getSceneTerrainTileAt(grown, resized, { x: 5, y: 4 }),
    DEFAULT_SCENE_TERRAIN_TILE,
  );
  assert.equal(decodeSceneTerrain(grown, resized).length, 30);
});

test('resizeSceneTerrain drops cells that fall outside a shrunken grid', () => {
  const terrain = applySceneTerrainCells(
    grid,
    createSceneTerrain(grid, 'stone'),
    [{ position: { x: 3, y: 2 }, tile: 'lava' }],
  );

  const shrunk: GridDefinition = { cellSizeFeet: 5, width: 2, height: 2 };
  const resized = resizeSceneTerrain(grid, shrunk, terrain);
  const tiles = decodeSceneTerrain(shrunk, resized);

  assert.equal(tiles.length, 4);
  assert.ok(tiles.every((tile) => tile === 'stone'));
});

test('terrain tile properties gate movement and vision', () => {
  assert.equal(doesSceneTerrainTileBlockMovement('wall'), true);
  assert.equal(doesSceneTerrainTileBlockMovement('chasm'), true);
  assert.equal(doesSceneTerrainTileBlockMovement('deep_water'), true);
  assert.equal(doesSceneTerrainTileBlockMovement('water'), false);
  assert.equal(doesSceneTerrainTileBlockMovement('grass'), false);

  assert.equal(doesSceneTerrainTileBlockVision('wall'), true);
  assert.equal(doesSceneTerrainTileBlockVision('void'), true);
  assert.equal(doesSceneTerrainTileBlockVision('chasm'), false);
  assert.equal(doesSceneTerrainTileBlockVision('grass'), false);
});

test('buildBlockingTerrainOccupancies returns one occupancy per blocking cell', () => {
  const terrain = applySceneTerrainCells(
    grid,
    createSceneTerrain(grid, 'stone'),
    [
      { position: { x: 1, y: 0 }, tile: 'wall' },
      { position: { x: 2, y: 2 }, tile: 'chasm' },
    ],
  );

  const occupancies = buildBlockingTerrainOccupancies(grid, terrain);

  assert.equal(occupancies.length, 2);
  assert.deepEqual(occupancies[0], {
    footprint: { width: 1, height: 1 },
    position: { x: 1, y: 0 },
  });
  assert.deepEqual(occupancies[1], {
    footprint: { width: 1, height: 1 },
    position: { x: 2, y: 2 },
  });
});

test('buildBlockingTerrainOccupancies is empty for fully walkable terrain', () => {
  assert.deepEqual(
    buildBlockingTerrainOccupancies(grid, createSceneTerrain(grid, 'wood')),
    [],
  );
});

test('isSceneTerrainTile guards unknown values', () => {
  assert.equal(isSceneTerrainTile('wall'), true);
  assert.equal(isSceneTerrainTile('wall_brick'), true);
  assert.equal(isSceneTerrainTile('nope'), false);
  assert.equal(isSceneTerrainTile(null), false);
  assert.equal(isSceneTerrainTile(7), false);
});
