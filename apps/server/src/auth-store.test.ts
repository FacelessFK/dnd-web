import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AuthSessionInsert,
  AuthSessionRow,
  AuthSessionWithUser,
  AuthUserDatabase,
  AuthUserInsert,
  AuthUserRow,
} from '@dnd/db';

import { AuthService, AuthStoreError } from './auth-store.js';

test('auth service hashes passwords and stores only hashed session tokens', async () => {
  const database = new MemoryAuthUserDatabase();
  const auth = new AuthService(database);
  const issued = await auth.register({
    displayName: 'Test User',
    email: 'TEST@example.com',
    password: 'correct horse battery staple',
  });
  const storedUser = await database.getAuthUserByEmail('test@example.com');
  const [storedSession] = [...database.sessions.values()];

  assert(storedUser);
  assert(storedSession);
  assert.equal(storedUser.email, 'test@example.com');
  assert.notEqual(storedUser.passwordHash, 'correct horse battery staple');
  assert.match(storedUser.passwordHash, /^scrypt:/);
  assert.notEqual(storedSession.tokenHash, issued.token);
  assert.equal(storedSession.tokenHash.length, 64);
  assert.deepEqual(await auth.getUserByToken(issued.token), issued.user);
});

test('auth service rejects invalid passwords and revokes sessions on logout', async () => {
  const database = new MemoryAuthUserDatabase();
  const auth = new AuthService(database);
  const issued = await auth.register({
    displayName: 'Test User',
    email: 'user@example.com',
    password: 'correct horse battery staple',
  });

  await assert.rejects(
    () =>
      auth.login({
        email: 'user@example.com',
        password: 'wrong password',
      }),
    (error) =>
      error instanceof AuthStoreError && error.code === 'invalid_credentials',
  );

  await auth.logout(issued.token);

  assert.equal(await auth.getUserByToken(issued.token), null);
  assert.equal([...database.sessions.values()][0]?.revoked, true);
  assert([...database.sessions.values()][0]?.revokedAt);
});

test('auth service rejects expired sessions', async () => {
  const database = new MemoryAuthUserDatabase();
  const auth = new AuthService(database);
  const issued = await auth.register({
    displayName: 'Test User',
    email: 'expired@example.com',
    password: 'correct horse battery staple',
  });
  const [tokenHash] = [...database.sessions.keys()];

  assert(tokenHash);
  const session = database.sessions.get(tokenHash);

  assert(session);
  database.sessions.set(tokenHash, {
    ...session,
    expiresAt: new Date(0),
  });

  assert.equal(await auth.getUserByToken(issued.token), null);
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
      ? {
          session: structuredClone(session),
          user: structuredClone(user),
        }
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
