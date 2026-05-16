import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { getCurrentAuthUser, loginAuth } from './auth-api';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('auth-api helpers', () => {
  it('requests /me with cookie credentials and accepts unauthenticated state', async () => {
    let requestedUrl = '';
    let requestedCredentials: RequestCredentials | undefined;
    let requestedMethod = '';

    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedCredentials = init?.credentials;
      requestedMethod = init?.method ?? 'GET';

      return jsonResponse({
        data: {
          authenticated: false,
          user: null,
        },
        ok: true,
      });
    };

    const result = await getCurrentAuthUser();

    assert.deepEqual(result, {
      ok: true,
      user: null,
    });
    assert.equal(requestedUrl, 'http://localhost:2567/api/auth/me');
    assert.equal(requestedCredentials, 'include');
    assert.equal(requestedMethod, 'GET');
  });

  it('posts login credentials without storing session tokens in browser storage', async () => {
    const storedKeys: string[] = [];
    const originalLocalStorage = globalThis.localStorage;

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem: (key: string) => {
          storedKeys.push(key);
        },
      },
    });

    try {
      globalThis.fetch = async (_input, init) => {
        const headers = init?.headers as Record<string, string> | undefined;

        assert.equal(init?.credentials, 'include');
        assert.equal(init?.method, 'POST');
        assert.equal(headers?.['content-type'], 'application/json');
        assert.deepEqual(JSON.parse(String(init?.body)), {
          email: 'user@example.com',
          password: 'correct horse battery staple',
        });

        return jsonResponse({
          data: {
            user: {
              createdAt: new Date(0).toISOString(),
              displayName: 'User',
              email: 'user@example.com',
              id: 'usr_test',
              updatedAt: new Date(0).toISOString(),
            },
          },
          ok: true,
        });
      };

      const result = await loginAuth({
        email: 'user@example.com',
        password: 'correct horse battery staple',
      });

      assert.equal(result.ok, true);
      assert.deepEqual(storedKeys, []);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  });
});

function jsonResponse(body: unknown): Response {
  return {
    json: async () => body,
    status: 200,
  } as Response;
}
