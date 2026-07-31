/**
 * End-to-end coverage for account-to-seat binding.
 *
 * M0 left this hole open deliberately and recorded it: participant IDs are
 * public - the session snapshot broadcasts every one of them - so an
 * authenticated account holding only the six-character session code could
 * `reconnect_session` as `player-001` and be handed a valid credential for a
 * seat someone else was in. `claimPlayerSeat` even fell back to reconnect on
 * `duplicate_join`, which rotated the credential and locked the original player
 * out.
 *
 * These drive the real `handleRequest` route, because the gate has to hold
 * where the HTTP status and error body are produced, not only in the unit.
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
import { InMemoryCommandIdempotencyStore } from './command-idempotency-store.js';
import { InMemoryGameRuntime } from './game-runtime.js';
import { SessionSeatOwnership } from './session-seat-ownership.js';
import { createAuthThrottle, handleRequest } from './session-server.js';

const PASSWORD = 'correct horse battery staple';

type Context = {
  auth: AuthService;
  authThrottle: ReturnType<typeof createAuthThrottle>;
  idempotency: InMemoryCommandIdempotencyStore;
  runtime: InMemoryGameRuntime;
  seatOwnership: SessionSeatOwnership;
};

function createContext(): Context {
  return {
    auth: new AuthService(new MemoryAuthUserDatabase()),
    authThrottle: createAuthThrottle(),
    idempotency: new InMemoryCommandIdempotencyStore(),
    runtime: new InMemoryGameRuntime(),
    seatOwnership: new SessionSeatOwnership(),
  };
}

let commandCounter = 0;
const nextCommandId = (scope: string) =>
  `test-${scope}-${(commandCounter += 1)}`;

async function send(
  context: Context,
  path: string,
  body: unknown,
  options: { cookie?: string; participantToken?: string } = {},
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
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.participantToken
      ? { 'x-dnd-participant-token': options.participantToken }
      : {}),
  };
  request.method = 'POST';
  request.url = path;
  request.socket = { remoteAddress: '203.0.113.1' };

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
    undefined,
    context.seatOwnership,
  );

  return {
    body: JSON.parse(response.body || '{}') as {
      data?: {
        participantId: string;
        participantToken: string;
        sessionId: string;
      };
      error?: { code: string; message: string };
      ok?: boolean;
    },
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    status: response.statusCode,
  };
}

async function registerAccount(context: Context, email: string) {
  const created = await send(context, '/api/auth/register', {
    displayName: email,
    email,
    password: PASSWORD,
  });

  assert.equal(created.status, 200, `register ${email}`);
  assert.ok(created.cookie, 'register should set an auth cookie');

  return created.cookie!;
}

async function createSession(context: Context, cookie: string) {
  const created = await send(
    context,
    '/api/session/command',
    {
      actor: {
        displayName: 'Dungeon Master',
        participantId: 'dm-001',
        role: 'dm',
      },
      commandId: nextCommandId('create'),
      payload: { rulesProfileId: 'dnd5e-2024-core' },
      type: 'create_session',
    },
    { cookie },
  );

  assert.equal(created.status, 200, 'create_session');

  return created;
}

async function joinAs(
  context: Context,
  sessionId: string,
  participantId: string,
  cookie: string,
) {
  return send(
    context,
    '/api/session/command',
    {
      actor: { displayName: 'Player', participantId, role: 'player' },
      commandId: nextCommandId('join'),
      payload: { sessionId },
      type: 'join_session',
    },
    { cookie },
  );
}

async function reconnectAs(
  context: Context,
  sessionId: string,
  participantId: string,
  options: { cookie?: string; participantToken?: string },
) {
  return send(
    context,
    '/api/session/command',
    {
      actor: { participantId },
      commandId: nextCommandId('reconnect'),
      payload: { participantId, sessionId },
      type: 'reconnect_session',
    },
    options,
  );
}

async function seatTable() {
  const context = createContext();
  const gmCookie = await registerAccount(context, 'gm@example.test');
  const playerCookie = await registerAccount(context, 'player@example.test');
  const intruderCookie = await registerAccount(
    context,
    'intruder@example.test',
  );

  const created = await createSession(context, gmCookie);
  const sessionId = created.body.data!.sessionId;

  const joined = await joinAs(context, sessionId, 'player-001', playerCookie);
  assert.equal(joined.status, 200, 'legitimate player join');

  return {
    context,
    gmCookie,
    intruderCookie,
    playerCookie,
    playerToken: joined.body.data!.participantToken,
    sessionId,
  };
}

test('a second account cannot reconnect into an occupied player seat', async () => {
  const table = await seatTable();

  const stolen = await reconnectAs(
    table.context,
    table.sessionId,
    'player-001',
    { cookie: table.intruderCookie, participantToken: table.playerToken },
  );

  assert.equal(stolen.status, 403);
  assert.equal(stolen.body.error?.code, 'seat_owned_by_another_account');
  // The message must not name the owning account.
  assert.equal(
    /player@example\.test/.test(stolen.body.error?.message ?? ''),
    false,
  );
});

// The old fallback: `join_session` on a taken seat degraded into a reconnect,
// which rotated the credential and evicted whoever was sitting there.
test('a second account cannot join an occupied player seat', async () => {
  const table = await seatTable();

  const stolen = await joinAs(
    table.context,
    table.sessionId,
    'player-001',
    table.intruderCookie,
  );

  assert.equal(stolen.status, 403);
  assert.equal(stolen.body.error?.code, 'seat_owned_by_another_account');
});

test('the legitimate account keeps working after a failed takeover', async () => {
  const table = await seatTable();

  await joinAs(
    table.context,
    table.sessionId,
    'player-001',
    table.intruderCookie,
  );

  const recovered = await reconnectAs(
    table.context,
    table.sessionId,
    'player-001',
    { cookie: table.playerCookie, participantToken: table.playerToken },
  );

  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.data?.participantId, 'player-001');
});

// Two independent gates cover the GM seat, and the credential gate is the one
// that fires first: an intruder has no `dm-001` token to present, so the
// request dies at 401 before ownership is consulted. The binding is still
// recorded, and is what would stop a caller that somehow held a credential.
test('the GM seat is bound to the GM account and cannot be reconnected into', async () => {
  const table = await seatTable();

  const stolen = await reconnectAs(table.context, table.sessionId, 'dm-001', {
    cookie: table.intruderCookie,
  });

  assert.equal(stolen.status, 401);
  assert.equal(stolen.body.error?.code, 'unauthenticated');
  assert.equal(
    table.context.seatOwnership.getOwner(table.sessionId, 'dm-001') !==
      undefined,
    true,
    'the GM seat is bound even though the credential gate answered first',
  );
  assert.equal(
    table.context.seatOwnership.isAvailableTo(
      table.sessionId,
      'dm-001',
      'someone-else',
    ),
    false,
  );
});

test('an anonymous caller cannot take a bound seat', async () => {
  const table = await seatTable();

  const stolen = await reconnectAs(
    table.context,
    table.sessionId,
    'player-001',
    { participantToken: table.playerToken },
  );

  assert.equal(stolen.status, 403);
  assert.equal(stolen.body.error?.code, 'seat_owned_by_another_account');
});

// A restart drops the in-process credential store but must not drop the seat.
// The legitimate account re-authenticates and is issued a fresh credential for
// the same seat; the old credential is gone either way.
test('the owning account recovers its seat with a fresh credential', async () => {
  const table = await seatTable();

  const recovered = await reconnectAs(
    table.context,
    table.sessionId,
    'player-001',
    { cookie: table.playerCookie, participantToken: table.playerToken },
  );

  assert.equal(recovered.status, 200);
  assert.equal(
    table.context.seatOwnership.getOwner(table.sessionId, 'player-001') !==
      undefined,
    true,
    'the binding survives independently of the credential',
  );
});

test('an unbound seat in the same session is still open', async () => {
  const table = await seatTable();

  const joined = await joinAs(
    table.context,
    table.sessionId,
    'player-002',
    table.intruderCookie,
  );

  assert.equal(joined.status, 200, 'a free seat stays free');
});

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
          this.headers.set(name.toLowerCase(), String(value));
        }
      }

      return this;
    },
  };
}
