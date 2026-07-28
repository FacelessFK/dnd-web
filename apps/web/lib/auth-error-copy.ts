import type { MessageKey } from './i18n';

/**
 * Localized copy for an auth failure, or `null` when the failure has no
 * dedicated translation and the caller should fall back to the server message.
 */
export type AuthErrorCopy = {
  key: MessageKey;
  values?: Record<string, string>;
} | null;

/**
 * Picks localized copy for an auth error response.
 *
 * The server answers in English by design — its messages are operator-facing
 * and shared by every command surface — so throttle responses are re-expressed
 * here in the reader's language. Errors without a dedicated translation return
 * `null` rather than a generic string, so nothing that used to be shown gets
 * swallowed.
 *
 * This is presentation only. The limit is enforced server-side; a client that
 * ignores this entirely still gets a 429.
 */
export function selectAuthErrorCopy(params: {
  code?: string;
  retryAfterSeconds?: number;
}): AuthErrorCopy {
  if (params.code !== 'too_many_requests') {
    return null;
  }

  const seconds = params.retryAfterSeconds;

  // Under a minute, or no usable header: avoid rendering "0 minutes".
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 60) {
    return { key: 'auth.error.tooManyAttemptsSoon' };
  }

  return {
    key: 'auth.error.tooManyAttempts',
    values: { minutes: String(Math.ceil(seconds / 60)) },
  };
}
