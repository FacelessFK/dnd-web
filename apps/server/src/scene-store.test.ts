import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemorySceneStore, SceneStoreError } from './scene-store.js';

test('scene repository returns clones instead of exposing authoritative storage', () => {
  const store = new InMemorySceneStore();
  const createdScene = store.createScene({
    id: 'scene_11111111-1111-4111-8111-111111111111',
    sessionId: 'ABC123',
    name: 'Test Chamber',
    grid: {
      cellSizeFeet: 5,
      width: 6,
      height: 6,
    },
    entities: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  createdScene.entities.push({
    id: 'scene_entity_11111111-1111-4111-8111-111111111111',
    type: 'object',
    name: 'Local Mutation',
    position: {
      x: 0,
      y: 0,
    },
    footprint: {
      width: 1,
      height: 1,
    },
    blocksMovement: true,
    blocksVision: false,
    combatant: null,
    hidden: false,
    meta: {},
  });

  const storedScene = store.getScene(
    'scene_11111111-1111-4111-8111-111111111111',
  );

  assert.equal(storedScene.entities.length, 0);
});

test('getting an unknown scene fails safely', () => {
  const store = new InMemorySceneStore();

  assert.throws(
    () => {
      store.getScene('scene_99999999-9999-4999-8999-999999999999');
    },
    (error: unknown) =>
      error instanceof SceneStoreError && error.code === 'scene_not_found',
  );
});
