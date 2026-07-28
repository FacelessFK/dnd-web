import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAuthErrorCopy } from './auth-error-copy';

test('non-throttle errors keep falling back to the server message', () => {
  assert.equal(selectAuthErrorCopy({ code: 'invalid_credentials' }), null);
  assert.equal(selectAuthErrorCopy({ code: 'email_already_registered' }), null);
  assert.equal(selectAuthErrorCopy({}), null);
});

test('a throttled response is rendered in minutes, rounded up', () => {
  assert.deepEqual(
    selectAuthErrorCopy({
      code: 'too_many_requests',
      retryAfterSeconds: 15 * 60,
    }),
    { key: 'auth.error.tooManyAttempts', values: { minutes: '15' } },
  );

  // Rounding up keeps the advice honest: telling someone to wait 14 minutes
  // when the block clears at 14:30 sends them back to another rejection.
  assert.deepEqual(
    selectAuthErrorCopy({ code: 'too_many_requests', retryAfterSeconds: 841 }),
    { key: 'auth.error.tooManyAttempts', values: { minutes: '15' } },
  );
});

test('sub-minute and missing retry hints avoid rendering "0 minutes"', () => {
  assert.deepEqual(selectAuthErrorCopy({ code: 'too_many_requests' }), {
    key: 'auth.error.tooManyAttemptsSoon',
  });
  assert.deepEqual(
    selectAuthErrorCopy({ code: 'too_many_requests', retryAfterSeconds: 1 }),
    { key: 'auth.error.tooManyAttemptsSoon' },
  );
  assert.deepEqual(
    selectAuthErrorCopy({ code: 'too_many_requests', retryAfterSeconds: 59 }),
    { key: 'auth.error.tooManyAttemptsSoon' },
  );
  assert.deepEqual(
    selectAuthErrorCopy({
      code: 'too_many_requests',
      retryAfterSeconds: Number.NaN,
    }),
    { key: 'auth.error.tooManyAttemptsSoon' },
  );
});

test('exactly one minute is still reported in minutes', () => {
  assert.deepEqual(
    selectAuthErrorCopy({ code: 'too_many_requests', retryAfterSeconds: 60 }),
    { key: 'auth.error.tooManyAttempts', values: { minutes: '1' } },
  );
});
