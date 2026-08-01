/**
 * Durable M1 table state: resolution requests, the dice audit, and intents.
 *
 * Three tables rather than one document per session. The reads this has to
 * serve are relational - the pending requests for one seat, an ordered slice of
 * the audit, one intent by ID - and a single jsonb blob would turn each of them
 * into "load the whole table's history and filter in JavaScript".
 *
 * The canonical protocol object still lives in a jsonb column. The columns
 * beside it are the ones the database is asked to reason about; duplicating the
 * rest as columns would create a second definition of a shape
 * `packages/protocol` already owns.
 *
 * Every read here is bounded. Recovery wants the recent working set, not the
 * transcript of an all-night session, so listing takes a limit and returns the
 * newest rows in ascending order.
 */
import { and, desc, eq } from 'drizzle-orm';

import type { CharacterId, ParticipantId, SessionId } from '@dnd/shared';

import {
  sessionDiceResolutions,
  sessionPlayerIntents,
  sessionResolutionRequests,
  type SessionDiceResolutionRow,
  type SessionPlayerIntentRow,
  type SessionResolutionRequestRow,
  type StoredDiceResolutionDocument,
  type StoredPlayerIntentDocument,
  type StoredResolutionRequestDocument,
} from './schema.js';
import type {
  DndDatabase,
  DndTransaction,
} from './character-record-database.js';

type SessionTableStateDatabaseClient = DndDatabase | DndTransaction;

export type SessionResolutionRequestWrite = {
  createdAt: Date;
  kind: string;
  request: StoredResolutionRequestDocument;
  requestId: string;
  requestedByParticipantId: ParticipantId;
  resolutionId: string | null;
  sessionId: SessionId;
  status: string;
  targetCharacterId: CharacterId | null;
  targetParticipantId: ParticipantId;
};

export type SessionDiceResolutionWrite = {
  actorCharacterId: CharacterId | null;
  actorParticipantId: ParticipantId;
  commandId: string;
  kind: string;
  requestId: string | null;
  resolution: StoredDiceResolutionDocument;
  resolutionId: string;
  resolvedAt: Date;
  rulesProfileId: string;
  sessionId: SessionId;
};

export type SessionPlayerIntentWrite = {
  authorCharacterId: CharacterId | null;
  authorParticipantId: ParticipantId;
  createdAt: Date;
  intent: StoredPlayerIntentDocument;
  intentId: string;
  sessionId: SessionId;
  status: string;
  updatedAt: Date;
};

export interface SessionTableStateDatabase {
  /** @param limit Maximum rows to return, newest first, returned oldest-first. */
  listSessionResolutionRequests(
    sessionId: SessionId,
    limit: number,
  ): Promise<SessionResolutionRequestRow[]>;
  listSessionDiceResolutions(
    sessionId: SessionId,
    limit: number,
  ): Promise<SessionDiceResolutionRow[]>;
  listSessionPlayerIntents(
    sessionId: SessionId,
    limit: number,
  ): Promise<SessionPlayerIntentRow[]>;
  listSessionIdsWithTableState(): Promise<SessionId[]>;
  getSessionResolutionRequest(
    requestId: string,
  ): Promise<SessionResolutionRequestRow | null>;
  getSessionDiceResolutionByRequest(
    requestId: string,
  ): Promise<SessionDiceResolutionRow | null>;
  getSessionPlayerIntent(
    intentId: string,
  ): Promise<SessionPlayerIntentRow | null>;
  upsertSessionResolutionRequest(
    write: SessionResolutionRequestWrite,
  ): Promise<SessionResolutionRequestRow>;
  insertSessionDiceResolution(
    write: SessionDiceResolutionWrite,
  ): Promise<SessionDiceResolutionRow>;
  upsertSessionPlayerIntent(
    write: SessionPlayerIntentWrite,
  ): Promise<SessionPlayerIntentRow>;
}

export class DrizzleSessionTableStateDatabase implements SessionTableStateDatabase {
  constructor(private readonly db: SessionTableStateDatabaseClient) {}

  async listSessionResolutionRequests(
    sessionId: SessionId,
    limit: number,
  ): Promise<SessionResolutionRequestRow[]> {
    const rows = await this.db
      .select()
      .from(sessionResolutionRequests)
      .where(eq(sessionResolutionRequests.sessionId, sessionId))
      .orderBy(
        desc(sessionResolutionRequests.createdAt),
        desc(sessionResolutionRequests.requestId),
      )
      .limit(limit);

    return rows.reverse();
  }

  async listSessionDiceResolutions(
    sessionId: SessionId,
    limit: number,
  ): Promise<SessionDiceResolutionRow[]> {
    const rows = await this.db
      .select()
      .from(sessionDiceResolutions)
      .where(eq(sessionDiceResolutions.sessionId, sessionId))
      .orderBy(
        desc(sessionDiceResolutions.resolvedAt),
        desc(sessionDiceResolutions.resolutionId),
      )
      .limit(limit);

    return rows.reverse();
  }

