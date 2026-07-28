/**
 * End-to-end coverage for the `/api/auth/*` brute-force gates.
 *
 * These drive the real `handleRequest` route so that the denial path is proven
 * where it actually has to work — status code, `Retry-After`, and error body —
 * rather than only at the limiter unit level.
 */
import assert from 'node:assert/strict';
import type { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';

import type {
  AuthSessionInsert,
  AuthSessionRow,
  AuthSessionWithUser,
  AuthUserDatabase,
  AuthUserInsert,
  AuthUserRow,
} from '@dnd/db';

import { AuthService } from './auth-store.js';
import {
  InMemoryCommandIdempotencyStore,
  type CommandIdempotencyStore,
} from './command-idempotency-store.js';
import { InMemoryGameRuntime } from './game-runtime.js';
import {
  createAuthThrottle,
  handleRequest,
  type AuthThrottle,
} from './session-server.js';

type AuthErrorBody = {
  error: { code: string; message: string };
  ok: false;
};

const PASSWORD = 'correct horse battery staple';

test('login returns 429 with Retry-After once the attempt budget is spent', async () => {
  const context = createContext();

  await register(context, 'target@example.com');

  // Five wrong passwords are the budget. Each must be answered on credentials,
  // not throttled, or the limiter is too aggressive to be usable.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rejected = await login(context, 'target@example.com', 'wrong', {
      ip: '203.0.113.5',
    });

    assert.equal(rejected.status, 400, `attempt ${attempt + 1} status`);
    assert.equal(rejected.body.error.code, 'invalid_credentials');
  }

  const throttled = await login(context, 'target@example.com', 'wrong', {
    ip: '203.0.113.5',
  });

  assert.equal(throttled.status, 429);
  assert.equal(throttled.body.error.code, 'too_many_requests');
  assert.equal(throttled.headers.get('retry-after'), String(15 * 60));
});

test('a throttled login is refused even when the password is correct', async () => {
  const context = createContext();

  await register(context, 'target@example.com');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await login(context, 'target@example.com', 'wrong', { ip: '203.0.113.5' });
  }

  // This is the property that makes the limiter a real gate rather than a
  // counter: once blocked, the request is rejected before any password work
  // happens, so a guessed-correct password on attempt six still gets nothing.
  const blocked = await login(context, 'target@example.com', PASSWORD, {
    ip: '203.0.113.5',
  });

  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'too_many_requests');
});

test('the throttle is server-side and ignores client-supplied forwarding headers', async () => {
  const context = createContext();

  await register(context, 'target@example.com');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await login(context, 'target@example.com', 'wrong', { ip: '203.0.113.5' });
  }

  // `x-forwarded-for` is attacker-controlled unless a trusted proxy is
  // declared. Rotating it must not mint a fresh bucket, or the whole per-IP
  // limit is bypassable from a single host.
  const spoofed = await login(context, 'target@example.com', 'wrong', {
    forwardedFor: '198.51.100.42',
    ip: '203.0.113.5',
  });

  assert.equal(spoofed.status, 429);
  assert.equal(spoofed.body.error.code, 'too_many_requests');
});

test('a blocked address does not block a different address for the same account', async () => {
  const context = createContext();

  await register(context, 'victim@example.com');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await login(context, 'victim@example.com', 'wrong', { ip: '198.51.100.9' });
  }

  assert.equal(
    (
      await login(context, 'victim@example.com', 'wrong', {
        ip: '198.51.100.9',
      })
    ).status,
    429,
  );

  // The victim, on their own connection, can still authenticate. This is the
  // lockout-DoS that a global per-email counter would have created.
  const victim = await login(context, 'victim@example.com', PASSWORD, {
    ip: '203.0.113.77',
  });

  assert.equal(victim.status, 200);
});

test('a successful login clears the failure budget for that address', async () => {
  const context = createContext();

  await register(context, 'user@example.com');

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await login(context, 'user@example.com', 'wrong', { ip: '203.0.113.5' });
  }

  assert.equal(
    (await login(context, 'user@example.com', PASSWORD, { ip: '203.0.113.5' }))
      .status,
    200,
  );

  // Without the reset, two more failures would trip the block.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(
      (await login(context, 'user@example.com', 'wrong', { ip: '203.0.113.5' }))
        .status,
      400,
      'the budget should have been reset by the successful login',
    );
  }
});

test('registration is throttled per address', async () => {
  const context = createContext();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const created = await register(context, `signup${attempt}@example.com`, {
      ip: '203.0.113.5',
    });

    assert.equal(created.status, 200, `signup ${attempt + 1} status`);
  }

  const throttled = await register(context, 'signup5@example.com', {
    ip: '203.0.113.5',
  });

  assert.equal(throttled.status, 429);
  assert.equal(throttled.body.error.code, 'too_many_requests');
  assert.equal(throttled.headers.get('retry-after'), String(60 * 60));

  // A different address is unaffected by that budget.
  assert.equal(
    (await register(context, 'elsewhere@example.com', { ip: '198.51.100.1' }))
      .status,
    200,
  );
});

test('the throttle response never reveals whether the account exists', async () => {
  const context = createContext();

  await register(context, 'real@example.com');

  const burn = async (email: string, ip: string) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login(context, email, 'wrong', { ip });
    }

    return login(context, email, 'wrong', { ip });
  };

  const known = await burn('real@example.com', '203.0.113.5');
  const unknown = await burn('ghost@example.com', '203.0.113.6');

  assert.equal(known.status, unknown.status);
  assert.deepEqual(known.body.error, unknown.body.error);
});

