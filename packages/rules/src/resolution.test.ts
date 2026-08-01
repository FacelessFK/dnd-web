import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectConditionStanceSources,
  combineStances,
  isMechanicalCondition,
  resolveAbilityResolution,
  rollD20WithStance,
} from './resolution.js';

const abilities = { str: 16, dex: 14, con: 12, int: 10, wis: 13, cha: 8 };

/** Deterministic roller that hands back the given faces in order. */
function scriptedRoller(...faces: number[]) {
  let index = 0;

  return () => {
    if (index >= faces.length) {
      throw new Error('scripted roller ran out of faces');
    }

    return faces[index++]!;
  };
}

const actor = (overrides: Record<string, unknown> = {}) => ({
  abilities,
  level: 5,
  ...overrides,
});

test('an ability modifier and the die produce the total', () => {
  const result = resolveAbilityResolution({
    ability: 'dex',
    actor: actor(),
    dc: 15,
    kind: 'ability_check',
    roller: scriptedRoller(12),
  });

  // dex 14 -> +2, no proficiency
  assert.deepEqual(result.dice, [12]);
  assert.equal(result.selectedDie, 12);
  assert.equal(result.modifierTotal, 2);
  assert.equal(result.total, 14);
  assert.equal(result.success, false);
  assert.deepEqual(result.modifiers, [
    { kind: 'ability', detail: 'dex', value: 2 },
  ]);
});

// 5e compares "equals or exceeds". Getting this backwards silently fails every
// roll that lands exactly on the number.
test('a total equal to the DC succeeds', () => {
  const result = resolveAbilityResolution({
    ability: 'dex',
    actor: actor(),
    dc: 15,
    kind: 'ability_check',
    roller: scriptedRoller(13),
  });

  assert.equal(result.total, 15);
  assert.equal(result.success, true);
});

test('proficiency is added for a proficient ability', () => {
  const proficient = resolveAbilityResolution({
    ability: 'dex',
    actor: actor({ proficientAbilities: ['dex'] }),
    dc: 10,
    kind: 'saving_throw',
    roller: scriptedRoller(10),
  });
  const notProficient = resolveAbilityResolution({
    ability: 'dex',
    actor: actor({ proficientAbilities: ['str'] }),
    dc: 10,
    kind: 'saving_throw',
    roller: scriptedRoller(10),
  });

  // level 5 -> proficiency +3
  assert.equal(proficient.modifierTotal, 5);
  assert.equal(proficient.total, 15);
  assert.deepEqual(
    proficient.modifiers.map((modifier) => modifier.kind),
    ['ability', 'proficiency'],
  );

  assert.equal(notProficient.modifierTotal, 2);
  assert.deepEqual(
    notProficient.modifiers.map((modifier) => modifier.kind),
    ['ability'],
  );
});

test('skill proficiency is keyed on the skill, not the ability', () => {
  const result = resolveAbilityResolution({
    ability: 'dex',
    actor: actor({
      proficientAbilities: ['dex'],
      proficientSkills: ['stealth'],
    }),
    dc: 10,
    kind: 'ability_check',
    roller: scriptedRoller(10),
    skill: 'stealth',
  });
  const unskilled = resolveAbilityResolution({
    ability: 'dex',
    actor: actor({
      proficientAbilities: ['dex'],
      proficientSkills: ['stealth'],
    }),
    dc: 10,
    kind: 'ability_check',
    roller: scriptedRoller(10),
    skill: 'acrobatics',
  });

  assert.equal(result.modifierTotal, 5);
  assert.equal(
    result.modifiers.find((modifier) => modifier.kind === 'proficiency')
      ?.detail,
    'stealth',
  );
  assert.equal(unskilled.modifierTotal, 2);
});

test('advantage keeps the higher die and reports both', () => {
  const result = resolveAbilityResolution({
    ability: 'str',
    actor: actor(),
    dc: 10,
    kind: 'ability_check',
    requestedStance: 'advantage',
    roller: scriptedRoller(4, 17),
  });

  assert.deepEqual(result.dice, [4, 17]);
  assert.equal(result.selectedDie, 17);
  assert.equal(result.stance, 'advantage');
});

test('disadvantage keeps the lower die', () => {
  const result = resolveAbilityResolution({
    ability: 'str',
    actor: actor(),
    dc: 10,
    kind: 'ability_check',
    requestedStance: 'disadvantage',
    roller: scriptedRoller(18, 5),
  });

  assert.deepEqual(result.dice, [18, 5]);
  assert.equal(result.selectedDie, 5);
});

test('advantage and disadvantage cancel to a normal roll', () => {
  assert.equal(combineStances(['advantage', 'disadvantage']), 'normal');
  assert.equal(
    combineStances(['advantage', 'advantage', 'disadvantage']),
    'normal',
  );
  assert.equal(combineStances([]), 'normal');
  assert.equal(combineStances(['advantage']), 'advantage');
  assert.equal(combineStances(['disadvantage']), 'disadvantage');
});

