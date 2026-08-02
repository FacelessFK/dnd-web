import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Scene,
  SceneEntity,
  SceneTerrainTile,
  SceneView,
} from '@dnd/shared';

import { encodeSceneTerrain } from './scene-terrain.js';
import { buildSceneVisibilityIndex } from './scene-visibility-index.js';
import { projectSceneViewForObservers } from './scene-view-projection.js';

const PROJECTED_AT = '2026-08-02T12:00:00.000Z';

function buildScene(params: {
  picture: string;
  ambientLight?: Scene['ambientLight'];
  entities?: SceneEntity[];
}): Scene {
  const rows = params.picture
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  const width = rows[0]!.length;
  const tiles: SceneTerrainTile[] = [];

  for (const row of rows) {
    assert.equal(row.length, width);

    for (const cell of row) {
      tiles.push(cell === '#' ? 'wall' : cell === ',' ? 'grass' : 'stone');
    }
  }

  return {
    id: 'scene-fog',
    sessionId: 'session-fog',
    name: 'دالان کمین',
    grid: { cellSizeFeet: 5, width, height: rows.length },
    terrain: encodeSceneTerrain(tiles),
    ...(params.ambientLight ? { ambientLight: params.ambientLight } : {}),
    entities: params.entities ?? [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
  };
}

function buildEntity(overrides: Partial<SceneEntity> = {}): SceneEntity {
  return {
    id: 'entity-crate',
    type: 'object',
    name: 'Crate',
    position: { x: 0, y: 0 },
    footprint: { width: 1, height: 1 },
    blocksMovement: true,
    blocksVision: false,
    hidden: false,
    combatant: null,
    transition: null,
    meta: {},
    ...overrides,
  };
}

/** The cells a projected view actually names, as `x,y` keys. */
function knownCellKeys(view: SceneView): Set<string> {
  const keys = new Set<string>();

  for (const run of view.cells) {
    for (let offset = 0; offset < run.length; offset += 1) {
      keys.add(`${run.x + offset},${run.y}`);
    }
  }

  return keys;
}

function project(
  scene: Scene,
  observers: { x: number; y: number }[],
): SceneView {
  return projectSceneViewForObservers({
    scene,
    observers: observers.map((position) => ({
      position,
      footprint: { width: 1, height: 1 },
    })),
    projectedAt: PROJECTED_AT,
  });
}

test('a projected view is discriminated from an authoritative scene', () => {
  const view = project(buildScene({ picture: '...\n...\n...' }), [
    { x: 1, y: 1 },
  ]);

  assert.equal(view.view, 'player_projection');
  assert.equal('terrain' in view, false, 'no authoritative terrain layer');
  assert.equal('createdAt' in view, false);
  assert.equal(view.updatedAt, '2026-01-02T03:04:05.000Z');
  assert.equal(view.projectedAt, PROJECTED_AT);
});

test('a viewer with no observers receives an empty view, not the scene', () => {
  const scene = buildScene({
    picture: '...\n...\n...',
    entities: [buildEntity({ position: { x: 2, y: 2 } })],
  });

  const view = projectSceneViewForObservers({
    scene,
    observers: [],
    projectedAt: PROJECTED_AT,
  });

  assert.deepEqual(view.cells, []);
  assert.deepEqual(view.entities, []);
  assert.equal(view.grid.width, 3, 'the grid size itself is not a secret');
});

test('an observer outside the map fails closed', () => {
  const scene = buildScene({ picture: '...\n...\n...' });
  const view = project(scene, [{ x: 40, y: 40 }]);

  assert.deepEqual(view.cells, []);
});

test('unknown cells are absent rather than masked', () => {
  const scene = buildScene({
    picture: `
      .....
      .###.
      .#,#.
      .###.
      .....
    `,
  });

  // The observer stands outside a sealed chamber. The chamber's interior tile
  // is `grass`, which appears nowhere else on the map.
  const view = project(scene, [{ x: 0, y: 0 }]);
  const known = knownCellKeys(view);

  assert.equal(known.has('2,2'), false, 'the sealed cell is not projected');

  for (const run of view.cells) {
    assert.notEqual(
      run.tile,
      'grass',
      'the hidden tile value must not appear in the payload at all',
    );
  }

  assert.equal(
    JSON.stringify(view).includes('grass'),
    false,
    'and not anywhere in the serialized bytes',
  );
});

test('a blocking cell is projected but the cells behind it are not', () => {
  const scene = buildScene({
    picture: `
      .....
      .....
      .#...
      .....
      .....
    `,
  });

  const known = knownCellKeys(project(scene, [{ x: 0, y: 2 }]));

  assert.equal(known.has('1,2'), true, 'the near face of the wall');
  assert.equal(known.has('2,2'), false);
  assert.equal(known.has('4,2'), false);
});

test('a hidden entity inside a perceived cell is still absent', () => {
  const scene = buildScene({
    picture: '.....\n.....\n.....',
    entities: [
      buildEntity({ id: 'entity-seen', position: { x: 2, y: 1 } }),
      buildEntity({
        id: 'entity-lurker',
        name: 'Lurking Ambusher',
        hidden: true,
        position: { x: 3, y: 1 },
        combatant: {
          kind: 'monster',
          hp: { max: 30, current: 12, temp: 0 },
          armorClass: 15,
          speed: 30,
          abilities: { str: 16, dex: 14, con: 15, int: 6, wis: 10, cha: 6 },
        },
      }),
    ],
  });

  const view = project(scene, [{ x: 0, y: 1 }]);
  const serialized = JSON.stringify(view);

  assert.deepEqual(
    view.entities.map((entity) => entity.id),
    ['entity-seen'],
  );
  assert.equal(serialized.includes('entity-lurker'), false);
  assert.equal(serialized.includes('Lurking Ambusher'), false);
  assert.equal(serialized.includes('"current":12'), false, 'no concealed HP');
});

test('visibility restricts entities but never un-hides one', () => {
  // The same hidden entity, now in a cell the observer certainly perceives.
  const scene = buildScene({
    picture: '...',
    entities: [
      buildEntity({
        id: 'entity-lurker',
        hidden: true,
        position: { x: 1, y: 0 },
      }),
    ],
  });

  assert.deepEqual(project(scene, [{ x: 0, y: 0 }]).entities, []);
});

test('an entity behind a blocker is absent from the payload', () => {
  const scene = buildScene({
    picture: `
      .....
      .....
      .#...
      .....
      .....
    `,
    entities: [
      buildEntity({ id: 'entity-behind', position: { x: 3, y: 2 } }),
      buildEntity({ id: 'entity-front', position: { x: 0, y: 0 } }),
    ],
  });

  const view = project(scene, [{ x: 0, y: 2 }]);

  assert.deepEqual(
    view.entities.map((entity) => entity.id),
    ['entity-front'],
  );
  assert.equal(JSON.stringify(view).includes('entity-behind'), false);
});

test('a multi-cell entity is projected when any of its cells is perceived', () => {
  const scene = buildScene({
    picture: `
      ......
      ......
      ......
      ......
    `,
    entities: [
      buildEntity({
        id: 'entity-wagon',
        position: { x: 4, y: 1 },
        footprint: { width: 2, height: 2 },
      }),
    ],
  });

  assert.equal(project(scene, [{ x: 0, y: 1 }]).entities.length, 1);
});

test('a multi-cell blocker blocks every cell it covers', () => {
  const scene = buildScene({
    picture: `
      .......
      .......
      .......
      .......
    `,
    entities: [
      buildEntity({
        id: 'entity-wall',
        position: { x: 2, y: 0 },
        footprint: { width: 1, height: 3 },
        blocksVision: true,
      }),
    ],
  });

  const known = knownCellKeys(project(scene, [{ x: 0, y: 1 }]));

  assert.equal(known.has('2,1'), true, 'the near face');
  assert.equal(known.has('3,0'), false);
  assert.equal(known.has('3,1'), false);
  assert.equal(known.has('3,2'), false);
  // (3,3) is still in shadow: the ray from (0,1) crosses column 2 inside the
  // blocker's bottom cell. The first cell that clears the blocker is the one
  // directly beneath it.
  assert.equal(known.has('3,3'), false);
  assert.equal(known.has('2,3'), true, 'below the blocker is open');
});

test('an observer with a multi-cell footprint sees from every cell it occupies', () => {
  const scene = buildScene({
    picture: `
      .......
      .#.....
      .......
      .......
    `,
  });

  const narrow = projectSceneViewForObservers({
    scene,
    observers: [
      { position: { x: 0, y: 1 }, footprint: { width: 1, height: 1 } },
    ],
    projectedAt: PROJECTED_AT,
  });
  const wide = projectSceneViewForObservers({
    scene,
    observers: [
      { position: { x: 0, y: 1 }, footprint: { width: 1, height: 2 } },
    ],
    projectedAt: PROJECTED_AT,
  });

  assert.equal(knownCellKeys(narrow).has('4,1'), false);
  assert.equal(
    knownCellKeys(wide).has('4,1'),
    true,
    'the second occupied cell sees around the pillar',
  );
});

test('multiple observers union their projected cells', () => {
  const scene = buildScene({
    picture: `
      ..#..
      ..#..
      ..#..
    `,
  });

  const west = knownCellKeys(project(scene, [{ x: 0, y: 1 }]));
  const east = knownCellKeys(project(scene, [{ x: 4, y: 1 }]));
  const both = knownCellKeys(
    project(scene, [
      { x: 0, y: 1 },
      { x: 4, y: 1 },
    ]),
  );

  assert.equal(west.has('4,1'), false);
  assert.equal(both.has('0,1'), true);
  assert.equal(both.has('4,1'), true);
  assert.equal(
    both.size,
    west.size + east.size - 3,
    'the wall column is shared',
  );
});

test('a duplicated observer produces an identical payload', () => {
  const scene = buildScene({ picture: '.....\n..#..\n.....' });

  assert.deepEqual(
    project(scene, [
      { x: 0, y: 1 },
      { x: 0, y: 1 },
    ]),
    project(scene, [{ x: 0, y: 1 }]),
  );
});

test('darkness is unseen even in direct line of sight', () => {
  const scene = buildScene({
    picture: '.....\n.....\n.....',
    ambientLight: 'dark',
  });

  assert.deepEqual(project(scene, [{ x: 2, y: 1 }]).cells, []);
});

test('a light source in a dark room reveals exactly what it lights', () => {
  const scene = buildScene({
    picture: `
      .......
      .......
      .......
    `,
    ambientLight: 'dark',
    entities: [
      buildEntity({
        id: 'entity-torch',
        name: 'Torch',
        position: { x: 3, y: 1 },
        blocksMovement: false,
        lightSource: { enabled: true, brightRadius: 1, dimRadius: 2 },
      }),
    ],
  });

  const known = knownCellKeys(project(scene, [{ x: 0, y: 1 }]));

  assert.equal(known.has('3,1'), true);
  assert.equal(known.has('1,1'), true, 'distance 2 is dim, and dim is seen');
  assert.equal(known.has('0,1'), false, 'the observer stands in darkness');
  assert.equal(known.has('6,1'), false);
});

test('a projected run carries the illumination of its cells', () => {
  const scene = buildScene({
    picture: '.....',
    ambientLight: 'dark',
    entities: [
      buildEntity({
        id: 'entity-torch',
        position: { x: 2, y: 0 },
        blocksMovement: false,
        lightSource: { enabled: true, brightRadius: 1, dimRadius: 2 },
      }),
    ],
  });

  const runs = project(scene, [{ x: 2, y: 0 }]).cells;

  assert.deepEqual(
    runs.map((run) => [run.x, run.length, run.illumination]),
    [
      [0, 1, 'dim'],
      [1, 3, 'bright'],
      [4, 1, 'dim'],
    ],
  );
});

test('wave one emits only visible cells; nothing claims explored memory', () => {
  const scene = buildScene({ picture: '.....\n.....\n.....' });

  for (const run of project(scene, [{ x: 2, y: 1 }]).cells) {
    assert.equal(run.visibility, 'visible');
  }
});

test('runs are emitted row-major and break on tile changes', () => {
  const scene = buildScene({
    picture: `
      ..,..
      .....
    `,
  });

  const runs = project(scene, [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  ]).cells;

  assert.deepEqual(
    runs.map((run) => [run.y, run.x, run.length, run.tile]),
    [
      [0, 0, 2, 'stone'],
      [0, 2, 1, 'grass'],
      [0, 3, 2, 'stone'],
      [1, 0, 5, 'stone'],
    ],
  );
});

test('the same scene and observers always project byte-identical payloads', () => {
  const scene = buildScene({
    picture: `
      .....#....
      ..#.......
      ......#...
      .#........
      ..........
    `,
    entities: [
      buildEntity({ id: 'entity-a', position: { x: 9, y: 4 } }),
      buildEntity({ id: 'entity-b', position: { x: 0, y: 4 } }),
    ],
  });
  const observers = [
    { x: 4, y: 4 },
    { x: 1, y: 0 },
  ];

  assert.equal(
    JSON.stringify(project(scene, observers)),
    JSON.stringify(project(scene, observers)),
  );
});

test('a shared index projects the same payload as an independently built one', () => {
  const scene = buildScene({
    picture: '.....\n..#..\n.....',
    entities: [buildEntity({ position: { x: 4, y: 2 } })],
  });
  const observers = [
    { position: { x: 0, y: 0 }, footprint: { width: 1, height: 1 } },
  ];

  assert.deepEqual(
    projectSceneViewForObservers({
      scene,
      observers,
      projectedAt: PROJECTED_AT,
      index: buildSceneVisibilityIndex(scene),
    }),
    projectSceneViewForObservers({
      scene,
      observers,
      projectedAt: PROJECTED_AT,
    }),
  );
});

test('a 1x1 map projects its one cell', () => {
  const view = project(buildScene({ picture: '.' }), [{ x: 0, y: 0 }]);

  assert.deepEqual(view.cells, [
    {
      y: 0,
      x: 0,
      length: 1,
      tile: 'stone',
      visibility: 'visible',
      illumination: 'bright',
    },
  ]);
});

test('a projected entity carries no concealment flag to filter on', () => {
  const scene = buildScene({
    picture: '...',
    entities: [buildEntity({ position: { x: 1, y: 0 } })],
  });

  const [entity] = project(scene, [{ x: 0, y: 0 }]).entities;

  assert.ok(entity);
  assert.equal('hidden' in entity, false);
  assert.equal('lightSource' in entity, false);
});

test('Persian scene names survive projection unchanged', () => {
  const view = project(buildScene({ picture: '...' }), [{ x: 0, y: 0 }]);

  assert.equal(view.name, 'دالان کمین');
});
