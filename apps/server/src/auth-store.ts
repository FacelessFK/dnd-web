import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

import type { AuthUserDatabase, AuthUserRow } from '@dnd/db';
import type { AuthUser, RuntimeErrorCode } from '@dnd/protocol';

const scryptAsync = promisify(scrypt);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_KEY_LENGTH = 64;

export class AuthStoreError extends Error {
  constructor(
    readonly code: RuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthStoreError';
  }
}

export type AuthSessionIssue = {
  expiresAt: Date;
  token: string;
  user: AuthUser;
};

export class AuthService {
  constructor(private readonly database: AuthUserDatabase) {}

  async register(params: {
    displayName: string;
    email: string;
    password: string;
  }): Promise<AuthSessionIssue> {
    const email = this.normalizeEmail(params.email);
    const existing = await this.database.getAuthUserByEmail(email);

    if (existing) {
      throw new AuthStoreError(
        'email_already_registered',
        'An account already exists for this email address.',
      );
    }

    const user = await this.database.createAuthUser({
      displayName: params.displayName.trim(),
      email,
      ownerParticipantId: `user_${randomUUID()}`,
      passwordHash: await this.hashPassword(params.password),
      userId: `usr_${randomUUID()}`,
    });

    if (!user) {
      throw new AuthStoreError(
        'email_already_registered',
        'An account already exists for this email address.',
      );
    }

    return this.issueSession(user);
  }

  async login(params: {
    email: string;
    password: string;
  }): Promise<AuthSessionIssue> {
    const user = await this.database.getAuthUserByEmail(
      this.normalizeEmail(params.email),
    );

    if (
      !user ||
      !(await this.verifyPassword(params.password, user.passwordHash))
    ) {
      throw new AuthStoreError(
        'invalid_credentials',
        'Email or password is incorrect.',
      );
    }

    return this.issueSession(user);
  }

  async getUserByToken(token: string | null): Promise<AuthUser | null> {
    if (!token) {
      return null;
    }

    const row = await this.database.getAuthUserBySessionTokenHash(
      this.hashToken(token),
      new Date(),
    );

    return row ? this.toAuthUser(row.user) : null;
  }

  async requireUserByToken(token: string | null): Promise<AuthUser> {
    const user = await this.getUserByToken(token);

    if (!user) {
      throw new AuthStoreError(
        'unauthenticated',
        'You must be logged in to use this endpoint.',
      );
    }

    return user;
  }

  async logout(token: string | null): Promise<void> {
    if (!token) {
      return;
    }

    await this.database.revokeAuthSession(this.hashToken(token));
  }

  private async issueSession(user: AuthUserRow): Promise<AuthSessionIssue> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.database.createAuthSession({
      expiresAt,
      sessionId: `authsess_${randomUUID()}`,
      tokenHash: this.hashToken(token),
      userId: user.userId,
    });

    return {
      expiresAt,
      token,
      user: this.toAuthUser(user),
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const key = (await scryptAsync(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
    )) as Buffer;

    return `scrypt:${salt}:${key.toString('hex')}`;
  }

  private async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<boolean> {
    const [, salt, hash] = storedHash.split(':');

    if (!salt || !hash) {
      return false;
    }

    const expected = Buffer.from(hash, 'hex');
    const actual = (await scryptAsync(
      password,
      salt,
      expected.length,
    )) as Buffer;

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toAuthUser(row: AuthUserRow): AuthUser {
    return {
      createdAt: row.createdAt.toISOString(),
      displayName: row.displayName,
      email: row.email,
      id: row.userId,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