// The bug this guards: counting occurrences instead of presence, so a second
// source of disadvantage rolls a third die or doubles a penalty.
test('two sources of the same stance do not stack', () => {
  assert.equal(
    combineStances(['disadvantage', 'disadvantage', 'disadvantage']),
    'disadvantage',
  );

  const outcome = rollD20WithStance({
    roller: scriptedRoller(9, 3),
    stance: combineStances(['disadvantage', 'disadvantage']),
  });

  assert.equal(outcome.dice.length, 2, 'still exactly two dice');
  assert.equal(outcome.selectedDie, 3);
});

test('poisoned imposes disadvantage on attacks and ability checks only', () => {
  assert.deepEqual(
    collectConditionStanceSources(['poisoned'], 'ability_check'),
    [{ kind: 'condition', detail: 'poisoned', stance: 'disadvantage' }],
  );
  assert.deepEqual(collectConditionStanceSources(['poisoned'], 'attack_roll'), [
    { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
  ]);
  // 2014 PHB: poisoned does not touch saving throws.
  assert.deepEqual(
    collectConditionStanceSources(['poisoned'], 'saving_throw'),
    [],
  );
});

test('a poisoned character rolls an ability check at disadvantage', () => {
  const clean = resolveAbilityResolution({
    ability: 'str',
    actor: actor(),
    dc: 12,
    kind: 'ability_check',
    roller: scriptedRoller(16),
  });
  const poisoned = resolveAbilityResolution({
    ability: 'str',
    actor: actor({ activeConditions: ['poisoned'] }),
    dc: 12,
    kind: 'ability_check',
    roller: scriptedRoller(16, 4),
  });

  assert.equal(clean.stance, 'normal');
  assert.equal(clean.selectedDie, 16);
  assert.equal(clean.success, true);

  assert.equal(poisoned.stance, 'disadvantage');
  assert.equal(poisoned.selectedDie, 4);
  assert.equal(poisoned.success, false);
  // The condition is named in the audit rather than silently changing a number.
  assert.deepEqual(poisoned.stanceSources, [
    { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
  ]);
});

test('a poisoned character rolls a saving throw normally', () => {
  const result = resolveAbilityResolution({
    ability: 'con',
    actor: actor({ activeConditions: ['poisoned'] }),
    dc: 12,
    kind: 'saving_throw',
    roller: scriptedRoller(11),
  });

  assert.equal(result.stance, 'normal');
  assert.deepEqual(result.dice, [11]);
  assert.deepEqual(result.stanceSources, []);
});

test('applying poisoned twice does not stack disadvantage', () => {
  const once = resolveAbilityResolution({
    ability: 'str',
    actor: actor({ activeConditions: ['poisoned'] }),
    dc: 10,
    kind: 'ability_check',
    roller: scriptedRoller(15, 6),
  });
  const twice = resolveAbilityResolution({
    ability: 'str',
    actor: actor({ activeConditions: ['poisoned', 'poisoned'] }),
    dc: 10,
    kind: 'ability_check',
    roller: scriptedRoller(15, 6),
  });

  assert.equal(twice.dice.length, 2);
  assert.equal(twice.selectedDie, once.selectedDie);
  assert.equal(twice.stanceSources.length, 1, 'one named source, not two');
});

test('removing the condition restores a normal roll', () => {
  const cleared = resolveAbilityResolution({
    ability: 'str',
    actor: actor({ activeConditions: [] }),
    dc: 10,
    kind: 'ability_check',
    roller: scriptedRoller(15),
  });

  assert.equal(cleared.stance, 'normal');
  assert.deepEqual(cleared.dice, [15]);
});

// A GM asking for advantage on a poisoned character gets a normal roll, and the
// audit shows both reasons rather than pretending nothing happened.
test('a GM stance and a condition stance cancel and are both recorded', () => {
  const result = resolveAbilityResolution({
    ability: 'str',
    actor: actor({ activeConditions: ['poisoned'] }),
    dc: 10,
    kind: 'ability_check',
    requestedStance: 'advantage',
    roller: scriptedRoller(13),
  });

  assert.equal(result.stance, 'normal');
  assert.deepEqual(result.stanceSources, [
    { kind: 'gm_request', stance: 'advantage' },
    { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
  ]);
});

test('a free-form GM tag has no mechanical effect', () => {
  assert.equal(isMechanicalCondition('poisoned'), true);
  assert.equal(isMechanicalCondition('inspired-by-the-bard'), false);
  assert.deepEqual(
    collectConditionStanceSources(['inspired-by-the-bard'], 'ability_check'),
    [],
  );
});

test('the roller is rejected when it returns an impossible face', () => {
  for (const face of [0, 21, 3.5]) {
    assert.throws(
      () => rollD20WithStance({ roller: () => face, stance: 'normal' }),
      RangeError,
    );
  }
});

test('resolution never calls Math.random on its own', () => {
  const original = Math.random;
  Math.random = () => {
    throw new Error('resolution must use the injected roller');
  };

  try {
    const result = resolveAbilityResolution({
      ability: 'wis',
      actor: actor(),
      dc: 10,
      kind: 'saving_throw',
      roller: scriptedRoller(8),
    });

    assert.equal(result.total, 9);
  } finally {
    Math.random = original;
  }
});
