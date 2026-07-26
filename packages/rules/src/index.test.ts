import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BASELINE_MELEE_DAMAGE_DICE,
  calculateDamageModifier,
  formatDamageDiceNotation,
  isCriticalHit,
  isCriticalMiss,
  resolveAttackRoll,
  rollAttackDamage,
  rollDie,
  rollInitiative,
  sortEncounterParticipantsByInitiative,
} from './index.js';

function createSequenceRoller(values: number[]): (sides: number) => number {
  let index = 0;

  return () => {
    const value = values[index % values.length] ?? 1;
    index += 1;
    return value;
  };
}

test('critical hit and critical miss are read from the natural d20', () => {
  assert.equal(isCriticalHit(20), true);
  assert.equal(isCriticalHit(19), false);
  assert.equal(isCriticalMiss(1), true);
  assert.equal(isCriticalMiss(2), false);
});

test('a natural 20 hits even when the total is below the target armor class', () => {
  const outcome = resolveAttackRoll({
    d20: 20,
    modifier: -8,
    targetArmorClass: 18,
  });

  assert.equal(outcome.total, 12);
  assert.equal(outcome.hit, true);
  assert.equal(outcome.critical, true);
  assert.equal(outcome.criticalMiss, false);
});

test('a natural 1 misses even when the total meets the target armor class', () => {
  const outcome = resolveAttackRoll({
    d20: 1,
    modifier: 20,
    targetArmorClass: 15,
  });

  assert.equal(outcome.total, 21);
  assert.equal(outcome.hit, false);
  assert.equal(outcome.critical, false);
  assert.equal(outcome.criticalMiss, true);
});

test('ordinary attack rolls compare the total against the target armor class', () => {
  assert.equal(
    resolveAttackRoll({ d20: 12, modifier: 3, targetArmorClass: 15 }).hit,
    true,
  );
  assert.equal(
    resolveAttackRoll({ d20: 11, modifier: 3, targetArmorClass: 15 }).hit,
    false,
  );
});

test('rollDie rejects invalid die sizes and out-of-range roller results', () => {
  assert.throws(() => rollDie(1), RangeError);
  assert.throws(() => rollDie(8, () => 9), RangeError);
  assert.throws(() => rollDie(8, () => 0), RangeError);
  assert.equal(
    rollDie(8, () => 8),
    8,
  );
});

test('rollDie stays inside the requested range across many random rolls', () => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = rollDie(BASELINE_MELEE_DAMAGE_DICE.sides);

    assert.ok(value >= 1);
    assert.ok(value <= BASELINE_MELEE_DAMAGE_DICE.sides);
  }
});

test('damage adds the ability modifier once to the rolled dice total', () => {
  const damage = rollAttackDamage({
    modifier: 3,
    roller: createSequenceRoller([5]),
  });

  assert.deepEqual(damage.dice, [5]);
  assert.equal(damage.diceTotal, 5);
  assert.equal(damage.modifier, 3);
  assert.equal(damage.total, 8);
  assert.equal(damage.critical, false);
  assert.equal(damage.notation, '1d8+3');
});

test('a critical hit doubles the damage dice but not the modifier', () => {
  const damage = rollAttackDamage({
    critical: true,
    modifier: 3,
    roller: createSequenceRoller([5, 6]),
  });

  assert.deepEqual(damage.dice, [5, 6]);
  assert.equal(damage.diceTotal, 11);
  assert.equal(damage.total, 14);
  assert.equal(damage.critical, true);
  assert.equal(damage.notation, '2d8+3');
});

test('damage never resolves below zero for a strongly negative modifier', () => {
  const damage = rollAttackDamage({
    modifier: -5,
    roller: createSequenceRoller([2]),
  });

  assert.equal(damage.diceTotal, 2);
  assert.equal(damage.total, 0);
  assert.equal(damage.notation, '1d8-5');
});

test('damage notation omits a zero modifier', () => {
  assert.equal(formatDamageDiceNotation({ count: 1, sides: 8 }, 0), '1d8');
  assert.equal(formatDamageDiceNotation({ count: 2, sides: 6 }, 2), '2d6+2');
  assert.equal(formatDamageDiceNotation({ count: 1, sides: 4 }, -1), '1d4-1');
});

test('damage modifier uses the attacker Strength modifier', () => {
  assert.equal(
    calculateDamageModifier({
      abilities: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    }),
    3,
  );
  assert.equal(
    calculateDamageModifier({
      abilities: { str: 8, dex: 18, con: 10, int: 10, wis: 10, cha: 10 },
    }),
    -1,
  );
});

test('initiative adds the rolled d20 to the initiative modifier', () => {
  assert.equal(rollInitiative({ d20: 14, initiativeModifier: 3 }), 17);
  assert.equal(rollInitiative({ d20: 1, initiativeModifier: -1 }), 0);
});

test('rolled initiative orders participants from highest to lowest', () => {
  const ordered = sortEncounterParticipantsByInitiative([
    { participantId: 'player-002', characterId: 'char-b', initiative: 9 },
    { participantId: 'player-001', characterId: 'char-a', initiative: 21 },
    { participantId: 'dm-001', combatantId: 'goblin', initiative: 15 },
  ]);

  assert.deepEqual(
    ordered.map((entry) => entry.participantId),
    ['player-001', 'dm-001', 'player-002'],
  );
});

test('initiative ties fall back to a stable participant and actor ordering', () => {
  const ordered = sortEncounterParticipantsByInitiative([
    { participantId: 'player-002', characterId: 'char-b', initiative: 12 },
    { participantId: 'player-001', characterId: 'char-a', initiative: 12 },
  ]);

  assert.deepEqual(
    ordered.map((entry) => entry.participantId),
    ['player-001', 'player-002'],
  );
});
