import assert from 'node:assert/strict';
import test from 'node:test';

import type { Scene, SceneView } from '@dnd/shared';

import { InMemoryCharacterStore } from './character-store.js';
import { InMemoryGameRuntime } from './game-runtime.js';

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
    commandId: 'create-session-visibility',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: { rulesProfileId: 'dnd5e-2024-core' },
  });

  runtime.joinSession({
    commandId: 'join-session-visibility',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: { sessionId: session.sessionId },
  });

  const scene = runtime.createScene({
    commandId: 'create-scene-visibility',
    type: 'create_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: session.sessionId,
      scene: {
        name: 'Ambush Corridor',
        grid: { width: 8, height: 6, cellSizeFeet: 5 },
      },
    },
  });

  runtime.activateSceneForSession({
    commandId: 'activate-scene-visibility',
    type: 'activate_scene_for_session',
    actor: { participantId: 'dm-001' },
    payload: { sessionId: session.sessionId, sceneId: scene.id },
  });

  // The player needs a placed character or fog of war leaves them with nothing
  // to see, and every concealment assertion below would pass for the wrong
  // reason. The corridor is open and brightly lit, so their line of sight
  // covers the whole map and `hidden` is the only thing withholding anything.
  assignAndPlacePlayer(runtime, session.sessionId);

  return { runtime, scene, sessionId: session.sessionId };
}

function assignAndPlacePlayer(
  runtime: InMemoryGameRuntime<InMemoryCharacterStore>,
  sessionId: string,
  position = { x: 0, y: 0 },
) {
  const character = runtime.createCharacter({
    commandId: 'create-character-visibility',
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
    commandId: 'finalize-character-visibility',
    type: 'finalize_character',
    actor: { participantId: 'player-001' },
    payload: { sessionId, characterId: character.character.id },
  });

  runtime.assignCharacterToParticipant({
    commandId: 'assign-character-visibility',
    type: 'assign_character_to_participant',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId: character.character.id,
    },
  });

  runtime.placeCharacterInActiveScene({
    commandId: 'place-character-visibility',
    type: 'place_character_in_active_scene',
    actor: { participantId: 'player-001' },
    payload: { sessionId, participantId: 'player-001', position },
  });

  return character;
}

function placeEntity(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  sceneId: string,
  entity: {
    name: string;
    hidden: boolean;
    position: { x: number; y: number };
    blocksMovement?: boolean;
    meta?: Record<string, string>;
  },
) {
  return runtime.placeEntityInScene({
    commandId: `place-entity-${entity.name}`,
    type: 'place_entity_in_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      sceneId,
      entity: {
        type: 'monster',
        name: entity.name,
        position: entity.position,
        footprint: { width: 1, height: 1 },
        blocksMovement: entity.blocksMovement ?? true,
        blocksVision: false,
        hidden: entity.hidden,
        ...(entity.meta ? { meta: entity.meta } : {}),
      },
    },
  });
}

function getSceneAs(
  runtime: InMemoryGameRuntime<InMemoryCharacterStore>,
  sessionId: string,
  sceneId: string,
  participantId: string,
) {
  return runtime.getScene({
    commandId: `get-scene-${participantId}`,
    type: 'get_scene',
    actor: { participantId },
    payload: { sessionId, sceneId },
  });
}

/** The DM's read, asserted to be the authoritative scene rather than a view. */
function getAuthoritativeSceneAs(
  runtime: InMemoryGameRuntime<InMemoryCharacterStore>,
  sessionId: string,
  sceneId: string,
  participantId: string,
): Scene {
  const scene = getSceneAs(runtime, sessionId, sceneId, participantId);

  assert.equal(scene instanceof Promise, false);
  assert.equal('terrain' in (scene as Scene), true);

  return scene as Scene;
}

/**
 * A player's read, asserted to be a projected view. The assertion is the point:
 * if `get_scene` ever handed a player an authoritative `Scene` again, every
 * concealment test in this file would still pass and only this would fail.
 */
function getProjectedSceneAs(
  runtime: InMemoryGameRuntime<InMemoryCharacterStore>,
  sessionId: string,
  sceneId: string,
  participantId: string,
): SceneView {
  const scene = getSceneAs(runtime, sessionId, sceneId, participantId);

  assert.equal(scene instanceof Promise, false);
  assert.equal((scene as SceneView).view, 'player_projection');

  return scene as SceneView;
}

