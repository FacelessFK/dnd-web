import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCharacterProficiencies } from './character-proficiencies.js';

test('a character with nothing recorded is trained in nothing, not unknown', () => {
  assert.deepEqual(normalizeCharacterProficiencies(), {
    savingThrows: [],
    skills: [],
  });
  assert.deepEqual(normalizeCharacterProficiencies({}), {
    savingThrows: [],
    skills: [],
  });
});

test('choices are kept', () => {
  assert.deepEqual(
    normalizeCharacterProficiencies({
      savingThrows: ['con'],
      skills: ['athletics', 'perception'],
    }),
    { savingThrows: ['con'], skills: ['athletics', 'perception'] },
  );
});

// A duplicate changes no arithmetic - `isProficient` only asks whether the skill
// is present - but it does change how the character serializes, which matters
// once the record round-trips through the database and gets compared.
test('duplicates collapse and order is canonical, not insertion order', () => {
  const normalized = normalizeCharacterProficiencies({
    savingThrows: ['wis', 'con', 'con'],
    skills: ['perception', 'athletics', 'perception'],
  });

  assert.deepEqual(normalized.savingThrows, ['con', 'wis']);
  assert.deepEqual(normalized.skills, ['athletics', 'perception']);
  assert.deepEqual(
    normalizeCharacterProficiencies({
      savingThrows: ['con', 'wis'],
      skills: ['athletics', 'perception'],
    }),
    normalized,
    'two characters trained in the same things serialize identically',
  );
});
