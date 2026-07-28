import assert from 'node:assert/strict';
import test from 'node:test';

import type { CombatEvent } from '@dnd/protocol';

import { projectCombatEventForRole } from './encounter-visibility.js';

function createCombatEvent(overrides: Partial<CombatEvent> = {}): CombatEvent {
  return {
    type: 'combat_event',
    reason: 'attack_resolved',
    sessionId: 'session_1',
    encounterId: 'encounter_1',
    attackerKind: 'combatant',
    attackerCombatantId: 'entity_hidden',
    attackerParticipantId: 'dm-001',
    targetKind: 'character',
    targetCharacterId: 'char_1',
    targetParticipantId: 'player-001',
    roll: { d20: 14, modifier: 4, total: 18 },
    targetArmorClass: 13,
    hit: true,
    damage: 6,
    targetHp: { previous: 26, current: 20 },
    ...overrides,
  };
}

test('the DM view is returned untouched', () => {
  const event = createCombatEvent();

  assert.equal(
    projectCombatEventForRole(event, 'dm', new Set(['entity_hidden'])),
    event,
  );
});

test('a concealed attacker loses its ID but the attack is still delivered', () => {
  const event = createCombatEvent();
  const projected = projectCombatEventForRole(
    event,
    'player',
    new Set(['entity_hidden']),
  );

  assert.equal(projected.attackerCombatantId, undefined);
  assert.equal(projected.attackerConcealed, true);
  // Being attacked by something unseen is not itself secret: the player must
  // still see the roll, the result, and the damage done to them.
  assert.equal(projected.roll.total, 18);
  assert.equal(projected.damage, 6);
  assert.deepEqual(projected.targetHp, { previous: 26, current: 20 });
});

test('a concealed target loses both its ID and its health', () => {
  const event = createCombatEvent({
    attackerKind: 'character',
    attackerCombatantId: undefined,
    attackerCharacterId: 'char_1',
    attackerParticipantId: 'player-001',
    targetKind: 'combatant',
    targetCharacterId: undefined,
    targetCombatantId: 'entity_hidden',
    targetParticipantId: 'dm-001',
  });
  const projected = projectCombatEventForRole(
    event,
    'player',
    new Set(['entity_hidden']),
  );

  assert.equal(projected.targetCombatantId, undefined);
  assert.equal(projected.targetConcealed, true);
  // HP is the field that would let a player track an unseen creature's health.
  assert.equal(projected.targetHp, undefined);
  assert.ok(!JSON.stringify(projected).includes('entity_hidden'));
});

test('an event with no concealed participant is returned by identity', () => {
  const event = createCombatEvent({ attackerCombatantId: 'entity_visible' });

  assert.equal(
    projectCombatEventForRole(event, 'player', new Set(['entity_hidden'])),
    event,
  );
  assert.equal(projectCombatEventForRole(event, 'player', new Set()), event);
});

test('projection does not mutate the event it was given', () => {
  const event = createCombatEvent();

  projectCombatEventForRole(event, 'player', new Set(['entity_hidden']));

  // The same authoritative event object is also handed to the DM's subscriber.
  assert.equal(event.attackerCombatantId, 'entity_hidden');
  assert.deepEqual(event.targetHp, { previous: 26, current: 20 });
});