test('get_scene hides hidden entities from a player but not from the DM', () => {
  const { runtime, scene, sessionId } = createTable();

  placeEntity(runtime, sessionId, scene.id, {
    name: 'Rusted Statue',
    hidden: false,
    position: { x: 1, y: 1 },
  });
  placeEntity(runtime, sessionId, scene.id, {
    name: 'Lurking Ambusher',
    hidden: true,
    position: { x: 4, y: 3 },
  });

  const dmScene = getAuthoritativeSceneAs(
    runtime,
    sessionId,
    scene.id,
    'dm-001',
  );
  const playerScene = getProjectedSceneAs(
    runtime,
    sessionId,
    scene.id,
    'player-001',
  );

  assert.deepEqual(
    dmScene.entities.map((entity) => entity.name),
    ['Rusted Statue', 'Lurking Ambusher'],
  );
  assert.deepEqual(
    playerScene.entities.map((entity) => entity.name),
    ['Rusted Statue'],
  );
});

// The bug this file exists for: concealment used to be a client-side render
// filter, so the full entity still crossed the wire and was readable in
// devtools or by a hand-written request.
test('nothing about a hidden entity reaches a player over the wire', () => {
  const { runtime, scene, sessionId } = createTable();

  placeEntity(runtime, sessionId, scene.id, {
    name: 'Lurking Ambusher',
    hidden: true,
    position: { x: 4, y: 3 },
    meta: { secretNote: 'springs at initiative 12' },
  });

  const playerScene = getProjectedSceneAs(
    runtime,
    sessionId,
    scene.id,
    'player-001',
  );
  const serialized = JSON.stringify(playerScene);

  assert.equal(playerScene.entities.length, 0);
  assert.ok(!serialized.includes('Lurking Ambusher'));
  assert.ok(!serialized.includes('springs at initiative 12'));
  // Position is the tell that matters most - it is what a player would use to
  // pre-empt the ambush.
  assert.ok(!serialized.includes('"x":4'));
});

test('a hidden blocking entity does not leak its position to a player', () => {
  const { runtime, scene, sessionId } = createTable();

  placeEntity(runtime, sessionId, scene.id, {
    name: 'Concealed Portcullis',
    hidden: true,
    blocksMovement: true,
    position: { x: 2, y: 2 },
  });

  const playerScene = getProjectedSceneAs(
    runtime,
    sessionId,
    scene.id,
    'player-001',
  );

  // Dropping the whole entity - rather than blanking its fields - is what stops
  // the client's reachable-cell overlay from outlining an undrawn blocker.
  assert.deepEqual(playerScene.entities, []);
});

test('a hidden transition does not reveal its target scene to a player', () => {
  const { runtime, scene, sessionId } = createTable();

  const targetScene = runtime.createScene({
    commandId: 'create-scene-vault',
    type: 'create_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      scene: {
        name: 'Hidden Vault',
        grid: { width: 4, height: 4, cellSizeFeet: 5 },
      },
    },
  });

  runtime.createSceneTransition({
    commandId: 'create-transition-secret',
    type: 'create_scene_transition',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      sceneId: scene.id,
      transition: {
        kind: 'door',
        name: 'Secret Door',
        position: { x: 6, y: 5 },
        footprint: { width: 1, height: 1 },
        blocksMovement: false,
        blocksVision: false,
        hidden: true,
        targetSceneId: targetScene.id,
        targetLabel: 'Hidden Vault',
        notes: 'Opens on the third torch.',
      },
    },
  });

  const dmScene = getAuthoritativeSceneAs(
    runtime,
    sessionId,
    scene.id,
    'dm-001',
  );
  const playerScene = getProjectedSceneAs(
    runtime,
    sessionId,
    scene.id,
    'player-001',
  );
  const serialized = JSON.stringify(playerScene);

  assert.equal(dmScene.entities.length, 1);
  assert.equal(playerScene.entities.length, 0);
  assert.ok(!serialized.includes(targetScene.id));
  assert.ok(!serialized.includes('Opens on the third torch.'));
});

