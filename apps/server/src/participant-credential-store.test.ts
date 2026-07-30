import assert from 'node:assert/strict';
import test from 'node:test';

import { ParticipantCredentialStore } from './participant-credential-store.js';

test('an issued credential verifies for exactly its own session and participant', () => {
  const store = new ParticipantCredentialStore();
  const token = store.issue('ABC123', 'dm-001');

  assert.equal(store.verify('ABC123', 'dm-001', token), true);
  assert.equal(store.verify('ABC123', 'player-001', token), false);
  assert.equal(store.verify('XYZ789', 'dm-001', token), false);
});

test('issued credentials are unguessable and unique per participant', () => {
  const store = new ParticipantCredentialStore();
  const first = store.issue('ABC123', 'dm-001');
  const second = store.issue('ABC123', 'player-001');

  assert.notEqual(first, second);
  // 32 random bytes, base64url, unpadded.
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
});

test('a missing, empty, or wrong credential never verifies', () => {
  const store = new ParticipantCredentialStore();

  store.issue('ABC123', 'dm-001');

  assert.equal(store.verify('ABC123', 'dm-001', null), false);
  assert.equal(store.verify('ABC123', 'dm-001', ''), false);
  assert.equal(store.verify('ABC123', 'dm-001', 'not-the-token'), false);
});

test('verifying an unknown participant fails instead of throwing', () => {
  const store = new ParticipantCredentialStore();

  // A store with nothing in it is the state after a restart. It must refuse
  // rather than error, so the HTTP layer can answer 401 and the client can
  // rejoin.
  assert.equal(store.verify('ABC123', 'dm-001', 'anything'), false);
  assert.equal(store.has('ABC123', 'dm-001'), false);
});

test('reissuing replaces the previous credential', () => {
  const store = new ParticipantCredentialStore();
  const original = store.issue('ABC123', 'dm-001');
  const replacement = store.issue('ABC123', 'dm-001');

  assert.notEqual(original, replacement);
  // A leaked token stops working as soon as the legitimate participant rejoins.
  assert.equal(store.verify('ABC123', 'dm-001', original), false);
  assert.equal(store.verify('ABC123', 'dm-001', replacement), true);
});

test('revoking removes one participant without touching the rest of the session', () => {
  const store = new ParticipantCredentialStore();
  const dmToken = store.issue('ABC123', 'dm-001');
  const playerToken = store.issue('ABC123', 'player-001');

  store.revoke('ABC123', 'dm-001');

  assert.equal(store.verify('ABC123', 'dm-001', dmToken), false);
  assert.equal(store.verify('ABC123', 'player-001', playerToken), true);
});

test('revoking a session removes every credential in it and no others', () => {
  const store = new ParticipantCredentialStore();
  const dmToken = store.issue('ABC123', 'dm-001');
  const playerToken = store.issue('ABC123', 'player-001');
  const otherTableToken = store.issue('XYZ789', 'dm-001');

  store.revokeSession('ABC123');

  assert.equal(store.verify('ABC123', 'dm-001', dmToken), false);
  assert.equal(store.verify('ABC123', 'player-001', playerToken), false);
  assert.equal(store.verify('XYZ789', 'dm-001', otherTableToken), true);
});

test('a participant ID cannot be split across the key separator to impersonate another', () => {
  const store = new ParticipantCredentialStore();
  const token = store.issue('ABC123', 'dm-001');

  // Participant IDs allow letters, digits, `_` and `-` but no whitespace, so no
  // pair of distinct (session, participant) values can collide into one key.
  // These would collide under a naive `-` or `_` separator.
  assert.equal(store.verify('ABC123 dm', '001', token), false);
  assert.equal(store.verify('ABC12', '3 dm-001', token), false);
});
