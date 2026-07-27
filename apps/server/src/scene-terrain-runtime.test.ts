import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SCENE_TERRAIN_TILE,
  decodeSceneTerrain,
  getSceneTerrainTileAt,
} from '@dnd/rules';

import { InMemoryCharacterStore } from './character-store.js';
import { InMemoryGameRuntime } from './game-runtime.js';
import { MovementRuntimeError } from './movement-runtime.js';
import { SceneStoreError } from './scene-store.js';

// Initiative/damage rolls are irrelevant here but the runtime still needs
// deterministic rollers, matching the convention in game-runtime.test.ts.
const TEST_D20 = 10;
const TEST_DAMAGE_DIE = 3;

function createTestRuntime() {
  return new InMemoryGameRuntime<InMemoryCharacterStore>(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => TEST_D20,
    undefined,
    undefined,
    undefined,
    undefined,
    () => TEST_DAMAGE_DIE,
    () => TEST_D20,
  );
}

function createTable() {
  const runtime = createTestRuntime();
  const session = runtime.createSession({
    commandId: 'create-session-terrain',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: { rulesProfileId: 'dnd5e-2024-core' },
  });

  runtime.joinSession({
    commandId: 'join-session-terrain',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: { sessionId: session.sessionId },
  });

  const scene = runtime.createScene({
    commandId: 'create-scene-terrain',
    type: 'create_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: session.sessionId,
      scene: {
        name: 'Terrain Chamber',
        grid: { width: 8, height: 6, cellSizeFeet: 5 },
      },
    },
  });

  runtime.activateSceneForSession({
    commandId: 'activate-scene-terrain',
    type: 'activate_scene_for_session',
    actor: { participantId: 'dm-001' },
    payload: { sessionId: session.sessionId, sceneId: scene.id },
  });

  return { runtime, scene, sessionId: session.sessionId };
}

function paintTerrain(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  sceneId: string,
  cells: Parameters<
    InMemoryGameRuntime['paintSceneTerrain']
  >[0]['payload']['cells'],
  actorParticipantId = 'dm-001',
  commandId = `paint-terrain-${actorParticipantId}-${JSON.stringify(cells)}`,
) {
  return runtime.paintSceneTerrain({
    commandId,
    type: 'paint_scene_terrain',
    actor: { participantId: actorParticipantId },
    payload: { sessionId, sceneId, cells },
  });
}

function assignAndPlacePlayer(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  position = { x: 0, y: 0 },
) {
  const character = runtime.createCharacter({
    commandId: 'create-character-terrain',
    type: 'create_character',
    actor: { participantId: 'player-001' },
    payload: {
      sessionId,
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 1,
        className: 'Fighter',
        speciesOrRace: 'Human',
        background: 'Soldier',
        abilities: { str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 9 },
        hp: { max: 12, current: 12, temp: 0 },
        armorClass: 15,
        speed: 30,
        notes: null,
        meta: {},
      },
    },
  });

  runtime.finalizeCharacter({
    commandId: 'finalize-character-terrain',
    type: 'finalize_character',
    actor: { participantId: 'player-001' },
    payload: { sessionId, characterId: character.character.id },
  });

  runtime.assignCharacterToParticipant({
    commandId: 'assign-character-terrain',
    type: 'assign_character_to_participant',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId: character.character.id,
    },
  });

  runtime.placeCharacterInActiveScene({
    commandId: 'place-character-terrain',
    type: 'place_character_in_active_scene',
    actor: { participantId: 'player-001' },
    payload: { sessionId, participantId: 'player-001', position },
  });

  return character;
}

test('a new scene is created with a full-size default terrain layer', () => {
  const { scene } = createTable();

  assert.ok(scene.terrain);
  assert.equal(
    decodeSceneTerrain(scene.grid, scene.terrain).length,
    scene.grid.width * scene.grid.height,
  );
  assert.deepEqual(scene.terrain.runs, [
    { tile: DEFAULT_SCENE_TERRAIN_TILE, length: 48 },
  ]);
});

test('a scene can be created with a caller-supplied terrain layer', () => {
  const runtime = createTestRuntime();
  const session = runtime.createSession({
    commandId: 'create-session-supplied-terrain',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: { rulesProfileId: 'dnd5e-2024-core' },
  });

  const scene = runtime.createScene({
    commandId: 'create-scene-supplied-terrain',
    type: 'create_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: session.sessionId,
      scene: {
        name: 'Prebuilt Map',
        grid: { width: 4, height: 2, cellSizeFeet: 5 },
        terrain: {
          runs: [
            { tile: 'wall', length: 4 },
            { tile: 'grass', length: 4 },
          ],
        },
      },
    },
  });

  assert.equal(
    getSceneTerrainTileAt(scene.grid, scene.terrain, { x: 0, y: 0 }),
    'wall',
  );
  assert.equal(
    getSceneTerrainTileAt(scene.grid, scene.terrain, { x: 0, y: 1 }),
    'grass',
  );
});

test('the DM can paint terrain and the layer persists on the scene', () => {
  const { runtime, scene, sessionId } = createTable();

  const painted = paintTerrain(runtime, sessionId, scene.id, [
    { position: { x: 1, y: 1 }, tile: 'wall' },
    { position: { x: 2, y: 1 }, tile: 'water' },
  ]);

  assert.equal(
    getSceneTerrainTileAt(painted.grid, painted.terrain, { x: 1, y: 1 }),
    'wall',
  );
  assert.equal(
    getSceneTerrainTileAt(painted.grid, painted.terrain, { x: 2, y: 1 }),
    'water',
  );
  assert.equal(
    getSceneTerrainTileAt(painted.grid, painted.terrain, { x: 0, y: 0 }),
    DEFAULT_SCENE_TERRAIN_TILE,
  );

  const reread = runtime.getScene({
    commandId: 'get-scene-terrain',
    type: 'get_scene',
    actor: { participantId: 'dm-001' },
    payload: { sessionId, sceneId: scene.id },
  });

  assert.equal(
    getSceneTerrainTileAt(reread.grid, reread.terrain, { x: 1, y: 1 }),
    'wall',
  );
});

