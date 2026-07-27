import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveSceneState, GridDefinition, Scene } from '@dnd/protocol';

import {
  DEFAULT_MAP_SCALE,
  MAX_MAP_SCALE,
  MIN_MAP_SCALE,
  buildBlockedCellKeys,
  buildMapDecor,
  buildMapTokens,
  clampCamera,
  clampMapScale,
  createFitCamera,
  getCameraAfterPan,
  getCameraAfterZoom,
  getHealthColor,
  getReachableCells,
  getTileStyle,
  getTokenInitials,
  getTokenPalette,
  getVisibleCellRange,
  hashCell,
  screenToCell,
  screenToWorld,
  toCellKey,
  worldToScreen,
  type MapCamera,
} from './tactical-map-render.js';

const grid: GridDefinition = { cellSizeFeet: 5, width: 20, height: 16 };
const viewport = { width: 800, height: 600 };

function createScene(overrides: Partial<Scene> = {}): Scene {
  return {
    createdAt: '2026-07-01T00:00:00.000Z',
    entities: [],
    grid,
    id: 'scene_1',
    name: 'Test Map',
    sessionId: 'ABC123',
    terrain: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('hashCell is deterministic and stays inside the unit interval', () => {
  for (let x = 0; x < 8; x += 1) {
    for (let y = 0; y < 8; y += 1) {
      const value = hashCell(x, y, 3);

      assert.equal(value, hashCell(x, y, 3));
      assert.ok(value >= 0 && value < 1, `hash out of range at ${x},${y}`);
    }
  }
});

test('hashCell varies across neighbouring cells and salts', () => {
  assert.notEqual(hashCell(4, 4, 1), hashCell(5, 4, 1));
  assert.notEqual(hashCell(4, 4, 1), hashCell(4, 5, 1));
  assert.notEqual(hashCell(4, 4, 1), hashCell(4, 4, 2));
});

test('clampMapScale keeps zoom inside the supported range', () => {
  assert.equal(clampMapScale(1), MIN_MAP_SCALE);
  assert.equal(clampMapScale(10000), MAX_MAP_SCALE);
  assert.equal(clampMapScale(DEFAULT_MAP_SCALE), DEFAULT_MAP_SCALE);
});

test('clampCamera centres a map smaller than the viewport', () => {
  const smallGrid: GridDefinition = { cellSizeFeet: 5, width: 4, height: 3 };
  const camera = clampCamera(
    { centerX: 999, centerY: -999, scale: 64 },
    smallGrid,
    viewport,
  );

  assert.equal(camera.centerX, 2);
  assert.equal(camera.centerY, 1.5);
});

test('clampCamera stops panning past the edge of a large map', () => {
  const largeGrid: GridDefinition = {
    cellSizeFeet: 5,
    width: 100,
    height: 100,
  };
  const camera = clampCamera(
    { centerX: -50, centerY: 500, scale: 40 },
    largeGrid,
    viewport,
  );

  const halfX = viewport.width / 40 / 2;
  const halfY = viewport.height / 40 / 2;

  assert.equal(camera.centerX, halfX);
  assert.equal(camera.centerY, 100 - halfY);
});

test('createFitCamera frames the whole map', () => {
  const camera = createFitCamera(grid, viewport);

  assert.equal(camera.centerX, grid.width / 2);
  assert.equal(camera.centerY, grid.height / 2);

  const topLeft = worldToScreen({ x: 0, y: 0 }, camera, viewport);
  const bottomRight = worldToScreen(
    { x: grid.width, y: grid.height },
    camera,
    viewport,
  );

  assert.ok(topLeft.x >= 0, 'map left edge is inside the viewport');
  assert.ok(topLeft.y >= 0, 'map top edge is inside the viewport');
  assert.ok(bottomRight.x <= viewport.width, 'map right edge fits');
  assert.ok(bottomRight.y <= viewport.height, 'map bottom edge fits');
});

test('createFitCamera falls back to the default scale without a measured viewport', () => {
  const camera = createFitCamera(grid, { width: 0, height: 0 });

  assert.equal(camera.scale, DEFAULT_MAP_SCALE);
});

test('worldToScreen and screenToWorld round-trip', () => {
  const camera: MapCamera = { centerX: 8, centerY: 6, scale: 48 };
  const world = { x: 11.25, y: 3.5 };
  const screen = worldToScreen(world, camera, viewport);
  const roundTripped = screenToWorld(screen, camera, viewport);

  assert.ok(Math.abs(roundTripped.x - world.x) < 1e-9);
  assert.ok(Math.abs(roundTripped.y - world.y) < 1e-9);
});

test('screenToCell resolves the cell under a point and rejects off-map points', () => {
  const camera: MapCamera = {
    centerX: grid.width / 2,
    centerY: grid.height / 2,
    scale: 40,
  };
  const center = screenToCell(
    { x: viewport.width / 2, y: viewport.height / 2 },
    camera,
    viewport,
    grid,
  );

  assert.deepEqual(center, { x: 10, y: 8 });

  const farLeft = screenToCell({ x: -5000, y: 0 }, camera, viewport, grid);

  assert.equal(farLeft, null);
});

test('getVisibleCellRange culls to the viewport and stays inside the grid', () => {
  const camera: MapCamera = { centerX: 2, centerY: 2, scale: 80 };
  const range = getVisibleCellRange(camera, { width: 400, height: 400 }, grid);

  assert.ok(range.startX >= 0);
  assert.ok(range.startY >= 0);
  assert.ok(range.endX <= grid.width - 1);
  assert.ok(range.endY <= grid.height - 1);
  assert.ok(range.endX - range.startX < grid.width);
});

test('getCameraAfterZoom keeps the anchored world point under the cursor', () => {
  const camera: MapCamera = { centerX: 10, centerY: 8, scale: 40 };
  const anchor = { x: 200, y: 150 };
  const worldBefore = screenToWorld(anchor, camera, viewport);
  const zoomed = getCameraAfterZoom({
    anchor,
    camera,
    delta: 0.3,
    grid,
    viewport,
  });
  const worldAfter = screenToWorld(anchor, zoomed, viewport);

  assert.ok(zoomed.scale > camera.scale);
  assert.ok(Math.abs(worldAfter.x - worldBefore.x) < 1e-6);
  assert.ok(Math.abs(worldAfter.y - worldBefore.y) < 1e-6);
});

test('getCameraAfterZoom is a no-op at the zoom limits', () => {
  const camera: MapCamera = { centerX: 10, centerY: 8, scale: MAX_MAP_SCALE };
  const zoomed = getCameraAfterZoom({
    anchor: { x: 100, y: 100 },
    camera,
    delta: 1,
    grid,
    viewport,
  });

  assert.equal(zoomed, camera);
});

test('getCameraAfterPan moves the camera opposite the drag and stays clamped', () => {
  const largeGrid: GridDefinition = {
    cellSizeFeet: 5,
    width: 100,
    height: 100,
  };
  const camera: MapCamera = { centerX: 50, centerY: 50, scale: 40 };
  const panned = getCameraAfterPan({
    camera,
    deltaScreenX: 80,
    deltaScreenY: 0,
    grid: largeGrid,
    viewport,
  });

  assert.equal(panned.centerX, 48);
  assert.equal(panned.centerY, 50);
});

test('getTokenInitials handles single names, full names, and blanks', () => {
  assert.equal(getTokenInitials('Aria'), 'AR');
  assert.equal(getTokenInitials('Borin Stonefist'), 'BS');
  assert.equal(getTokenInitials('  '), '?');
  assert.equal(getTokenInitials('goblin scout'), 'GS');
});

test('buildMapTokens flattens placed characters and combatant entities', () => {
  const scene = createScene({
    entities: [
      {
        blocksMovement: true,
        blocksVision: false,
        combatant: {
          abilities: { str: 12, dex: 12, con: 12, int: 8, wis: 8, cha: 8 },
          armorClass: 13,
          hp: { current: 4, max: 7, temp: 0 },
          kind: 'monster',
          speed: 30,
        },
        footprint: { width: 1, height: 1 },
        hidden: false,
        id: 'entity_goblin',
        meta: {},
        name: 'Goblin Scout',
        position: { x: 5, y: 5 },
        transition: null,
        type: 'monster',
      },
    ],
  });

  const activeScene = {
    placedCharacters: [
      { participantId: 'player-001', position: { x: 1, y: 1 } },
      { participantId: 'player-002', position: { x: 2, y: 1 } },
    ],
  } as unknown as ActiveSceneState;

  const tokens = buildMapTokens({
    activeScene,
    characterNamesByParticipant: {
      'player-001': { name: 'Aria', hp: { current: 10, max: 12 } },
      'player-002': { name: 'Borin', hp: { current: 0, max: 14 } },
    },
    currentTurnCombatantId: 'entity_goblin',
    currentTurnParticipantId: null,
    ownParticipantId: 'player-001',
    scene,
    selectedCombatantId: null,
    selectedParticipantId: 'player-002',
    targetCombatantId: 'entity_goblin',
    targetParticipantId: null,
  });

  assert.equal(tokens.length, 3);

  const aria = tokens.find((token) => token.id === 'participant:player-001');
  assert.equal(aria?.kind, 'player');
  assert.equal(aria?.initials, 'AR');
  assert.equal(aria?.defeated, false);

  const borin = tokens.find((token) => token.id === 'participant:player-002');
  assert.equal(borin?.kind, 'ally');
  assert.equal(borin?.defeated, true);
  assert.equal(borin?.isSelected, true);

  const goblin = tokens.find((token) => token.id === 'entity:entity_goblin');
  assert.equal(goblin?.kind, 'monster');
  assert.equal(goblin?.isCurrentTurn, true);
  assert.equal(goblin?.isTarget, true);
  assert.deepEqual(goblin?.hp, { current: 4, max: 7 });
});

test('buildMapTokens tolerates a missing scene and active scene', () => {
  assert.deepEqual(
    buildMapTokens({
      activeScene: null,
      characterNamesByParticipant: {},
      currentTurnCombatantId: null,
      currentTurnParticipantId: null,
      ownParticipantId: null,
      scene: null,
      selectedCombatantId: null,
      selectedParticipantId: null,
      targetCombatantId: null,
      targetParticipantId: null,
    }),
    [],
  );
});

test('buildMapDecor classifies entities and can hide DM-only props', () => {
  const scene = createScene({
    entities: [
      {
        blocksMovement: true,
        blocksVision: true,
        combatant: null,
        footprint: { width: 2, height: 1 },
        hidden: false,
        id: 'entity_pillar',
        meta: {},
        name: 'Pillar',
        position: { x: 3, y: 3 },
        transition: null,
        type: 'object',
      },
      {
        blocksMovement: false,
        blocksVision: false,
        combatant: null,
        footprint: { width: 1, height: 1 },
        hidden: true,
        id: 'entity_secret',
        meta: {},
        name: 'Secret Door',
        position: { x: 6, y: 2 },
        transition: {
          kind: 'door',
          notes: null,
          targetLabel: null,
          targetSceneId: 'scene_2',
        },
        type: 'terrain',
      },
      {
        blocksMovement: false,
        blocksVision: false,
        combatant: null,
        footprint: { width: 1, height: 1 },
        hidden: false,
        id: 'entity_spawn',
        meta: {},
        name: 'Party Entry',
        position: { x: 0, y: 0 },
        transition: null,
        type: 'player_spawn',
      },
    ],
  });

  const dmDecor = buildMapDecor(scene, { includeHidden: true });
  assert.equal(dmDecor.length, 3);
  assert.equal(
    dmDecor.find((item) => item.id === 'entity_pillar')?.kind,
    'object',
  );
  assert.equal(
    dmDecor.find((item) => item.id === 'entity_secret')?.kind,
    'transition',
  );
  assert.equal(
    dmDecor.find((item) => item.id === 'entity_spawn')?.kind,
    'spawn',
  );

  const playerDecor = buildMapDecor(scene, { includeHidden: false });
  assert.equal(playerDecor.length, 2);
  assert.equal(
    playerDecor.some((item) => item.id === 'entity_secret'),
    false,
  );
});

test('buildBlockedCellKeys covers terrain, blocking entities, and other tokens', () => {
  const smallGrid: GridDefinition = { cellSizeFeet: 5, width: 4, height: 2 };
  const scene = createScene({
    grid: smallGrid,
    terrain: {
      runs: [
        { tile: 'stone', length: 2 },
        { tile: 'wall', length: 1 },
        { tile: 'stone', length: 5 },
      ],
    },
    entities: [
      {
        blocksMovement: true,
        blocksVision: false,
        combatant: null,
        footprint: { width: 2, height: 1 },
        hidden: false,
        id: 'entity_crate',
        meta: {},
        name: 'Crates',
        position: { x: 0, y: 1 },
        transition: null,
        type: 'object',
      },
    ],
  });

  const blocked = buildBlockedCellKeys({
    excludeTokenId: 'participant:player-001',
    scene,
    tokens: [
      {
        defeated: false,
        entityId: null,
        footprint: { width: 1, height: 1 },
        hp: null,
        id: 'participant:player-001',
        initials: 'AR',
        isCurrentTurn: false,
        isSelected: false,
        isTarget: false,
        kind: 'player',
        name: 'Aria',
        participantId: 'player-001',
        position: { x: 3, y: 0 },
      },
      {
        defeated: false,
        entityId: 'entity_goblin',
        footprint: { width: 1, height: 1 },
        hp: null,
        id: 'entity:entity_goblin',
        initials: 'GS',
        isCurrentTurn: false,
        isSelected: false,
        isTarget: false,
        kind: 'monster',
        name: 'Goblin',
        participantId: null,
        position: { x: 3, y: 1 },
      },
    ],
  });

  assert.ok(blocked.has('2,0'), 'painted wall blocks');
  assert.ok(blocked.has('0,1'), 'blocking entity blocks its footprint');
  assert.ok(blocked.has('1,1'), 'blocking entity blocks its whole footprint');
  assert.ok(blocked.has('3,1'), 'another token blocks');
  assert.equal(
    blocked.has('3,0'),
    false,
    'the excluded token does not block itself',
  );
  assert.equal(blocked.has('0,0'), false, 'plain floor is open');
});

test('getReachableCells matches the server Manhattan rule and skips blocked cells', () => {
  const reachable = getReachableCells({
    blockedCellKeys: new Set(['5,4']),
    budgetFeet: 10,
    grid,
    origin: { x: 5, y: 5 },
  });

  const keys = new Set(reachable.map(toCellKey));

  assert.ok(keys.has('5,3'), 'two cells away in a straight line is reachable');
  assert.ok(keys.has('6,6'), 'a diagonal within Manhattan budget is reachable');
  assert.equal(keys.has('5,4'), false, 'blocked cells are excluded');
  assert.equal(keys.has('5,5'), false, 'the origin is excluded');
  assert.equal(keys.has('7,6'), false, 'cells past the budget are excluded');
  assert.equal(
    keys.has('3,3'),
    false,
    'Manhattan distance 4 is past a 2-cell budget',
  );
});

test('getReachableCells returns nothing when the budget is under one cell', () => {
  assert.deepEqual(
    getReachableCells({
      blockedCellKeys: new Set(),
      budgetFeet: 4,
      grid,
      origin: { x: 2, y: 2 },
    }),
    [],
  );
});

test('getReachableCells stays inside the grid at a corner origin', () => {
  const reachable = getReachableCells({
    blockedCellKeys: new Set(),
    budgetFeet: 15,
    grid,
    origin: { x: 0, y: 0 },
  });

  assert.ok(
    reachable.every(
      (cell) =>
        cell.x >= 0 &&
        cell.y >= 0 &&
        cell.x < grid.width &&
        cell.y < grid.height,
    ),
  );
});

test('tile styles resolve for every tile and fall back for unknown values', () => {
  assert.equal(getTileStyle('wall').raised, true);
  assert.equal(getTileStyle('stone').raised, false);
  assert.equal(getTileStyle('water').liquid, true);
  assert.ok(getTileStyle('lava').glow);
  assert.equal(
    getTileStyle('nope' as never).base,
    getTileStyle('stone').base,
    'unknown tiles fall back to the default tile style',
  );
});

test('token palettes are defined for every token kind', () => {
  for (const kind of ['player', 'ally', 'monster', 'npc'] as const) {
    const palette = getTokenPalette(kind);

    assert.ok(palette.fill.startsWith('#'));
    assert.ok(palette.ring.startsWith('#'));
  }
});

test('getHealthColor steps from green through amber to red', () => {
  assert.equal(getHealthColor(1), '#54d98c');
  assert.equal(getHealthColor(0.5), '#e8b13c');
  assert.equal(getHealthColor(0.1), '#e05252');
  assert.equal(getHealthColor(-5), '#e05252');
  assert.equal(getHealthColor(5), '#54d98c');
});
