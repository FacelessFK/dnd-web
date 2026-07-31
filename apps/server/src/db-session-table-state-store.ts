/**
 * The M1 table state, durable.
 *
 * Same shape as `DbBackedSceneStore`: hydrate at boot, answer reads from the
 * hydrated view, and write through. The difference is *when* the write happens.
 * `SessionTableStateRepository.set` is synchronous because the state rules in
 * `session-table-state.ts` are, so this implementation records the difference
 * between the state it held and the state it was handed, and the transaction
 * boundary flushes those rows inside the command's transaction. Nothing is
 * written outside it: a rollback discards the pending rows along with
 * everything else.
 *
 * The diff is what keeps a command's write cost constant. A table that has run
 * all night holds hundreds of audit rows, and re-upserting all of them on every
 * check would make the last roll of the night the most expensive one.
 *
 * Hydration is bounded to the same working-set limits the in-memory state uses.
 * Rows beyond that stay in the database - it is the durable record, and the
 * working set is not.
 */
import {
  diceResolutionSchema,
  playerIntentSchema,
  resolutionRequestSchema,
  type DiceResolution,
  type PlayerIntent,
  type ResolutionRequest,
} from '@dnd/protocol';
import type { SessionTableStateDatabase } from '@dnd/db';
import type { SessionId } from '@dnd/shared';

import {
  createSessionTableState,
  MAX_RETAINED_INTENTS,
  MAX_RETAINED_REQUESTS,
  MAX_RETAINED_RESOLUTIONS,
  type SessionTableState,
  type SessionTableStateRepository,
} from './session-table-state.js';

type PendingWrites = {
  requests: Array<{ sessionId: SessionId; request: ResolutionRequest }>;
  resolutions: Array<{ sessionId: SessionId; resolution: DiceResolution }>;
  intents: Array<{ sessionId: SessionId; intent: PlayerIntent }>;
};

export class DbBackedSessionTableStateStore implements SessionTableStateRepository {
  private readonly states: Map<SessionId, SessionTableState>;
  private pending: PendingWrites = emptyPendingWrites();

  private constructor(
    private readonly database: SessionTableStateDatabase,
    states: Map<SessionId, SessionTableState>,
  ) {
    this.states = states;
  }

  static async fromDatabase(
    database: SessionTableStateDatabase,
  ): Promise<DbBackedSessionTableStateStore> {
    const sessionIds = await database.listSessionIdsWithTableState();
    const states = new Map<SessionId, SessionTableState>();

    for (const sessionId of sessionIds) {
      states.set(sessionId, await loadSessionTableState(database, sessionId));
    }

    return new DbBackedSessionTableStateStore(database, states);
  }

  /**
   * A store bound to one transaction's database handle, seeded with a copy of
   * the current view. The original is only replaced once the commit succeeds.
   */
  forkForTransaction(
    database: SessionTableStateDatabase,
  ): DbBackedSessionTableStateStore {
    return new DbBackedSessionTableStateStore(database, this.cloneStates());
  }

  get(sessionId: SessionId): SessionTableState {
    const state = this.states.get(sessionId);

    return state ? structuredClone(state) : createSessionTableState();
  }

  set(sessionId: SessionId, state: SessionTableState): void {
    const previous = this.states.get(sessionId) ?? createSessionTableState();

    for (const request of state.requests) {
      if (
        !isSameRecord(
          previous.requests.find((candidate) => candidate.id === request.id),
          request,
        )
      ) {
        this.pending.requests.push({
          request: structuredClone(request),
          sessionId,
        });
      }
    }

    for (const resolution of state.resolutions) {
      if (
        !previous.resolutions.some(
          (candidate) => candidate.id === resolution.id,
        )
      ) {
        this.pending.resolutions.push({
          resolution: structuredClone(resolution),
          sessionId,
        });
      }
    }

    for (const intent of state.intents) {
      if (
        !isSameRecord(
          previous.intents.find((candidate) => candidate.id === intent.id),
          intent,
        )
      ) {
        this.pending.intents.push({
          intent: structuredClone(intent),
          sessionId,
        });
      }
    }

    this.states.set(sessionId, structuredClone(state));
  }