test('painting terrain is DM-gated server-side', () => {
  const { runtime, scene, sessionId } = createTable();

  assert.throws(
    () =>
      paintTerrain(
        runtime,
        sessionId,
        scene.id,
        [{ position: { x: 0, y: 0 }, tile: 'wall' }],
        'player-001',
      ),
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );

  const reread = runtime.getScene({
    commandId: 'get-scene-after-player-paint',
    type: 'get_scene',
    actor: { participantId: 'dm-001' },
    payload: { sessionId, sceneId: scene.id },
  });

  assert.equal(
    getSceneTerrainTileAt(reread.grid, reread.terrain, { x: 0, y: 0 }),
    DEFAULT_SCENE_TERRAIN_TILE,
  );
});

test('painting a cell outside the scene grid is rejected', () => {
  const { runtime, scene, sessionId } = createTable();

  assert.throws(
    () =>
      paintTerrain(runtime, sessionId, scene.id, [
        { position: { x: 8, y: 0 }, tile: 'wall' },
      ]),
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'scene_terrain_out_of_bounds',
  );

  assert.throws(
    () =>
      paintTerrain(runtime, sessionId, scene.id, [
        { position: { x: 0, y: 6 }, tile: 'wall' },
      ]),
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'scene_terrain_out_of_bounds',
  );
});

test('painting a blocking tile under a placed character is rejected', () => {
  const { runtime, scene, sessionId } = createTable();

  assignAndPlacePlayer(runtime, sessionId, { x: 3, y: 2 });

  assert.throws(
    () =>
      paintTerrain(runtime, sessionId, scene.id, [
        { position: { x: 3, y: 2 }, tile: 'chasm' },
      ]),
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'scene_terrain_blocks_occupant',
  );

  const reread = runtime.getScene({
    commandId: 'get-scene-after-trap-paint',
    type: 'get_scene',
    actor: { participantId: 'dm-001' },
    payload: { sessionId, sceneId: scene.id },
  });

  assert.equal(
    getSceneTerrainTileAt(reread.grid, reread.terrain, { x: 3, y: 2 }),
    DEFAULT_SCENE_TERRAIN_TILE,
  );
});

test('painting a walkable tile under a placed character is allowed', () => {
  const { runtime, scene, sessionId } = createTable();

  assignAndPlacePlayer(runtime, sessionId, { x: 3, y: 2 });

  const painted = paintTerrain(runtime, sessionId, scene.id, [
    { position: { x: 3, y: 2 }, tile: 'grass' },
  ]);

  assert.equal(
    getSceneTerrainTileAt(painted.grid, painted.terrain, { x: 3, y: 2 }),
    'grass',
  );
});

test('painted blocking terrain stops character movement', () => {
  const { runtime, scene, sessionId } = createTable();

  assignAndPlacePlayer(runtime, sessionId, { x: 0, y: 0 });
  paintTerrain(runtime, sessionId, scene.id, [
    { position: { x: 1, y: 0 }, tile: 'wall' },
  ]);

  assert.throws(
    () =>
      runtime.moveCharacterInActiveScene({
        commandId: 'move-into-painted-wall',
        type: 'move_character_in_active_scene',
        actor: { participantId: 'player-001' },
        payload: {
          sessionId,
          participantId: 'player-001',
          position: { x: 1, y: 0 },
        },
      }),
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'movement_destination_blocked',
  );
});

test('painted walkable terrain does not stop character movement', () => {
  const { runtime, scene, sessionId } = createTable();

  assignAndPlacePlayer(runtime, sessionId, { x: 0, y: 0 });
  paintTerrain(runtime, sessionId, scene.id, [
    { position: { x: 1, y: 0 }, tile: 'water' },
  ]);

  const moved = runtime.moveCharacterInActiveScene({
    commandId: 'move-into-painted-water',
    type: 'move_character_in_active_scene',
    actor: { participantId: 'player-001' },
    payload: {
      sessionId,
      participantId: 'player-001',
      position: { x: 1, y: 0 },
    },
  });

  assert.equal(moved.overlay.position?.x, 1);
  assert.equal(moved.overlay.position?.y, 0);
});

test('repainting a blocking cell to a walkable tile reopens movement', () => {
  const { runtime, scene, sessionId } = createTable();

  assignAndPlacePlayer(runtime, sessionId, { x: 0, y: 0 });
  paintTerrain(runtime, sessionId, scene.id, [
    { position: { x: 1, y: 0 }, tile: 'wall' },
  ]);
  paintTerrain(runtime, sessionId, scene.id, [
    { position: { x: 1, y: 0 }, tile: 'flagstone' },
  ]);

  const moved = runtime.moveCharacterInActiveScene({
    commandId: 'move-after-repaint',
    type: 'move_character_in_active_scene',
    actor: { participantId: 'player-001' },
    payload: {
      sessionId,
      participantId: 'player-001',
      position: { x: 1, y: 0 },
    },
  });

  assert.equal(moved.overlay.position?.x, 1);
});
