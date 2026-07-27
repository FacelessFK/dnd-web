import assert from 'node:assert/strict';
import test from 'node:test';

import type { Scene, SceneEntity } from '@dnd/shared';

import { projectSceneForRole } from './index.js';

function buildEntity(overrides: Partial<SceneEntity> = {}): SceneEntity {
  return {
    id: 'entity-visible',
    type: 'object',
    name: 'Crate',
    position: { x: 1, y: 1 },
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

function buildScene(entities: SceneEntity[]): Scene {
  return {
    id: 'scene-1',
    sessionId: 'session-1',
    name: 'Ambush Corridor',
    grid: { cellSizeFeet: 5, width: 10, height: 10 },
    terrain: null,
    entities,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

test('the DM receives every entity, including hidden ones', () => {
  const scene = buildScene([
    buildEntity(),
    buildEntity({
      id: 'entity-hidden',
      hidden: true,
      name: 'Lurking Ambusher',
    }),
  ]);

  const projected = projectSceneForRole(scene, 'dm');

  assert.equal(projected.entities.length, 2);
  assert.deepEqual(
    projected.entities.map((entity) => entity.id),
    ['entity-visible', 'entity-hidden'],
  );
});

test('a player never receives a hidden entity', () => {
  const scene = buildScene([
    buildEntity(),
    buildEntity({
      id: 'entity-hidden',
      hidden: true,
      name: 'Lurking Ambusher',
    }),
  ]);

  const projected = projectSceneForRole(scene, 'player');

  assert.deepEqual(
    projected.entities.map((entity) => entity.id),
    ['entity-visible'],
  );
});

// The point of the fix: concealment cannot be a rendering concern, so no part
// of a hidden entity may survive the projection for a player to read.
test('no trace of a hidden entity survives the player projection', () => {
  const scene = buildScene([
    buildEntity({
      id: 'entity-hidden',
      hidden: true,
      name: 'Lurking Ambusher',
      combatant: {
        kind: 'monster',
        hp: { max: 30, current: 30, temp: 0 },
        armorClass: 15,
        speed: 30,
        abilities: { str: 16, dex: 14, con: 14, int: 6, wis: 10, cha: 6 },
      },
      meta: { secretNote: 'springs at initiative 12' },
    }),
  ]);

  const projected = projectSceneForRole(scene, 'player');

  assert.deepEqual(projected.entities, []);
  assert.ok(!JSON.stringify(projected).includes('Lurking Ambusher'));
  assert.ok(!JSON.stringify(projected).includes('springs at initiative 12'));
});

test('a hidden transition is not revealed to a player', () => {
  const scene = buildScene([
    buildEntity({
      id: 'entity-secret-door',
      hidden: true,
      name: 'Secret Door',
      type: 'terrain',
      transition: {
        kind: 'door',
        targetSceneId: 'scene-vault',
        targetLabel: 'Hidden Vault',
        notes: 'Opens on the third torch.',
      },
    }),
  ]);

  const projected = projectSceneForRole(scene, 'player');

  assert.deepEqual(projected.entities, []);
  assert.ok(!JSON.stringify(projected).includes('scene-vault'));
});

test('projection preserves everything a player is allowed to see', () => {
  const scene = buildScene([buildEntity()]);

  const projected = projectSceneForRole(scene, 'player');

  assert.equal(projected.id, scene.id);
  assert.equal(projected.name, scene.name);
  assert.deepEqual(projected.grid, scene.grid);
  assert.deepEqual(projected.terrain, scene.terrain);
  assert.equal(projected.createdAt, scene.createdAt);
  assert.equal(projected.updatedAt, scene.updatedAt);
});

test('projection does not mutate the stored scene', () => {
  const scene = buildScene([
    buildEntity(),
    buildEntity({ id: 'entity-hidden', hidden: true }),
  ]);

  projectSceneForRole(scene, 'player');

  assert.equal(scene.entities.length, 2);
});

test('a scene with no hidden entities is unchanged for either role', () => {
  const scene = buildScene([buildEntity()]);

  assert.deepEqual(projectSceneForRole(scene, 'player'), scene);
  assert.deepEqual(projectSceneForRole(scene, 'dm'), scene);
});
