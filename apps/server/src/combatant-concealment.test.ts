import assert from 'node:assert/strict';
import test from 'node:test';

import { collectConcealedCombatantIds } from '@dnd/rules';
import type { Scene, SceneEntity } from '@dnd/shared';

import {
  findSceneCombatant,
  withCombatantHidden,
} from './combatant-concealment.js';

function createEntity(overrides: Partial<SceneEntity> = {}): SceneEntity {
  return {
    id: 'entity_00000000-0000-4000-8000-000000000001',
    type: 'monster',
    name: 'Goblin',
    position: { x: 1, y: 1 },
    footprint: { width: 1, height: 1 },
    blocksMovement: true,
    blocksVision: false,
    hidden: false,
    combatant: {
      kind: 'monster',
      hp: { max: 7, current: 7, temp: 0 },
      armorClass: 13,
      speed: 30,
      abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    },
    meta: {},
    ...overrides,
  };
}

function createScene(entities: SceneEntity[]): Scene {
  return {
    id: 'scene_00000000-0000-4000-8000-0000000000ff',
    sessionId: 'ABC123',
    name: 'Crypt',
    grid: { width: 10, height: 10, cellSizeFeet: 5 },
    entities,
    terrain: null,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  } as unknown as Scene;
}

test('a passive entity is not a combatant even when it exists', () => {
  const scene = createScene([createEntity({ combatant: null })]);

  assert.equal(findSceneCombatant(scene, scene.entities[0]!.id), undefined);
});

test('concealing a visible combatant rewrites exactly that entity', () => {
  const other = createEntity({
    id: 'entity_00000000-0000-4000-8000-000000000002',
  });
  const scene = createScene([createEntity(), other]);
  const change = withCombatantHidden(scene, scene.entities[0]!.id, true);

  assert.equal(change.changed, true);
  assert.equal(change.scene.entities[0]?.hidden, true);
  assert.equal(change.scene.entities[1]?.hidden, false);
  // The source scene is untouched, so a caller that decides not to save has not
  // already mutated the store's copy.
  assert.equal(scene.entities[0]?.hidden, false);
});

// Setting the value it already has is the double-click case. It must not
// produce a scene write or an event, and it must not be an error either.
test('setting the value it already has changes nothing', () => {
  const scene = createScene([createEntity({ hidden: true })]);
  const change = withCombatantHidden(scene, scene.entities[0]!.id, true);

  assert.equal(change.changed, false);
  assert.equal(change.scene, scene);
});

test('an unknown combatant is a no-op rather than a thrown scene', () => {
  const scene = createScene([createEntity()]);
  const change = withCombatantHidden(scene, 'entity_missing', true);

  assert.equal(change.changed, false);
  assert.equal(change.scene, scene);
});

test('conceal and reveal round-trip through the derived concealed set', () => {
  const scene = createScene([createEntity()]);
  const combatantId = scene.entities[0]!.id;

  const concealed = withCombatantHidden(scene, combatantId, true).scene;
  assert.deepEqual([...collectConcealedCombatantIds(concealed)], [combatantId]);

  const revealed = withCombatantHidden(concealed, combatantId, false).scene;
  assert.deepEqual([...collectConcealedCombatantIds(revealed)], []);

  const reconcealed = withCombatantHidden(revealed, combatantId, true).scene;
  assert.deepEqual(
    [...collectConcealedCombatantIds(reconcealed)],
    [combatantId],
  );
});
