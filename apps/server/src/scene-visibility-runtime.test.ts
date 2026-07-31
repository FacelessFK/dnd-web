import assert from 'node:assert/strict';
import test from 'node:test';

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

  return { runtime, scene, sessionId: session.sessionId };
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
  runtime: InMemoryGameRuntime,
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

  const dmScene = getSceneAs(runtime, sessionId, scene.id, 'dm-001');
  const playerScene = getSceneAs(runtime, sessionId, scene.id, 'player-001');

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

  const playerScene = getSceneAs(runtime, sessionId, scene.id, 'player-001');
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

  const playerScene = getSceneAs(runtime, sessionId, scene.id, 'player-001');

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

  const dmScene = getSceneAs(runtime, sessionId, scene.id, 'dm-001');
  const playerScene = getSceneAs(runtime, sessionId, scene.id, 'player-001');
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
    getSceneAs(runtime, sessionId, scene.id, 'player-001').entities.length,
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

  const playerScene = getSceneAs(runtime, sessionId, scene.id, 'player-001');

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
    getSceneAs(runtime, sessionId, scene.id, 'player-001')
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
  const playerScene = getSceneAs(runtime, sessionId, scene.id, 'player-001');
  assert.equal(JSON.stringify(playerScene).includes(entityId), false);
  assert.equal(JSON.stringify(playerScene).includes('Lurking Ambusher'), false);

  // The DM keeps the authoritative view across the whole round trip.
  const dmScene = getSceneAs(runtime, sessionId, scene.id, 'dm-001');
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

  getSceneAs(runtime, sessionId, scene.id, 'player-001');
  const dmScene = getSceneAs(runtime, sessionId, scene.id, 'dm-001');

  assert.equal(dmScene.entities.length, 1);
  assert.equal(dmScene.entities[0]!.hidden, true);
});
