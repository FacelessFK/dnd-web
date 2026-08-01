import assert from 'node:assert/strict';
import test from 'node:test';

import { combatEventSchema, combatRollSchema } from './combat.js';
import { encounterStateUpdateReasonSchema } from './encounter.js';
import { sessionStreamEventSchema } from './stream.js';

const baseRoll = { d20: 14, modifier: 4, total: 18 };

const baseEvent = {
  type: 'combat_event',
  reason: 'attack_resolved',
  sessionId: 'ABC123',
  encounterId: 'encounter_11111111-1111-4111-8111-111111111111',
  attackerParticipantId: 'player-001',
  targetParticipantId: 'player-002',
  roll: baseRoll,
  targetArmorClass: 15,
  hit: true,
  damage: 6,
};

// A roll with no stance fields is a single die at normal stance, which `d20`
// already describes. The absence is a shorthand, not a missing fact.
test('a roll without stance fields still parses', () => {
  assert.doesNotThrow(() => combatRollSchema.parse(baseRoll));
});

test('a disadvantaged roll reports both faces and the source that caused it', () => {
  const parsed = combatRollSchema.parse({
    ...baseRoll,
    d20: 4,
    total: 8,
    stance: 'disadvantage',
    dice: [18, 4],
    stanceSources: [
      { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
    ],
  });

  assert.equal(parsed.stance, 'disadvantage');
  assert.deepEqual(parsed.dice, [18, 4]);
  assert.equal(parsed.stanceSources?.[0]?.detail, 'poisoned');
});

test('a stance is one of the three the rules define', () => {
  assert.equal(
    combatRollSchema.safeParse({ ...baseRoll, stance: 'super-advantage' })
      .success,
    false,
  );
});

test('no roll reports more than two dice', () => {
  assert.equal(
    combatRollSchema.safeParse({ ...baseRoll, dice: [3, 11, 19] }).success,
    false,
  );
  assert.equal(
    combatRollSchema.safeParse({ ...baseRoll, dice: [] }).success,
    false,
  );
});

test('a die face outside 1-20 is refused', () => {
  assert.equal(
    combatRollSchema.safeParse({ ...baseRoll, dice: [0] }).success,
    false,
  );
  assert.equal(
    combatRollSchema.safeParse({ ...baseRoll, dice: [21] }).success,
    false,
  );
});

test('a combat event carrying a stance is a valid stream event', () => {
  assert.doesNotThrow(() =>
    sessionStreamEventSchema.parse({
      ...baseEvent,
      roll: {
        ...baseRoll,
        stance: 'disadvantage',
        dice: [18, 14],
        stanceSources: [
          { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
        ],
      },
    }),
  );
});

test('an event still parses when nothing changed the dice', () => {
  assert.doesNotThrow(() => combatEventSchema.parse(baseEvent));
});

test('a visibility change is a recognized encounter update reason', () => {
  assert.doesNotThrow(() =>
    encounterStateUpdateReasonSchema.parse('dm_combatant_visibility_changed'),
  );
  assert.equal(
    encounterStateUpdateReasonSchema.safeParse('dm_combatant_vanished').success,
    false,
  );
});
