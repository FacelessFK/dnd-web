/**
 * Resolution requests, dice audit records, and player intents for one table.
 *
 * Pure state transitions. The runtime owns authorization and dice; this module
 * owns *what the table remembers* and *who is allowed to see it*, so both can
 * be tested without a session, a socket, or a database.
 *
 * Role projection lives here rather than at the transport, because the rule is
 * about the data: a request addressed to one seat is that seat's business, and
 * an intent is a note between its author and the GM. Resolved rolls are public
 * - a die hitting the table is heard by everyone.
 */
import type {
  DiceResolution,
  PlayerIntent,
  PlayerIntentStatus,
  ResolutionRequest,
} from '@dnd/protocol';
import type { ParticipantId, ParticipantRole, SessionId } from '@dnd/shared';

/**
 * Bounds. A table that runs all night must not grow an unbounded audit array
 * that every projection then clones. Oldest entries fall off the end; the
 * durable record is the database in DB mode, not this working set.
 */
export const MAX_RETAINED_RESOLUTIONS = 200;
export const MAX_RETAINED_INTENTS = 200;
export const MAX_RETAINED_REQUESTS = 100;

export type SessionTableState = {
  requests: ResolutionRequest[];
  resolutions: DiceResolution[];
  intents: PlayerIntent[];
};

export function createSessionTableState(): SessionTableState {
  return { intents: [], requests: [], resolutions: [] };
}

export class SessionTableStateError extends Error {
  readonly code:
    | 'resolution_request_not_found'
    | 'resolution_request_already_resolved'
    | 'player_intent_not_found'
    | 'invalid_intent_status_transition'
    | 'invalid_resolution_target';

  constructor(code: SessionTableStateError['code'], message: string) {
    super(message);
    this.name = 'SessionTableStateError';
    this.code = code;
  }
}

function trimToLimit<T>(entries: T[], limit: number): T[] {
  return entries.length <= limit
    ? entries
    : entries.slice(entries.length - limit);
}

export function addResolutionRequest(
  state: SessionTableState,
  request: ResolutionRequest,
): SessionTableState {
  return {
    ...state,
    requests: trimToLimit([...state.requests, request], MAX_RETAINED_REQUESTS),
  };
}

export function findResolutionRequest(
  state: SessionTableState,
  requestId: string,
): ResolutionRequest | undefined {
  return state.requests.find((request) => request.id === requestId);
}

/**
 * A request can only be answered by the seat it was addressed to, and only
 * once. Re-resolving under a new command ID would let a player rebuild a
 * failed roll until it succeeded, which is the whole reason the server rolls.
 */
export function requirePendingRequestFor(
  state: SessionTableState,
  requestId: string,
  participantId: ParticipantId,
): ResolutionRequest {
  const request = findResolutionRequest(state, requestId);

  if (!request) {
    throw new SessionTableStateError(
      'resolution_request_not_found',
      `Resolution request "${requestId}" does not exist in this session.`,
    );
  }

  if (request.targetParticipantId !== participantId) {
    throw new SessionTableStateError(
      'invalid_resolution_target',
      `Resolution request "${requestId}" was not addressed to participant "${participantId}".`,
    );
  }

  if (request.status !== 'pending') {
    throw new SessionTableStateError(
      'resolution_request_already_resolved',
      `Resolution request "${requestId}" is already ${request.status}.`,
    );
  }

  return request;
}

export function recordResolution(
  state: SessionTableState,
  params: {
    request: ResolutionRequest;
    resolution: DiceResolution;
    resolvedAt: string;
  },
): SessionTableState {
  return {
    ...state,
    requests: state.requests.map((request) =>
      request.id === params.request.id
        ? {
            ...request,
            resolutionId: params.resolution.id,
            resolvedAt: params.resolvedAt,
            status: 'resolved' as const,
          }
        : request,
    ),
    resolutions: trimToLimit(
      [...state.resolutions, params.resolution],
      MAX_RETAINED_RESOLUTIONS,
    ),
  };
}

export function cancelResolutionRequest(
  state: SessionTableState,
  requestId: string,
): SessionTableState {
  const request = findResolutionRequest(state, requestId);

  if (!request) {
    throw new SessionTableStateError(
      'resolution_request_not_found',
      `Resolution request "${requestId}" does not exist in this session.`,
    );
  }

  if (request.status !== 'pending') {
    throw new SessionTableStateError(
      'resolution_request_already_resolved',
      `Resolution request "${requestId}" is already ${request.status}.`,
    );
  }

  return {
    ...state,
    requests: state.requests.map((candidate) =>
      candidate.id === requestId
        ? { ...candidate, status: 'cancelled' as const }
        : candidate,
    ),
  };
}

