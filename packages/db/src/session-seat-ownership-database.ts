/**
 * Durable account-to-seat bindings.
 *
 * This table holds no credential material of any kind. A participant token is
 * ephemeral, per-process authorization; what survives a restart is the fact
 * that an account was sitting in a chair. That split is the whole design: a
 * restart forces every client to obtain a new token, and this row is what says
 * who is entitled to one.
 */
import { and, eq } from 'drizzle-orm';

import type { ParticipantId, SessionId } from '@dnd/shared';

import {
  sessionSeatOwnership,
  type SessionSeatOwnershipRow,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type SessionSeatOwnershipDatabaseClient = DndDatabase | DndTransaction;

export type SessionSeatOwnershipWrite = {
  boundAt: Date;
  participantId: ParticipantId;
  sessionId: SessionId;
  userId: string;
};

export interface SessionSeatOwnershipDatabase {
  getSessionSeatOwnership(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): Promise<SessionSeatOwnershipRow | null>;
  listSessionSeatOwnership(): Promise<SessionSeatOwnershipRow[]>;
  listSessionSeatOwnershipBySession(
    sessionId: SessionId,
  ): Promise<SessionSeatOwnershipRow[]>;
  /**
   * Binds the seat, or re-affirms an existing binding for the same account.
   *
   * Deliberately conditional rather than a blind upsert: the `WHERE user_id =`
   * predicate means a second account writing the same key updates zero rows and
   * gets `null` back. Enforcing that in the statement rather than in a
   * read-then-write keeps two simultaneous claims from both believing they won.
   */
  claimSessionSeatOwnership(
    write: SessionSeatOwnershipWrite,
  ): Promise<SessionSeatOwnershipRow | null>;
  deleteSessionSeatOwnershipBySession(sessionId: SessionId): Promise<number>;
}

export class DrizzleSessionSeatOwnershipDatabase implements SessionSeatOwnershipDatabase {
  constructor(private readonly db: SessionSeatOwnershipDatabaseClient) {}

  async getSessionSeatOwnership(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): Promise<SessionSeatOwnershipRow | null> {
    const [row] = await this.db
      .select()
      .from(sessionSeatOwnership)
      .where(
        and(
          eq(sessionSeatOwnership.sessionId, sessionId),
          eq(sessionSeatOwnership.participantId, participantId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async listSessionSeatOwnership(): Promise<SessionSeatOwnershipRow[]> {
    return this.db.select().from(sessionSeatOwnership);
  }

  async listSessionSeatOwnershipBySession(
    sessionId: SessionId,
  ): Promise<SessionSeatOwnershipRow[]> {
    return this.db
      .select()
      .from(sessionSeatOwnership)
      .where(eq(sessionSeatOwnership.sessionId, sessionId));
  }

  async claimSessionSeatOwnership(
    write: SessionSeatOwnershipWrite,
  ): Promise<SessionSeatOwnershipRow | null> {
    const [row] = await this.db
      .insert(sessionSeatOwnership)
      .values({
        boundAt: write.boundAt,
        participantId: write.participantId,
        sessionId: write.sessionId,
        userId: write.userId,
      })
      .onConflictDoUpdate({
        target: [
          sessionSeatOwnership.sessionId,
          sessionSeatOwnership.participantId,
        ],
        set: { updatedAt: new Date() },
        setWhere: eq(sessionSeatOwnership.userId, write.userId),
      })
      .returning();

    return row ?? null;
  }

  async deleteSessionSeatOwnershipBySession(
    sessionId: SessionId,
  ): Promise<number> {
    const rows = await this.db
      .delete(sessionSeatOwnership)
      .where(eq(sessionSeatOwnership.sessionId, sessionId))
      .returning({ participantId: sessionSeatOwnership.participantId });

    return rows.length;
  }
}
