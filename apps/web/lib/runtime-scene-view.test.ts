import assert from 'node:assert/strict';
import test from 'node:test';

import type { Scene, SceneView } from '@dnd/protocol';

import {
  buildRenderedTerrain,
  countKnownCells,
  isAuthoritativeScene,
  isProjectedScene,
  isSceneEntityHidden,
  shouldReplaceRuntimeScene,
} from './runtime-scene-view';

function buildAuthoritativeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    sessionId: 'session-1',
    name: 'Sunken Chapel',
    grid: { cellSizeFeet: 5, width: 4, height: 2 },
    terrain: { runs: [{ tile: 'stone', length: 8 }] },
    entities: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildProjectedScene(overrides: Partial<SceneView> = {}): SceneView {
  return {
    view: 'player_projection',
    id: 'scene-1',
    sessionId: 'session-1',
    name: 'Sunken Chapel',
    grid: { cellSizeFeet: 5, width: 4, height: 2 },
    cells: [],
    entities: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    projectedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('the two scene shapes are told apart by their discriminant', () => {
  assert.equal(isProjectedScene(buildProjectedScene()), true);
  assert.equal(isAuthoritativeScene(buildProjectedScene()), false);
  assert.equal(isAuthoritativeScene(buildAuthoritativeScene()), true);
  assert.equal(isProjectedScene(buildAuthoritativeScene()), false);
});

test('an authoritative scene renders every cell, uniformly lit', () => {
  const terrain = buildRenderedTerrain(buildAuthoritativeScene());

  assert.equal(terrain.tiles.length, 8);
  assert.deepEqual(new Set(terrain.tiles), new Set(['stone']));
  assert.deepEqual(new Set(terrain.illumination), new Set(['bright']));
});

test('a projected scene renders unnamed cells as unknown, not as ground', () => {
  const terrain = buildRenderedTerrain(
    buildProjectedScene({
      cells: [
        {
          y: 0,
          x: 1,
          length: 2,
          tile: 'flagstone',
          visibility: 'visible',
          illumination: 'bright',
        },
      ],
    }),
  );

  assert.deepEqual(terrain.tiles, [
    null,
    'flagstone',
    'flagstone',
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(terrain.illumination.slice(0, 4), [
    'dark',
    'bright',
    'bright',
    'dark',
  ]);
});

test('a run carries its own illumination through to the renderer', () => {
  const terrain = buildRenderedTerrain(
    buildProjectedScene({
      cells: [
        {
          y: 1,
          x: 0,
          length: 2,
          tile: 'stone',
          visibility: 'visible',
          illumination: 'dim',
        },
      ],
    }),
  );

  assert.deepEqual(terrain.illumination.slice(4, 6), ['dim', 'dim']);
  assert.deepEqual(terrain.tiles.slice(4, 6), ['stone', 'stone']);
});

test('a run running off the grid does not write outside it', () => {
  const terrain = buildRenderedTerrain(
    buildProjectedScene({
      cells: [
        {
          y: 0,
          x: 3,
          length: 8,
          tile: 'wood',
          visibility: 'visible',
          illumination: 'bright',
        },
      ],
    }),
  );

  assert.equal(terrain.tiles.length, 8);
  assert.equal(terrain.tiles[3], 'wood');
  assert.equal(terrain.tiles[4], null, 'the next row is untouched');
});

test('no scene renders nothing at all', () => {
  assert.deepEqual(buildRenderedTerrain(null), { tiles: [], illumination: [] });
});

test('a newer projection replaces an older one of the same map', () => {
  const held = buildProjectedScene({
    projectedAt: '2026-01-01T00:00:00.000Z',
  });
  const newer = buildProjectedScene({
    projectedAt: '2026-01-01T00:00:01.000Z',
  });

  assert.equal(shouldReplaceRuntimeScene(held, newer), true);
});

test('a stale projection cannot restore older visibility', () => {
  const held = buildProjectedScene({
    projectedAt: '2026-01-01T00:00:05.000Z',
  });
  const stale = buildProjectedScene({
    projectedAt: '2026-01-01T00:00:01.000Z',
  });

  assert.equal(shouldReplaceRuntimeScene(held, stale), false);
});

test('a projection whose map is unchanged still replaces on a newer stamp', () => {
  // The observer moved; `updatedAt` is identical because the map did not
  // change. Ordering by `updatedAt` alone would discard this frame and leave
  // the player looking at the fog they had before they walked.
  const held = buildProjectedScene({
    projectedAt: '2026-01-01T00:00:00.000Z',
    cells: [],
  });
  const afterMoving = buildProjectedScene({
    projectedAt: '2026-01-01T00:00:02.000Z',
    cells: [
      {
        y: 0,
        x: 0,
        length: 4,
        tile: 'stone',
        visibility: 'visible',
        illumination: 'bright',
      },
    ],
  });

  assert.equal(held.updatedAt, afterMoving.updatedAt);
  assert.equal(shouldReplaceRuntimeScene(held, afterMoving), true);
});

test('a switch between shapes always replaces', () => {
  const projected = buildProjectedScene();
  const authoritative = buildAuthoritativeScene();

  assert.equal(shouldReplaceRuntimeScene(projected, authoritative), true);
  assert.equal(shouldReplaceRuntimeScene(authoritative, projected), true);
});

test('a different map always replaces, however old its stamp', () => {
  const held = buildProjectedScene({
    projectedAt: '2026-06-01T00:00:00.000Z',
  });
  const other = buildProjectedScene({
    id: 'scene-2',
    projectedAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(shouldReplaceRuntimeScene(held, other), true);
});

test('an authoritative scene is still ordered by its own timestamp', () => {
  const held = buildAuthoritativeScene({
    updatedAt: '2026-01-01T00:00:05.000Z',
  });

  assert.equal(
    shouldReplaceRuntimeScene(
      held,
      buildAuthoritativeScene({ updatedAt: '2026-01-01T00:00:01.000Z' }),
    ),
    false,
  );
  assert.equal(
    shouldReplaceRuntimeScene(
      held,
      buildAuthoritativeScene({ updatedAt: '2026-01-01T00:00:09.000Z' }),
    ),
    true,
  );
});

test('an entity with no concealment flag reads as not concealed', () => {
  const projectedEntity = {
    id: 'entity-1',
    type: 'object' as const,
    name: 'Altar',
    position: { x: 0, y: 0 },
    footprint: { width: 1, height: 1 },
    blocksMovement: true,
    blocksVision: false,
    combatant: null,
    meta: {},
  };

  assert.equal(isSceneEntityHidden(projectedEntity), false);
  assert.equal(isSceneEntityHidden({ ...projectedEntity, hidden: true }), true);
  assert.equal(
    isSceneEntityHidden({ ...projectedEntity, hidden: false }),
    false,
  );
});

test('known cells count what arrived and never what was withheld', () => {
  assert.equal(countKnownCells(null), 0);
  assert.equal(countKnownCells(buildAuthoritativeScene()), 8);
  assert.equal(countKnownCells(buildProjectedScene()), 0);
  assert.equal(
    countKnownCells(
      buildProjectedScene({
        cells: [
          {
            y: 0,
            x: 0,
            length: 3,
            tile: 'stone',
            visibility: 'visible',
            illumination: 'bright',
          },
          {
            y: 1,
            x: 2,
            length: 2,
            tile: 'stone',
            visibility: 'visible',
            illumination: 'dim',
          },
        ],
      }),
    ),
    5,
  );
});