  /**
   * Writes everything `set` recorded. Called inside the command transaction, so
   * a failure here aborts the command rather than leaving a half-written table.
   *
   * Requests are written before the roll that answers them: the resolution row
   * carries a foreign key to the request, and the partial unique index on that
   * column is what makes a second roll for one request a database error rather
   * than a silent overwrite.
   */
  async flushPendingWrites(): Promise<void> {
    const pending = this.pending;

    this.pending = emptyPendingWrites();

    for (const { request, sessionId } of pending.requests) {
      await this.database.upsertSessionResolutionRequest({
        createdAt: new Date(request.createdAt),
        kind: request.kind,
        request: request as unknown as Record<string, unknown>,
        requestId: request.id,
        requestedByParticipantId: request.requestedByParticipantId,
        resolutionId: request.resolutionId ?? null,
        sessionId,
        status: request.status,
        targetCharacterId: request.targetCharacterId ?? null,
        targetParticipantId: request.targetParticipantId,
      });
    }

    for (const { resolution, sessionId } of pending.resolutions) {
      await this.database.insertSessionDiceResolution({
        actorCharacterId: resolution.actorCharacterId ?? null,
        actorParticipantId: resolution.actorParticipantId,
        commandId: resolution.commandId,
        kind: resolution.kind,
        requestId: resolution.requestId ?? null,
        resolution: resolution as unknown as Record<string, unknown>,
        resolutionId: resolution.id,
        resolvedAt: new Date(resolution.resolvedAt),
        rulesProfileId: resolution.rulesProfileId,
        sessionId,
      });
    }

    for (const { intent, sessionId } of pending.intents) {
      await this.database.upsertSessionPlayerIntent({
        authorCharacterId: intent.authorCharacterId ?? null,
        authorParticipantId: intent.authorParticipantId,
        createdAt: new Date(intent.createdAt),
        intent: intent as unknown as Record<string, unknown>,
        intentId: intent.id,
        sessionId,
        status: intent.status,
        updatedAt: new Date(intent.updatedAt),
      });
    }
  }

  hasPendingWrites(): boolean {
    return (
      this.pending.requests.length > 0 ||
      this.pending.resolutions.length > 0 ||
      this.pending.intents.length > 0
    );
  }

  cloneStates(): Map<SessionId, SessionTableState> {
    return new Map(
      [...this.states.entries()].map(([sessionId, state]) => [
        sessionId,
        structuredClone(state),
      ]),
    );
  }

  replaceStates(states: Map<SessionId, SessionTableState>): void {
    this.states.clear();

    for (const [sessionId, state] of states.entries()) {
      this.states.set(sessionId, structuredClone(state));
    }
  }
}

/**
 * Reads one session's working set back out of the database.
 *
 * Every row is validated against the protocol schema on the way out. The
 * database column is deliberately opaque jsonb, so this is the boundary where a
 * row written by an older shape has to fail loudly instead of flowing into a
 * projection as a half-populated object.
 */
export async function loadSessionTableState(
  database: SessionTableStateDatabase,
  sessionId: SessionId,
): Promise<SessionTableState> {
  const [requestRows, resolutionRows, intentRows] = await Promise.all([
    database.listSessionResolutionRequests(sessionId, MAX_RETAINED_REQUESTS),
    database.listSessionDiceResolutions(sessionId, MAX_RETAINED_RESOLUTIONS),
    database.listSessionPlayerIntents(sessionId, MAX_RETAINED_INTENTS),
  ]);

  return {
    intents: intentRows.map((row) =>
      parseRow(playerIntentSchema, row.intent, 'player intent', row.intentId),
    ),
    requests: requestRows.map((row) =>
      parseRow(
        resolutionRequestSchema,
        row.request,
        'resolution request',
        row.requestId,
      ),
    ),
    resolutions: resolutionRows.map((row) =>
      parseRow(
        diceResolutionSchema,
        row.resolution,
        'dice resolution',
        row.resolutionId,
      ),
    ),
  };
}

function parseRow<T>(
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T } },
  document: unknown,
  label: string,
  id: string,
): T {
  const parsed = schema.safeParse(document);

  if (!parsed.success || parsed.data === undefined) {
    throw new Error(
      `Stored ${label} "${id}" does not match the current protocol schema.`,
    );
  }

  return parsed.data;
}

function isSameRecord(previous: unknown, next: unknown): boolean {
  return (
    previous !== undefined && JSON.stringify(previous) === JSON.stringify(next)
  );
}

function emptyPendingWrites(): PendingWrites {
  return { intents: [], requests: [], resolutions: [] };
}
