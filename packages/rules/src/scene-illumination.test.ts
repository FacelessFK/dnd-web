import assert from 'node:assert/strict';
import test from 'node:test';

import type { Scene, SceneEntity, SceneTerrainTile } from '@dnd/shared';

import {
  ILLUMINATION_BRIGHT,
  ILLUMINATION_DARK,
  ILLUMINATION_DIM,
  computeSceneIllumination,
} from './scene-illumination.js';
import { encodeSceneTerrain } from './scene-terrain.js';
import { toCellIndex } from './scene-visibility-geometry.js';
import { buildSceneVisibilityIndex } from './scene-visibility-index.js';

/**
 * A scene from a picture. `#` paints a vision-blocking wall tile, `.` paints
 * open stone. Entities are supplied separately.
 */
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
      tiles.push(cell === '#' ? 'wall' : 'stone');
    }
  }

  return {
    id: 'scene-light',
    sessionId: 'session-light',
    name: 'اتاق آزمون',
    grid: { cellSizeFeet: 5, width, height: rows.length },
    terrain: encodeSceneTerrain(tiles),
    ...(params.ambientLight ? { ambientLight: params.ambientLight } : {}),
    entities: params.entities ?? [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildLamp(overrides: Partial<SceneEntity> = {}): SceneEntity {
  return {
    id: 'entity-lamp',
    type: 'object',
    name: 'Lamp',
    position: { x: 0, y: 0 },
    footprint: { width: 1, height: 1 },
    blocksMovement: false,
    blocksVision: false,
    hidden: false,
    combatant: null,
    transition: null,
    lightSource: { enabled: true, brightRadius: 1, dimRadius: 3 },
    meta: {},
    ...overrides,
  };
}

function illuminationAt(scene: Scene, x: number, y: number): number {
  const index = buildSceneVisibilityIndex(scene);

  return computeSceneIllumination(index)[toCellIndex(index.grid, x, y)]!;
}

test('a scene with no ambient light field reads as bright, so pre-M3 maps are unchanged', () => {
  const scene = buildScene({ picture: '.....\n.....\n.....' });

  assert.equal(scene.ambientLight, undefined);
  assert.equal(illuminationAt(scene, 2, 1), ILLUMINATION_BRIGHT);
});

test('an empty bright room is bright everywhere', () => {
  const scene = buildScene({
    picture: '.....\n.....\n.....',
    ambientLight: 'bright',
  });
  const index = buildSceneVisibilityIndex(scene);

  for (const rank of computeSceneIllumination(index)) {
    assert.equal(rank, ILLUMINATION_BRIGHT);
  }
});

test('a dim room is dim everywhere', () => {
  const scene = buildScene({
    picture: '.....\n.....\n.....',
    ambientLight: 'dim',
  });
  const index = buildSceneVisibilityIndex(scene);

  for (const rank of computeSceneIllumination(index)) {
    assert.equal(rank, ILLUMINATION_DIM);
  }
});

test('an empty dark room is dark everywhere', () => {
  const scene = buildScene({
    picture: '.....\n.....\n.....',
    ambientLight: 'dark',
  });
  const index = buildSceneVisibilityIndex(scene);

  for (const rank of computeSceneIllumination(index)) {
    assert.equal(rank, ILLUMINATION_DARK);
  }
});

test('one light source lights bright then dim then nothing', () => {
  const scene = buildScene({
    picture: `
      .........
      .........
      .........
      .........
      .........
      .........
      .........
    `,
    ambientLight: 'dark',
    entities: [
      buildLamp({
        position: { x: 4, y: 3 },
        lightSource: { enabled: true, brightRadius: 1, dimRadius: 3 },
      }),
    ],
  });

  assert.equal(illuminationAt(scene, 4, 3), ILLUMINATION_BRIGHT);
  assert.equal(illuminationAt(scene, 5, 3), ILLUMINATION_BRIGHT);
  // Chebyshev, so the diagonal at distance 1 is bright too.
  assert.equal(illuminationAt(scene, 5, 4), ILLUMINATION_BRIGHT);
  assert.equal(illuminationAt(scene, 6, 3), ILLUMINATION_DIM);
  assert.equal(illuminationAt(scene, 7, 3), ILLUMINATION_DIM);
  assert.equal(illuminationAt(scene, 8, 3), ILLUMINATION_DARK);
});

test('the bright and dim radius boundaries are inclusive', () => {
  const scene = buildScene({
    picture: `
      .........
      .........
      .........
    `,
    ambientLight: 'dark',
    entities: [
      buildLamp({
        position: { x: 4, y: 1 },
        lightSource: { enabled: true, brightRadius: 2, dimRadius: 4 },
      }),
    ],
  });

  assert.equal(illuminationAt(scene, 6, 1), ILLUMINATION_BRIGHT, 'distance 2');
  assert.equal(illuminationAt(scene, 7, 1), ILLUMINATION_DIM, 'distance 3');
  assert.equal(illuminationAt(scene, 8, 1), ILLUMINATION_DIM, 'distance 4');
});

test('a radius of zero lights only the emitting cell', () => {
  const scene = buildScene({
    picture: '.....\n.....\n.....',
    ambientLight: 'dark',
    entities: [
      buildLamp({
        position: { x: 2, y: 1 },
        lightSource: { enabled: true, brightRadius: 0, dimRadius: 0 },
      }),
    ],
  });

  assert.equal(illuminationAt(scene, 2, 1), ILLUMINATION_BRIGHT);
  assert.equal(illuminationAt(scene, 3, 1), ILLUMINATION_DARK);
});

test('a disabled light source emits nothing', () => {
  const scene = buildScene({
    picture: '.....\n.....\n.....',
    ambientLight: 'dark',
    entities: [
      buildLamp({
        position: { x: 2, y: 1 },
        lightSource: { enabled: false, brightRadius: 2, dimRadius: 4 },
      }),
    ],
  });

  assert.equal(illuminationAt(scene, 2, 1), ILLUMINATION_DARK);
  assert.equal(illuminationAt(scene, 3, 1), ILLUMINATION_DARK);
});

test('an entity with no light source at all emits nothing', () => {
  const scene = buildScene({
    picture: '.....\n.....\n.....',
    ambientLight: 'dark',
    entities: [buildLamp({ position: { x: 2, y: 1 }, lightSource: undefined })],
  });

  assert.equal(illuminationAt(scene, 2, 1), ILLUMINATION_DARK);
});

test('overlapping light sources take the strongest illumination', () => {
  const scene = buildScene({
    picture: `
      ..........
      ..........
      ..........
    `,
    ambientLight: 'dark',
    entities: [
      buildLamp({
        id: 'entity-lamp-weak',
        position: { x: 2, y: 1 },
        lightSource: { enabled: true, brightRadius: 0, dimRadius: 4 },
      }),
      buildLamp({
        id: 'entity-lamp-strong',
        position: { x: 6, y: 1 },
        lightSource: { enabled: true, brightRadius: 3, dimRadius: 5 },
      }),
    ],
  });

  // (4,1) is dim from the weak lamp and bright from the strong one.
  assert.equal(illuminationAt(scene, 4, 1), ILLUMINATION_BRIGHT);
  // (1,1) is only reached by the weak lamp.
  assert.equal(illuminationAt(scene, 1, 1), ILLUMINATION_DIM);
});

test('a light source can raise a dim room to bright but nothing darkens it', () => {
  const scene = buildScene({
    picture: '.......\n.......\n.......',
    ambientLight: 'dim',
    entities: [
      buildLamp({
        position: { x: 3, y: 1 },
        lightSource: { enabled: true, brightRadius: 1, dimRadius: 2 },
      }),
    ],
  });

  assert.equal(illuminationAt(scene, 3, 1), ILLUMINATION_BRIGHT);
  assert.equal(illuminationAt(scene, 6, 1), ILLUMINATION_DIM);
});

test('light does not pass through a vision-blocking wall', () => {
  const scene = buildScene({
    picture: `
      .......
      ...#...
      .......
    `,
    ambientLight: 'dark',
    entities: [
      buildLamp({
        position: { x: 3, y: 0 },
        lightSource: { enabled: true, brightRadius: 1, dimRadius: 4 },
      }),
    ],
  });

  assert.equal(illuminationAt(scene, 3, 0), ILLUMINATION_BRIGHT);
  // The wall's near face is lit; the cell directly behind it is not.
  assert.equal(illuminationAt(scene, 3, 1), ILLUMINATION_BRIGHT);
  assert.equal(illuminationAt(scene, 3, 2), ILLUMINATION_DARK);
});

test('a vision-blocking entity blocks emitted light too', () => {
  const scene = buildScene({
    picture: `
      .......
      .......
      .......
    `,
    ambientLight: 'dark',
    entities: [
      buildLamp({
        position: { x: 0, y: 1 },
        lightSource: { enabled: true, brightRadius: 0, dimRadius: 6 },
      }),
      buildLamp({
        id: 'entity-screen',
        name: 'Screen',
        position: { x: 3, y: 1 },
        blocksVision: true,
        lightSource: null,
      }),
    ],
  });

  assert.equal(illuminationAt(scene, 2, 1), ILLUMINATION_DIM);
  assert.equal(illuminationAt(scene, 3, 1), ILLUMINATION_DIM, 'near face');
  assert.equal(illuminationAt(scene, 4, 1), ILLUMINATION_DARK);
});

test('a multi-cell light source measures its radius from its nearest cell', () => {
  const scene = buildScene({
    picture: `
      ........
      ........
      ........
      ........
    `,
    ambientLight: 'dark',
    entities: [
      buildLamp({
        position: { x: 1, y: 1 },
        footprint: { width: 2, height: 2 },
        lightSource: { enabled: true, brightRadius: 1, dimRadius: 2 },
      }),
    ],
  });

  // The brazier occupies (1,1)..(2,2). One cell out from its east edge is
  // bright; two cells out is dim.
  assert.equal(illuminationAt(scene, 3, 1), ILLUMINATION_BRIGHT);
  assert.equal(illuminationAt(scene, 4, 1), ILLUMINATION_DIM);
  assert.equal(illuminationAt(scene, 5, 1), ILLUMINATION_DARK);
});

test('a light source entirely outside the map emits nothing', () => {
  const scene = buildScene({
    picture: '.....\n.....\n.....',
    ambientLight: 'dark',
    entities: [
      buildLamp({
        position: { x: 40, y: 40 },
        lightSource: { enabled: true, brightRadius: 5, dimRadius: 9 },
      }),
    ],
  });

  const index = buildSceneVisibilityIndex(scene);

  assert.deepEqual(index.lightSources, []);

  for (const rank of computeSceneIllumination(index)) {
    assert.equal(rank, ILLUMINATION_DARK);
  }
});

test('a stored dim radius smaller than the bright radius is clamped, not trusted', () => {
  const scene = buildScene({
    picture: '.......\n.......\n.......',
    ambientLight: 'dark',
    entities: [
      buildLamp({
        position: { x: 3, y: 1 },
        // The command schemas reject this; a hand-edited document could carry it.
        lightSource: { enabled: true, brightRadius: 2, dimRadius: 0 },
      }),
    ],
  });

  assert.equal(illuminationAt(scene, 5, 1), ILLUMINATION_BRIGHT);
  assert.equal(illuminationAt(scene, 6, 1), ILLUMINATION_DARK);
});

test('illumination is deterministic and independent of light source order', () => {
  const lamps = [
    buildLamp({
      id: 'entity-a',
      position: { x: 1, y: 1 },
      lightSource: { enabled: true, brightRadius: 1, dimRadius: 3 },
    }),
    buildLamp({
      id: 'entity-b',
      position: { x: 6, y: 2 },
      lightSource: { enabled: true, brightRadius: 2, dimRadius: 4 },
    }),
  ];
  const picture = `
    ........
    ..#.....
    ........
    ........
  `;

  const forward = computeSceneIllumination(
    buildSceneVisibilityIndex(
      buildScene({ picture, ambientLight: 'dark', entities: lamps }),
    ),
  );
  const reversed = computeSceneIllumination(
    buildSceneVisibilityIndex(
      buildScene({
        picture,
        ambientLight: 'dark',
        entities: [...lamps].reverse(),
      }),
    ),
  );
  const again = computeSceneIllumination(
    buildSceneVisibilityIndex(
      buildScene({ picture, ambientLight: 'dark', entities: lamps }),
    ),
  );

  assert.deepEqual([...reversed], [...forward]);
  assert.deepEqual([...again], [...forward]);
});

test('a 1x1 map lights its only cell from ambient', () => {
  const scene = buildScene({ picture: '.', ambientLight: 'dim' });

  assert.equal(illuminationAt(scene, 0, 0), ILLUMINATION_DIM);
});