test('revealing a hidden entity makes it visible to a player', () => {
  const { runtime, scene, sessionId } = createTable();

  const withEntity = placeEntity(runtime, sessionId, scene.id, {
    name: 'Lurking Ambusher',
    hidden: true,
    position: { x: 4, y: 3 },
  });
  const entityId = withEntity.entities[0]!.id;

  assert.equal(
    getProjectedSceneAs(runtime, sessionId, scene.id, 'player-001').entities
      .length,
    0,
  );

  runtime.updateSceneEntity({
    commandId: 'reveal-ambusher',
    type: 'update_scene_entity',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      sceneId: scene.id,
      entityId,
      entity: { hidden: false },
    },
  });

  const playerScene = getProjectedSceneAs(
    runtime,
    sessionId,
    scene.id,
    'player-001',
  );

  assert.deepEqual(
    playerScene.entities.map((entity) => entity.name),
    ['Lurking Ambusher'],
  );
});

// Reveal was covered; concealing again was not. The projection is derived from
// `hidden` on every read rather than cached, so this is the assertion that would
// catch a future memoised concealment set that never invalidates - the failure
// mode being a creature the DM has hidden again staying visible to players for
// the rest of the session. A visible sibling is present throughout so the test
// distinguishes "re-hidden" from "projection dropped everything".
test('concealing a revealed entity again hides it from the player', () => {
  const { runtime, scene, sessionId } = createTable();

  placeEntity(runtime, sessionId, scene.id, {
    name: 'Corridor Brazier',
    hidden: false,
    position: { x: 1, y: 1 },
  });
  const withEntity = placeEntity(runtime, sessionId, scene.id, {
    name: 'Lurking Ambusher',
    hidden: true,
    position: { x: 4, y: 3 },
  });
  const entityId = withEntity.entities.find(
    (entity) => entity.name === 'Lurking Ambusher',
  )!.id;

  const setHidden = (hidden: boolean, commandId: string) => {
    runtime.updateSceneEntity({
      commandId,
      type: 'update_scene_entity',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, sceneId: scene.id, entityId, entity: { hidden } },
    });
  };
  const playerEntityNames = () =>
    getProjectedSceneAs(runtime, sessionId, scene.id, 'player-001')
      .entities.map((entity) => entity.name)
      .sort();

  assert.deepEqual(playerEntityNames(), ['Corridor Brazier']);

  setHidden(false, 'reveal-ambusher-again');
  assert.deepEqual(playerEntityNames(), [
    'Corridor Brazier',
    'Lurking Ambusher',
  ]);

  setHidden(true, 'conceal-ambusher-again');
  assert.deepEqual(
    playerEntityNames(),
    ['Corridor Brazier'],
    'the re-concealed entity must disappear from the player projection again',
  );

  // Nothing about it may survive anywhere in the player payload.
  const playerScene = getProjectedSceneAs(
    runtime,
    sessionId,
    scene.id,
    'player-001',
  );
  assert.equal(JSON.stringify(playerScene).includes(entityId), false);
  assert.equal(JSON.stringify(playerScene).includes('Lurking Ambusher'), false);

  // The DM keeps the authoritative view across the whole round trip.
  const dmScene = getAuthoritativeSceneAs(
    runtime,
    sessionId,
    scene.id,
    'dm-001',
  );
  assert.deepEqual(dmScene.entities.map((entity) => entity.name).sort(), [
    'Corridor Brazier',
    'Lurking Ambusher',
  ]);
  assert.equal(
    dmScene.entities.find((entity) => entity.id === entityId)?.hidden,
    true,
  );
});

test('the player projection leaves the stored scene untouched for the DM', () => {
  const { runtime, scene, sessionId } = createTable();

  placeEntity(runtime, sessionId, scene.id, {
    name: 'Lurking Ambusher',
    hidden: true,
    position: { x: 4, y: 3 },
  });

  getProjectedSceneAs(runtime, sessionId, scene.id, 'player-001');
  const dmScene = getAuthoritativeSceneAs(
    runtime,
    sessionId,
    scene.id,
    'dm-001',
  );

  assert.equal(dmScene.entities.length, 1);
  assert.equal(dmScene.entities[0]!.hidden, true);
});

// ---------------------------------------------------------------------------
// Lighting data round trips
// ---------------------------------------------------------------------------
// Every one of these was a real defect caught by the M3 browser smoke rather
// than by review: the schemas accepted the new fields and the command handlers
// dropped them on the floor, so a dark scene came back bright and a torch could
// not be snuffed. A field that validates but is never persisted is worse than a
// missing field, because everything about it looks like it works.