export function addPlayerIntent(
  state: SessionTableState,
  intent: PlayerIntent,
): SessionTableState {
  return {
    ...state,
    intents: trimToLimit([...state.intents, intent], MAX_RETAINED_INTENTS),
  };
}

/**
 * Statuses an intent can never leave.
 *
 * `pending` is unreachable as a destination because the command schema does not
 * offer it, and `resolved`/`dismissed` are the GM's final word. Without this a
 * second GM click - or a stale tab replaying an old decision under a fresh
 * command ID - would quietly overwrite the outcome the table already saw.
 */
const TERMINAL_INTENT_STATUSES: readonly PlayerIntentStatus[] = [
  'resolved',
  'dismissed',
];

export function assertPlayerIntentStatusTransition(
  intent: PlayerIntent,
  next: Exclude<PlayerIntentStatus, 'pending'>,
): void {
  if (!TERMINAL_INTENT_STATUSES.includes(intent.status)) {
    return;
  }

  throw new SessionTableStateError(
    'invalid_intent_status_transition',
    `Player intent "${intent.id}" is already ${intent.status} and cannot become "${next}".`,
  );
}

export function updatePlayerIntentStatus(
  state: SessionTableState,
  params: {
    intentId: string;
    status: Exclude<PlayerIntentStatus, 'pending'>;
    gmNote?: string;
    updatedAt: string;
  },
): SessionTableState {
  const intent = state.intents.find(
    (candidate) => candidate.id === params.intentId,
  );

  if (!intent) {
    throw new SessionTableStateError(
      'player_intent_not_found',
      `Player intent "${params.intentId}" does not exist in this session.`,
    );
  }

  assertPlayerIntentStatusTransition(intent, params.status);

  return {
    ...state,
    intents: state.intents.map((candidate) =>
      candidate.id === params.intentId
        ? {
            ...candidate,
            ...(params.gmNote === undefined ? {} : { gmNote: params.gmNote }),
            status: params.status,
            updatedAt: params.updatedAt,
          }
        : candidate,
    ),
  };
}

/**
 * What one role is allowed to see.
 *
 * The DM adjudicates the table and sees all of it. A player sees the requests
 * addressed to them, their own intents, and every resolved roll - a die landing
 * is public, and hiding other seats' results would make the shared audit
 * useless. A request addressed elsewhere is withheld: it can carry a DC and a
 * GM reason that telegraphs what is coming.
 */
export function projectTableStateForRole(
  state: SessionTableState,
  role: ParticipantRole,
  participantId: ParticipantId,
): SessionTableState {
  if (role === 'dm') {
    return structuredClone(state);
  }

  return structuredClone({
    intents: state.intents.filter(
      (intent) => intent.authorParticipantId === participantId,
    ),
    requests: state.requests.filter(
      (request) => request.targetParticipantId === participantId,
    ),
    resolutions: state.resolutions,
  });
}

/**
 * Where a table's state lives, without saying how long it lives.
 *
 * Reads are synchronous because the runtime's command methods are, and the
 * DB-backed implementation answers them from a hydrated view. Writes are
 * `void` for the same reason: the durable implementation records what changed
 * and the transaction boundary flushes it, so the rules above never learn
 * whether they are running against memory or Postgres.
 */
export interface SessionTableStateRepository {
  get(sessionId: SessionId): SessionTableState;
  set(sessionId: SessionId, state: SessionTableState): void;
}

/**
 * One table state per session, held for the life of the process.
 *
 * A session with nothing recorded yet reads as empty rather than missing, so a
 * projection never has to distinguish "no requests" from "no table". Writes go
 * through `set` with the value the transitions above returned, which keeps the
 * whole mutation path immutable and makes the store itself trivial enough to
 * swap for a DB-backed one without moving any rules.
 */
export class InMemorySessionTableStateStore implements SessionTableStateRepository {
  private readonly states = new Map<SessionId, SessionTableState>();

  get(sessionId: SessionId): SessionTableState {
    return this.states.get(sessionId) ?? createSessionTableState();
  }

  set(sessionId: SessionId, state: SessionTableState): void {
    this.states.set(sessionId, state);
  }

  forgetSession(sessionId: SessionId): void {
    this.states.delete(sessionId);
  }
}
