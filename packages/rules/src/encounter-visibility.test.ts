import assert from 'node:assert/strict';
import test from 'node:test';

import type { Encounter, Scene } from '@dnd/shared';

import { collectConcealedCombatantIds, projectEncounterForRole } from './index';

function createScene(
  entities: {
    combatant: boolean;
    hidden: boolean;
    id: string;
  }[],
): Scene {
  return {
    id: 'scene_1',
    sessionId: 'session_1',
    name: 'Ambush Corridor',
    grid: { width: 8, height: 6, cellSizeFeet: 5 },
    entities: entities.map((entity) => ({
      id: entity.id,
      type: 'monster',
      name: entity.id,
      position: { x: 0, y: 0 },
      footprint: { width: 1, height: 1 },
      blocksMovement: true,
      blocksVision: false,
      hidden: entity.hidden,
      ...(entity.combatant
        ? {
            combatant: {
              kind: 'monster',
              hp: { max: 8, current: 8, temp: 0 },
              armorClass: 12,
              speed: 30,
              abilities: { str: 14, dex: 12, con: 12, int: 8, wis: 10, cha: 8 },
            },
          }
        : {}),
    })),
    transitions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Scene;
}

function createEncounter(): Encounter {
  return {
    id: 'encounter_1',
    sessionId: 'session_1',
    sceneId: 'scene_1',
    status: 'active',
    participants: [
      { characterId: 'char_1', participantId: 'player-001', initiative: 18 },
      {
        kind: 'combatant',
        combatantId: 'entity_hidden',
        participantId: 'dm-001',
        initiative: 14,
      },
      {
        kind: 'combatant',
        combatantId: 'entity_visible',
        participantId: 'dm-001',
        initiative: 11,
      },
    ],
    currentTurnIndex: 1,
    roundNumber: 1,
    currentTurnUsage: {
      actionUsed: false,
      bonusActionUsed: false,
      reactionUsed: false,
      movementUsed: 0,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

test('only hidden combatants are collected, not hidden scenery', () => {
  const scene = createScene([
    { combatant: true, hidden: true, id: 'entity_hidden' },
    { combatant: true, hidden: false, id: 'entity_visible' },
    // A hidden non-combatant (a secret door, say) is concealed by the scene
    // projection and never appears in an encounter, so it does not belong here.
    { combatant: false, hidden: true, id: 'entity_secret_door' },
  ]);

  assert.deepEqual([...collectConcealedCombatantIds(scene)], ['entity_hidden']);
});

test('the DM view is returned untouched', () => {
  const encounter = createEncounter();
  const projected = projectEncounterForRole(
    encounter,
    'dm',
    new Set(['entity_hidden']),
  );

  assert.equal(projected, encounter);
});

test('a player loses the concealed combatant ID but keeps the slot', () => {
  const encounter = createEncounter();
  const projected = projectEncounterForRole(
    encounter,
    'player',
    new Set(['entity_hidden']),
  );

  assert.equal(projected.participants.length, 3);
  assert.equal(projected.currentTurnIndex, encounter.currentTurnIndex);
  assert.deepEqual(projected.participants[1], {
    kind: 'concealed_combatant',
    participantId: 'dm-001',
    initiative: 14,
  });
  // The visible combatant is untouched.
  assert.deepEqual(projected.participants[2], encounter.participants[2]);
  assert.ok(!JSON.stringify(projected).includes('entity_hidden'));
});

test('projection does not mutate the encounter it was given', () => {
  const encounter = createEncounter();

  projectEncounterForRole(encounter, 'player', new Set(['entity_hidden']));

  // The authoritative object must survive intact, or a projected read would
  // corrupt the state every later mutation depends on.
  assert.deepEqual(encounter.participants[1], {
    kind: 'combatant',
    combatantId: 'entity_hidden',
    participantId: 'dm-001',
    initiative: 14,
  });
});

test('an encounter with nothing concealed is returned by identity', () => {
  const encounter = createEncounter();

  assert.equal(
    projectEncounterForRole(encounter, 'player', new Set()),
    encounter,
  );
  assert.equal(
    projectEncounterForRole(encounter, 'player', new Set(['entity_absent'])),
    encounter,
  );
});
