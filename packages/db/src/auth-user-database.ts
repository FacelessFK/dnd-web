import { and, eq, gt, isNull } from 'drizzle-orm';

import {
  authSessions,
  authUsers,
  type AuthSessionRow,
  type AuthUserRow,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type AuthDatabaseClient = DndDatabase | DndTransaction;

export type AuthUserInsert = {
  displayName: string;
  email: string;
  ownerParticipantId: string;
  passwordHash: string;
  userId: string;
};

export type AuthSessionInsert = {
  expiresAt: Date;
  sessionId: string;
  tokenHash: string;
  userId: string;
};

export type AuthSessionWithUser = {
  session: AuthSessionRow;
  user: AuthUserRow;
};

export interface AuthUserDatabase {
  createAuthSession(insert: AuthSessionInsert): Promise<AuthSessionRow>;
  createAuthUser(insert: AuthUserInsert): Promise<AuthUserRow | null>;
  getAuthUserByEmail(email: string): Promise<AuthUserRow | null>;
  getAuthUserBySessionTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionWithUser | null>;
  revokeAuthSession(tokenHash: string): Promise<void>;
}

export class DrizzleAuthUserDatabase implements AuthUserDatabase {
  constructor(private readonly db: AuthDatabaseClient) {}

  async createAuthUser(insert: AuthUserInsert): Promise<AuthUserRow | null> {
    const [row] = await this.db
      .insert(authUsers)
      .values(insert)
      .onConflictDoNothing()
      .returning();

    return row ?? null;
  }

  async getAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
    const [row] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1);

    return row ?? null;
  }

  async createAuthSession(insert: AuthSessionInsert): Promise<AuthSessionRow> {
    const [row] = await this.db.insert(authSessions).values(insert).returning();

    if (!row) {
      throw new Error('Auth session write did not return a row.');
    }

    return row;
  }

  async getAuthUserBySessionTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionWithUser | null> {
    const [row] = await this.db
      .select({
        session: authSessions,
        user: authUsers,
      })
      .from(authSessions)
      .innerJoin(authUsers, eq(authSessions.userId, authUsers.userId))
      .where(
        and(
          eq(authSessions.tokenHash, tokenHash),
          eq(authSessions.revoked, false),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, now),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async revokeAuthSession(tokenHash: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({
        revoked: true,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(authSessions.tokenHash, tokenHash));
  }
}