test('login rejects unknown and known accounts with an identical error', async () => {
  const context = createContext();

  await register(context, 'real@example.com');

  const known = await login(context, 'real@example.com', 'wrong', {
    ip: '203.0.113.5',
  });
  const unknown = await login(context, 'ghost@example.com', 'wrong', {
    ip: '203.0.113.6',
  });

  assert.equal(known.status, 400);
  assert.equal(unknown.status, 400);
  assert.deepEqual(known.body.error, unknown.body.error);
});

test('logout is deliberately left unthrottled', async () => {
  const context = createContext();

  // Logout revokes a token the caller already holds and costs one indexed
  // update, so it is neither a guessing surface nor a CPU sink. Repeated calls
  // must keep working.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await send(
      context,
      '/api/auth/logout',
      {},
      {
        ip: '203.0.113.5',
      },
    );

    assert.equal(result.status, 200);
  }
});

type TestContext = {
  auth: AuthService;
  authThrottle: AuthThrottle;
  idempotency: CommandIdempotencyStore;
  runtime: InMemoryGameRuntime;
};

function createContext(): TestContext {
  return {
    auth: new AuthService(new MemoryAuthUserDatabase()),
    authThrottle: createAuthThrottle(),
    idempotency: new InMemoryCommandIdempotencyStore(),
    runtime: new InMemoryGameRuntime(),
  };
}

async function register(
  context: TestContext,
  email: string,
  options: { ip?: string } = {},
) {
  return send(
    context,
    '/api/auth/register',
    { displayName: 'Test User', email, password: PASSWORD },
    options,
  );
}

async function login(
  context: TestContext,
  email: string,
  password: string,
  options: { forwardedFor?: string; ip?: string } = {},
) {
  return send(context, '/api/auth/login', { email, password }, options);
}

async function send(
  context: TestContext,
  path: string,
  body: unknown,
  options: { forwardedFor?: string; ip?: string } = {},
) {
  const request = Readable.from([JSON.stringify(body)]) as Readable & {
    headers: IncomingHttpHeaders;
    method?: string;
    socket?: { remoteAddress?: string };
    url?: string;
  };
  const response = createMockResponse();

  request.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1',
    ...(options.forwardedFor
      ? { 'x-forwarded-for': options.forwardedFor }
      : {}),
  };
  request.method = 'POST';
  request.url = path;
  request.socket = { remoteAddress: options.ip ?? '203.0.113.1' };

  await handleRequest(
    request as never,
    response as never,
    context.runtime as never,
    context.idempotency,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    context.auth,
    undefined,
    context.authThrottle,
  );

  return {
    body: JSON.parse(response.body) as AuthErrorBody,
    headers: response.headers,
    status: response.statusCode,
  };
}

function createMockResponse() {
  return {
    body: '',
    headers: new Map<string, string>(),
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    end(chunk?: unknown) {
      if (chunk != null) {
        this.body += String(chunk);
      }

      this.writableEnded = true;
      return this;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      this.headers.set(name.toLowerCase(), String(value));
      return this;
    },
    write(chunk: unknown) {
      this.body += String(chunk);
      return true;
    },
    writeHead(
      statusCode: number,
      headers?: Record<string, string | number | readonly string[]>,
    ) {
      this.statusCode = statusCode;
      this.headersSent = true;

      if (headers) {
        for (const [name, value] of Object.entries(headers)) {
          this.setHeader(name, value);
        }
      }

      return this;
    },
  };
}

class MemoryAuthUserDatabase implements AuthUserDatabase {
  readonly sessions = new Map<string, AuthSessionRow>();
  readonly users = new Map<string, AuthUserRow>();

  async createAuthUser(insert: AuthUserInsert): Promise<AuthUserRow | null> {
    if (this.users.has(insert.email)) {
      return null;
    }

    const row: AuthUserRow = {
      createdAt: new Date(0),
      displayName: insert.displayName,
      email: insert.email,
      ownerParticipantId: insert.ownerParticipantId,
      passwordHash: insert.passwordHash,
      updatedAt: new Date(0),
      userId: insert.userId,
    };
    this.users.set(row.email, structuredClone(row));

    return structuredClone(row);
  }

  async getAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
    return structuredClone(this.users.get(email) ?? null);
  }

  async createAuthSession(insert: AuthSessionInsert): Promise<AuthSessionRow> {
    const row: AuthSessionRow = {
      createdAt: new Date(0),
      expiresAt: insert.expiresAt,
      revoked: false,
      revokedAt: null,
      sessionId: insert.sessionId,
      tokenHash: insert.tokenHash,
      updatedAt: new Date(0),
      userId: insert.userId,
    };
    this.sessions.set(row.tokenHash, structuredClone(row));

    return structuredClone(row);
  }

  async getAuthUserBySessionTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionWithUser | null> {
    const session = this.sessions.get(tokenHash);

    if (
      !session ||
      session.revoked ||
      session.revokedAt ||
      session.expiresAt <= now
    ) {
      return null;
    }

    const user = [...this.users.values()].find(
      (candidate) => candidate.userId === session.userId,
    );

    return user
      ? { session: structuredClone(session), user: structuredClone(user) }
      : null;
  }

  async revokeAuthSession(tokenHash: string): Promise<void> {
    const session = this.sessions.get(tokenHash);

    if (!session) {
      return;
    }

    this.sessions.set(tokenHash, {
      ...session,
      revoked: true,
      revokedAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
