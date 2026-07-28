import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AuthRateLimiter,
  PasswordHashConcurrencyGate,
} from './auth-rate-limiter.js';

/** Drives the limiter's injectable clock so tests never sleep. */
function createClock(startMs = 1_700_000_000_000) {
  let current = startMs;

  return {
    advanceMs(delta: number) {
      current += delta;
    },
    now: () => current,
  };
}

test('login limiter blocks a key after repeated failures and reports retry-after', () => {
  const clock = createClock();
  const limiter = new AuthRateLimiter({ now: clock.now });
  const key = { email: 'victim@example.com', ip: '203.0.113.5' };

  // Five failures are the documented budget, so all five must be allowed to run.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(
      limiter.checkLogin(key).allowed,
      true,
      `attempt ${attempt + 1} should still be allowed`,
    );
    limiter.recordLoginFailure(key);
  }

  const denied = limiter.checkLogin(key);

  assert.equal(denied.allowed, false);
  assert(!denied.allowed);
  assert.equal(denied.scope, 'ip+email');
  assert.equal(denied.retryAfterSeconds, 15 * 60);
});

test('a blocked key recovers once the block expires', () => {
  const clock = createClock();
  const limiter = new AuthRateLimiter({ now: clock.now });
  const key = { email: 'user@example.com', ip: '203.0.113.5' };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    limiter.recordLoginFailure(key);
  }

  assert.equal(limiter.checkLogin(key).allowed, false);

  clock.advanceMs(15 * 60_000 + 1);

  assert.equal(limiter.checkLogin(key).allowed, true);
});

test('hammering a blocked key does not extend its block', () => {
  const clock = createClock();
  const limiter = new AuthRateLimiter({ now: clock.now });
  const key = { email: 'user@example.com', ip: '203.0.113.5' };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    limiter.recordLoginFailure(key);
  }

  // The handler rejects denied attempts without recording them. Simulate ten
  // minutes of a client polling a blocked key, then confirm the original block
  // still expires on its original schedule rather than being pushed forward.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    clock.advanceMs(12_000);
    assert.equal(limiter.checkLogin(key).allowed, false);
  }

  clock.advanceMs(5 * 60_000 + 1);

  assert.equal(limiter.checkLogin(key).allowed, true);
});

test('one address cannot lock a victim out of their own account from elsewhere', () => {
  const clock = createClock();
  const limiter = new AuthRateLimiter({ now: clock.now });
  const email = 'victim@example.com';

  // An attacker burns the whole per-pair budget from their own address.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    limiter.recordLoginFailure({ email, ip: '198.51.100.9' });
  }

  assert.equal(
    limiter.checkLogin({ email, ip: '198.51.100.9' }).allowed,
    false,
    'the attacking address should be blocked',
  );

  // This is the property the ip+email key exists for: the real user, on their
  // own connection, is untouched. A global per-email counter would have locked
  // them out here.
  assert.equal(
    limiter.checkLogin({ email, ip: '203.0.113.77' }).allowed,
    true,
    'the victim on a different address must still be able to log in',
  );
});

test('per-ip bucket catches spraying across many different accounts', () => {
  const clock = createClock();
  const limiter = new AuthRateLimiter({ now: clock.now });
  const ip = '198.51.100.9';

  // Each account sees only three failures, well under the per-pair budget of
  // five, so the tight bucket never trips. The per-IP bucket is what stops it.
  for (let account = 0; account < 10; account += 1) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      limiter.recordLoginFailure({ email: `user${account}@example.com`, ip });
    }
  }

  const denied = limiter.checkLogin({ email: 'user99@example.com', ip });

  assert.equal(denied.allowed, false);
  assert(!denied.allowed);
  assert.equal(denied.scope, 'ip');
});

test('a successful login clears the tight bucket but not the per-ip bucket', () => {
  const clock = createClock();
  const limiter = new AuthRateLimiter({ now: clock.now });
  const ip = '203.0.113.5';
  const key = { email: 'user@example.com', ip };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    limiter.recordLoginFailure(key);
  }

  limiter.recordLoginSuccess(key);

  // Four more failures would have tripped the block without the reset.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(limiter.checkLogin(key).allowed, true);
    limiter.recordLoginFailure(key);
  }

  // Spraying evidence from the same host survives one user's success.
  for (let account = 0; account < 30; account += 1) {
    limiter.recordLoginFailure({ email: `other${account}@example.com`, ip });
  }

  assert.equal(
    limiter.checkLogin({ email: 'fresh@example.com', ip }).allowed,
    false,
  );
});

test('login keys are normalized so casing and padding cannot reset the count', () => {
  const clock = createClock();
  const limiter = new AuthRateLimiter({ now: clock.now });
  const ip = '203.0.113.5';

  limiter.recordLoginFailure({ email: 'User@Example.com', ip });
  limiter.recordLoginFailure({ email: '  user@example.com  ', ip });
  limiter.recordLoginFailure({ email: 'USER@EXAMPLE.COM', ip });
  limiter.recordLoginFailure({ email: 'user@example.com', ip });
  limiter.recordLoginFailure({ email: 'uSeR@eXaMpLe.CoM', ip });

  assert.equal(
    limiter.checkLogin({ email: 'user@example.com', ip }).allowed,
    false,
  );
});

test('registration throttles every attempt per address, not just failures', () => {
  const clock = createClock();
  const limiter = new AuthRateLimiter({ now: clock.now });
  const key = { ip: '203.0.113.5' };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(limiter.checkRegister(key).allowed, true);
    limiter.recordRegisterAttempt(key);
  }

  const denied = limiter.checkRegister(key);

  assert.equal(denied.allowed, false);
  assert(!denied.allowed);
  assert.equal(denied.retryAfterSeconds, 60 * 60);

  // A different address is unaffected.
  assert.equal(limiter.checkRegister({ ip: '198.51.100.1' }).allowed, true);
});

test('tracked keys stay bounded when an attacker rotates the email', () => {
  const clock = createClock();
  const limiter = new AuthRateLimiter({ maxTrackedKeys: 100, now: clock.now });

  for (let attempt = 0; attempt < 5_000; attempt += 1) {
    limiter.recordLoginFailure({
      email: `throwaway${attempt}@example.com`,
      ip: '198.51.100.9',
    });
  }

  assert(
    limiter.trackedKeyCount <= 100,
    `expected the map to stay capped, saw ${limiter.trackedKeyCount}`,
  );

  // Eviction must not lose the per-IP bucket, which is what actually stops
  // this attack shape.
  assert.equal(
    limiter.checkLogin({ email: 'fresh@example.com', ip: '198.51.100.9' })
      .allowed,
    false,
  );
});

test('concurrency gate refuses work beyond its ceiling and recovers on release', () => {
  const gate = new PasswordHashConcurrencyGate(3);

  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.inFlightCount, 3);

  // Fourth concurrent hash is rejected rather than queued.
  assert.equal(gate.tryAcquire(), false);
  assert.equal(gate.inFlightCount, 3);

  gate.release();

  assert.equal(gate.tryAcquire(), true);
});

test('concurrency gate does not underflow when released more than acquired', () => {
  const gate = new PasswordHashConcurrencyGate(2);

  gate.release();
  gate.release();

  assert.equal(gate.inFlightCount, 0);
  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), false);
});
