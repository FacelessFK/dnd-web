import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SCENE_TERRAIN_TILE,
  decodeSceneTerrain,
  doesSceneTerrainTileBlockMovement,
  getSceneTerrainTileAt,
} from '@dnd/rules';

import {
  buildTrainingRoomLayout,
  parseTerrainLayout,
} from './scene-terrain-presets.js';

test('parseTerrainLayout maps symbols to tiles in row-major order', () => {
  const layout = parseTerrainLayout(['#.#', '.~.']);

  assert.deepEqual(layout.grid, { cellSizeFeet: 5, height: 2, width: 3 });

  const tiles = decodeSceneTerrain(layout.grid, layout.terrain);

  assert.deepEqual(tiles, [
    'wall_brick',
    'flagstone',
    'wall_brick',
    'flagstone',
    'water',
    'flagstone',
  ]);
});

test('parseTerrainLayout pads short rows with the fallback tile', () => {
  const layout = parseTerrainLayout(['####', '#'], { fallbackTile: 'grass' });

  assert.equal(layout.grid.width, 4);
  assert.equal(
    getSceneTerrainTileAt(layout.grid, layout.terrain, { x: 0, y: 1 }),
    'wall_brick',
  );
  assert.equal(
    getSceneTerrainTileAt(layout.grid, layout.terrain, { x: 3, y: 1 }),
    'grass',
  );
});

test('parseTerrainLayout falls back on symbols missing from the legend', () => {
  const layout = parseTerrainLayout(['?']);

  assert.equal(
    getSceneTerrainTileAt(layout.grid, layout.terrain, { x: 0, y: 0 }),
    DEFAULT_SCENE_TERRAIN_TILE,
  );
});

test('parseTerrainLayout accepts a custom legend and cell size', () => {
  const layout = parseTerrainLayout(['ab'], {
    cellSizeFeet: 10,
    legend: { a: 'lava', b: 'ice' },
  });

  assert.equal(layout.grid.cellSizeFeet, 10);
  assert.equal(
    getSceneTerrainTileAt(layout.grid, layout.terrain, { x: 0, y: 0 }),
    'lava',
  );
  assert.equal(
    getSceneTerrainTileAt(layout.grid, layout.terrain, { x: 1, y: 0 }),
    'ice',
  );
});

test('parseTerrainLayout produces a usable grid for an empty layout', () => {
  const layout = parseTerrainLayout([]);

  assert.equal(layout.grid.width, 1);
  assert.equal(layout.grid.height, 1);
});

test('the training room layout is a sealed room with a walkable interior', () => {
  const { grid, terrain } = buildTrainingRoomLayout();

  assert.equal(grid.width, 16);
  assert.equal(grid.height, 12);

  for (let x = 0; x < grid.width; x += 1) {
    assert.ok(
      doesSceneTerrainTileBlockMovement(
        getSceneTerrainTileAt(grid, terrain, { x, y: 0 }),
      ),
      `top wall open at ${x}`,
    );
    assert.ok(
      doesSceneTerrainTileBlockMovement(
        getSceneTerrainTileAt(grid, terrain, { x, y: grid.height - 1 }),
      ),
      `bottom wall open at ${x}`,
    );
  }

  for (let y = 0; y < grid.height; y += 1) {
    assert.ok(
      doesSceneTerrainTileBlockMovement(
        getSceneTerrainTileAt(grid, terrain, { x: 0, y }),
      ),
      `left wall open at ${y}`,
    );
    assert.ok(
      doesSceneTerrainTileBlockMovement(
        getSceneTerrainTileAt(grid, terrain, { x: grid.width - 1, y }),
      ),
      `right wall open at ${y}`,
    );
  }

  assert.equal(getSceneTerrainTileAt(grid, terrain, { x: 4, y: 4 }), 'wood');
  assert.equal(getSceneTerrainTileAt(grid, terrain, { x: 13, y: 2 }), 'water');
  assert.equal(getSceneTerrainTileAt(grid, terrain, { x: 13, y: 8 }), 'rubble');
});

test('the demo starting positions sit on walkable training room floor', () => {
  const { grid, terrain } = buildTrainingRoomLayout();

  for (const position of [
    { x: 2, y: 5 },
    { x: 2, y: 6 },
  ]) {
    assert.equal(
      doesSceneTerrainTileBlockMovement(
        getSceneTerrainTileAt(grid, terrain, position),
      ),
      false,
      `starting position ${position.x},${position.y} is blocked`,
    );
  }
});
