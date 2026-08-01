import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveRuntimeStance } from './runtime-condition-stance.js';

test('an unafflicted attacker rolls one die at normal stance', () => {
  const derived = deriveRuntimeStance({
    kind: 'attack_roll',
    activeConditions: [],
  });

  assert.equal(derived.stance, 'normal');
  assert.deepEqual(derived.sources, []);
});

test('poisoned imposes disadvantage on an attack and names itself', () => {
  const derived = deriveRuntimeStance({
    kind: 'attack_roll',
    activeConditions: ['poisoned'],
  });

  assert.equal(derived.stance, 'disadvantage');
  assert.deepEqual(derived.sources, [
    { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
  ]);
});

test('poisoned twice is still one source and one disadvantage', () => {
  const derived = deriveRuntimeStance({
    kind: 'attack_roll',
    activeConditions: ['poisoned', 'poisoned'],
  });

  assert.equal(derived.stance, 'disadvantage');
  assert.equal(derived.sources.length, 1);
});

// The cancellation rule is what stops a naive "count the sources"
// implementation from shipping. Proved at the seam the attack path actually
// calls, not only in the pure helper underneath it.
test('an independent advantage source and poisoned cancel to a normal roll', () => {
  const derived = deriveRuntimeStance({
    kind: 'attack_roll',
    activeConditions: ['poisoned'],
    additionalStanceSources: [{ kind: 'gm_request', stance: 'advantage' }],
  });

  assert.equal(derived.stance, 'normal');
  // Both sources survive into the audit. A normal roll that had reasons to be
  // otherwise is not the same event as a roll nothing touched.
  assert.equal(derived.sources.length, 2);
});

test('two sources of advantage stay one advantage', () => {
  const derived = deriveRuntimeStance({
    kind: 'attack_roll',
    activeConditions: [],
    additionalStanceSources: [
      { kind: 'gm_request', stance: 'advantage' },
      { kind: 'condition', detail: 'flanking', stance: 'advantage' },
    ],
  });

  assert.equal(derived.stance, 'advantage');
});

test('poisoned leaves saving throws alone', () => {
  const derived = deriveRuntimeStance({
    kind: 'saving_throw',
    activeConditions: ['poisoned'],
  });

  assert.equal(derived.stance, 'normal');
  assert.deepEqual(derived.sources, []);
});

test('poisoned still applies to ability checks', () => {
  const derived = deriveRuntimeStance({
    kind: 'ability_check',
    activeConditions: ['poisoned'],
  });

  assert.equal(derived.stance, 'disadvantage');
});

test('a free-form GM tag the engine does not model changes nothing', () => {
  const derived = deriveRuntimeStance({
    kind: 'attack_roll',
    activeConditions: ['inspired-by-a-bard', 'covered-in-bees'],
  });

  assert.equal(derived.stance, 'normal');
  assert.deepEqual(derived.sources, []);
});

test('removing poisoned restores the normal stance', () => {
  const afflicted = deriveRuntimeStance({
    kind: 'attack_roll',
    activeConditions: ['poisoned'],
  });
  const cured = deriveRuntimeStance({
    kind: 'attack_roll',
    activeConditions: [],
  });

  assert.equal(afflicted.stance, 'disadvantage');
  assert.equal(cured.stance, 'normal');
});