test('a scene created as dark stays dark', () => {
  const { runtime, sessionId } = createTable();

  const scene = runtime.createScene({
    commandId: 'create-scene-dark',
    type: 'create_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      scene: {
        name: 'Unlit Vault',
        grid: { width: 6, height: 6, cellSizeFeet: 5 },
        ambientLight: 'dark',
      },
    },
  });

  assert.equal(scene.ambientLight, 'dark');
  assert.equal(
    getAuthoritativeSceneAs(runtime, sessionId, scene.id, 'dm-001')
      .ambientLight,
    'dark',
  );
});

test('a scene created without an opinion carries no ambient light at all', () => {
  const { scene } = createTable();

  assert.equal(scene.ambientLight, undefined);
});

test('a placed entity keeps the light source it was placed with', () => {
  const { runtime, scene, sessionId } = createTable();

  const withTorch = runtime.placeEntityInScene({
    commandId: 'place-torch',
    type: 'place_entity_in_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      sceneId: scene.id,
      entity: {
        type: 'object',
        name: 'Torch',
        position: { x: 2, y: 2 },
        footprint: { width: 1, height: 1 },
        blocksMovement: false,
        blocksVision: false,
        hidden: false,
        lightSource: { enabled: true, brightRadius: 2, dimRadius: 5 },
      },
    },
  });
  const torch = withTorch.entities.find((entity) => entity.name === 'Torch');

  assert.deepEqual(torch?.lightSource, {
    enabled: true,
    brightRadius: 2,
    dimRadius: 5,
  });
});

test('an entity placed without a light source emits nothing', () => {
  const { runtime, scene, sessionId } = createTable();

  const placed = placeEntity(runtime, sessionId, scene.id, {
    name: 'Crate',
    hidden: false,
    position: { x: 1, y: 1 },
  });

  assert.equal(placed.entities[0]?.lightSource, null);
});

test('a light source can be snuffed and relit through update_scene_entity', () => {
  const { runtime, scene, sessionId } = createTable();

  const withTorch = runtime.placeEntityInScene({
    commandId: 'place-torch-toggle',
    type: 'place_entity_in_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      sceneId: scene.id,
      entity: {
        type: 'object',
        name: 'Torch',
        position: { x: 2, y: 2 },
        footprint: { width: 1, height: 1 },
        blocksMovement: false,
        blocksVision: false,
        hidden: false,
        lightSource: { enabled: true, brightRadius: 1, dimRadius: 4 },
      },
    },
  });
  const entityId = withTorch.entities.find(
    (entity) => entity.name === 'Torch',
  )!.id;

  const setLight = (lightSource: unknown, commandId: string) =>
    runtime.updateSceneEntity({
      commandId,
      type: 'update_scene_entity',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        sceneId: scene.id,
        entityId,
        entity: { lightSource } as never,
      },
    });

  const snuffed = setLight(
    { enabled: false, brightRadius: 1, dimRadius: 4 },
    'snuff-torch',
  );

  assert.equal(
    snuffed.entities.find((entity) => entity.id === entityId)?.lightSource
      ?.enabled,
    false,
  );

  const relit = setLight(
    { enabled: true, brightRadius: 3, dimRadius: 6 },
    'relight-torch',
  );

  assert.deepEqual(
    relit.entities.find((entity) => entity.id === entityId)?.lightSource,
    { enabled: true, brightRadius: 3, dimRadius: 6 },
  );

  const removed = setLight(null, 'remove-torch-light');

  assert.equal(
    removed.entities.find((entity) => entity.id === entityId)?.lightSource,
    null,
  );
});

test('an update that says nothing about light leaves the light alone', () => {
  const { runtime, scene, sessionId } = createTable();

  const withTorch = runtime.placeEntityInScene({
    commandId: 'place-torch-untouched',
    type: 'place_entity_in_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      sceneId: scene.id,
      entity: {
        type: 'object',
        name: 'Torch',
        position: { x: 2, y: 2 },
        footprint: { width: 1, height: 1 },
        blocksMovement: false,
        blocksVision: false,
        hidden: false,
        lightSource: { enabled: true, brightRadius: 1, dimRadius: 4 },
      },
    },
  });
  const entityId = withTorch.entities.find(
    (entity) => entity.name === 'Torch',
  )!.id;

  const renamed = runtime.updateSceneEntity({
    commandId: 'rename-torch',
    type: 'update_scene_entity',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      sceneId: scene.id,
      entityId,
      entity: { name: 'Brazier' },
    },
  });

  assert.deepEqual(
    renamed.entities.find((entity) => entity.id === entityId)?.lightSource,
    { enabled: true, brightRadius: 1, dimRadius: 4 },
  );
});