  async listSessionPlayerIntents(
    sessionId: SessionId,
    limit: number,
  ): Promise<SessionPlayerIntentRow[]> {
    const rows = await this.db
      .select()
      .from(sessionPlayerIntents)
      .where(eq(sessionPlayerIntents.sessionId, sessionId))
      .orderBy(
        desc(sessionPlayerIntents.createdAt),
        desc(sessionPlayerIntents.intentId),
      )
      .limit(limit);

    return rows.reverse();
  }

  /**
   * Which sessions have any M1 state at all.
   *
   * Distinct session IDs across the three tables, so boot hydration visits one
   * session per row instead of reading every request, roll and intent the
   * database holds and grouping them in memory.
   */
  async listSessionIdsWithTableState(): Promise<SessionId[]> {
    const [requestRows, resolutionRows, intentRows] = await Promise.all([
      this.db
        .selectDistinct({ sessionId: sessionResolutionRequests.sessionId })
        .from(sessionResolutionRequests),
      this.db
        .selectDistinct({ sessionId: sessionDiceResolutions.sessionId })
        .from(sessionDiceResolutions),
      this.db
        .selectDistinct({ sessionId: sessionPlayerIntents.sessionId })
        .from(sessionPlayerIntents),
    ]);

    return [
      ...new Set(
        [...requestRows, ...resolutionRows, ...intentRows].map(
          (row) => row.sessionId,
        ),
      ),
    ];
  }

  async getSessionResolutionRequest(
    requestId: string,
  ): Promise<SessionResolutionRequestRow | null> {
    const [row] = await this.db
      .select()
      .from(sessionResolutionRequests)
      .where(eq(sessionResolutionRequests.requestId, requestId))
      .limit(1);

    return row ?? null;
  }

  async getSessionDiceResolutionByRequest(
    requestId: string,
  ): Promise<SessionDiceResolutionRow | null> {
    const [row] = await this.db
      .select()
      .from(sessionDiceResolutions)
      .where(eq(sessionDiceResolutions.requestId, requestId))
      .limit(1);

    return row ?? null;
  }

  async getSessionPlayerIntent(
    intentId: string,
  ): Promise<SessionPlayerIntentRow | null> {
    const [row] = await this.db
      .select()
      .from(sessionPlayerIntents)
      .where(eq(sessionPlayerIntents.intentId, intentId))
      .limit(1);

    return row ?? null;
  }

  async upsertSessionResolutionRequest(
    write: SessionResolutionRequestWrite,
  ): Promise<SessionResolutionRequestRow> {
    const [row] = await this.db
      .insert(sessionResolutionRequests)
      .values({
        createdAt: write.createdAt,
        kind: write.kind,
        request: write.request,
        requestId: write.requestId,
        requestedByParticipantId: write.requestedByParticipantId,
        resolutionId: write.resolutionId,
        sessionId: write.sessionId,
        status: write.status,
        targetCharacterId: write.targetCharacterId,
        targetParticipantId: write.targetParticipantId,
      })
      .onConflictDoUpdate({
        target: sessionResolutionRequests.requestId,
        set: {
          request: write.request,
          resolutionId: write.resolutionId,
          status: write.status,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error('Resolution request write did not return a row.');
    }

    return row;
  }

  /**
   * Inserts a roll, never updates one.
   *
   * A resolution is a historical fact. The partial unique index on `request_id`
   * means a second roll for the same request fails at the database rather than
   * quietly replacing the first, which is the last line of defence behind the
   * state layer's single-resolution rule.
   */
  async insertSessionDiceResolution(
    write: SessionDiceResolutionWrite,
  ): Promise<SessionDiceResolutionRow> {
    const [row] = await this.db
      .insert(sessionDiceResolutions)
      .values({
        actorCharacterId: write.actorCharacterId,
        actorParticipantId: write.actorParticipantId,
        commandId: write.commandId,
        kind: write.kind,
        requestId: write.requestId,
        resolution: write.resolution,
        resolutionId: write.resolutionId,
        resolvedAt: write.resolvedAt,
        rulesProfileId: write.rulesProfileId,
        sessionId: write.sessionId,
      })
      .onConflictDoNothing({ target: sessionDiceResolutions.resolutionId })
      .returning();

    if (row) {
      return row;
    }

    const [existing] = await this.db
      .select()
      .from(sessionDiceResolutions)
      .where(
        and(
          eq(sessionDiceResolutions.resolutionId, write.resolutionId),
          eq(sessionDiceResolutions.sessionId, write.sessionId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error(
        `Dice resolution "${write.resolutionId}" was neither inserted nor found.`,
      );
    }

    return existing;
  }

  async upsertSessionPlayerIntent(
    write: SessionPlayerIntentWrite,
  ): Promise<SessionPlayerIntentRow> {
    const [row] = await this.db
      .insert(sessionPlayerIntents)
      .values({
        authorCharacterId: write.authorCharacterId,
        authorParticipantId: write.authorParticipantId,
        createdAt: write.createdAt,
        intent: write.intent,
        intentId: write.intentId,
        sessionId: write.sessionId,
        status: write.status,
        updatedAt: write.updatedAt,
      })
      .onConflictDoUpdate({
        target: sessionPlayerIntents.intentId,
        set: {
          intent: write.intent,
          status: write.status,
          updatedAt: write.updatedAt,
        },
      })
      .returning();

    if (!row) {
      throw new Error('Player intent write did not return a row.');
    }

    return row;
  }
}
