import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemorySeatOwnershipStorage,
  SeatOwnershipError,
  SessionSeatOwnership,
} from './session-seat-ownership.js';

const sessionId = 'ABC123';
const otherSession = 'ZZZ999';

function createOwnership() {
  let tick = 0;

  return new SessionSeatOwnership(
    new InMemorySeatOwnershipStorage(),
    () => `2026-07-31T12:00:0${tick++}.000Z`,
  );
}

test('an unbound seat is available to any authenticated account', () => {
  const ownership = createOwnership();

  assert.equal(
    ownership.isAvailableTo(sessionId, 'player-001', 'user-a'),
    true,
  );
  assert.equal(ownership.getOwner(sessionId, 'player-001'), undefined);
});

test('claiming a seat binds it to the account', () => {
  const ownership = createOwnership();
  const record = ownership.claim({
    participantId: 'player-001',
    sessionId,
    userId: 'user-a',
  });

  assert.equal(record.userId, 'user-a');
  assert.equal(ownership.getOwner(sessionId, 'player-001'), 'user-a');
});

// The M0 gap: a public participant ID plus the session code was enough to take
// an occupied seat and be issued a valid credential for it.
test('another authenticated account cannot reclaim an occupied seat', () => {
  const ownership = createOwnership();
  ownership.claim({
    participantId: 'player-001',
    sessionId,
    userId: 'user-a',
  });

  assert.equal(
    ownership.isAvailableTo(sessionId, 'player-001', 'user-b'),
    false,
  );
  assert.throws(
    () =>
      ownership.claim({
        participantId: 'player-001',
        sessionId,
        userId: 'user-b',
      }),
    SeatOwnershipError,
  );
  assert.throws(
    () => ownership.assertAvailableTo(sessionId, 'player-001', 'user-b'),
    SeatOwnershipError,
  );
  // The original binding survives the attempt.
  assert.equal(ownership.getOwner(sessionId, 'player-001'), 'user-a');
});

test('an anonymous caller cannot take a bound seat', () => {
  const ownership = createOwnership();
  ownership.claim({
    participantId: 'player-001',
    sessionId,
    userId: 'user-a',
  });

  assert.equal(
    ownership.isAvailableTo(sessionId, 'player-001', undefined),
    false,
  );
  assert.throws(
    () => ownership.assertAvailableTo(sessionId, 'player-001', undefined),
    SeatOwnershipError,
  );
});

// A restart re-issues the credential but must not cost the player their seat,
// so re-claiming as the owner has to be idempotent rather than a conflict.
test('the owning account can reclaim its own seat repeatedly', () => {
  const ownership = createOwnership();
  const first = ownership.claim({
    participantId: 'player-001',
    sessionId,
    userId: 'user-a',
  });
  const second = ownership.claim({
    participantId: 'player-001',
    sessionId,
    userId: 'user-a',
  });

  assert.equal(second.userId, 'user-a');
  assert.equal(second.boundAt, first.boundAt, 'binding is not re-stamped');
  assert.doesNotThrow(() =>
    ownership.assertAvailableTo(sessionId, 'player-001', 'user-a'),
  );
});

test('the GM seat binds like any other seat', () => {
  const ownership = createOwnership();
  ownership.claim({ participantId: 'dm-001', sessionId, userId: 'gm-user' });

  assert.throws(
    () => ownership.assertAvailableTo(sessionId, 'dm-001', 'player-user'),
    SeatOwnershipError,
  );
  assert.doesNotThrow(() =>
    ownership.assertAvailableTo(sessionId, 'dm-001', 'gm-user'),
  );
});

test('seats are scoped per session', () => {
  const ownership = createOwnership();
  ownership.claim({
    participantId: 'player-001',
    sessionId,
    userId: 'user-a',
  });

  // The same seat name in a different table is a different seat.
  assert.equal(
    ownership.isAvailableTo(otherSession, 'player-001', 'user-b'),
    true,
  );
  assert.equal(ownership.getOwner(otherSession, 'player-001'), undefined);
});

test('forgetting a session releases only its seats', () => {
  const ownership = createOwnership();
  ownership.claim({
    participantId: 'player-001',
    sessionId,
    userId: 'user-a',
  });
  ownership.claim({
    participantId: 'player-001',
    sessionId: otherSession,
    userId: 'user-b',
  });

  ownership.forgetSession(sessionId);

  assert.equal(ownership.getOwner(sessionId, 'player-001'), undefined);
  assert.equal(ownership.getOwner(otherSession, 'player-001'), 'user-b');
});

test('stored records are copies, not live references', () => {
  const storage = new InMemorySeatOwnershipStorage();
  const ownership = new SessionSeatOwnership(storage);
  const record = ownership.claim({
    participantId: 'player-001',
    sessionId,
    userId: 'user-a',
  });

  record.userId = 'user-b';

  assert.equal(ownership.getOwner(sessionId, 'player-001'), 'user-a');
});
