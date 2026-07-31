/**
 * The browser's copy of the M1 table, reduced from server payloads.
 *
 * Not a cache the client reasons about - a projection of what the server last
 * said, held so a panel can render between events. Every field arrives already
 * role-projected: a request addressed elsewhere never reaches this client, and
 * nothing here filters, because filtering in the browser would mean the bytes
 * had already been sent to someone not entitled to them.
 *
 * Both inputs carry the *whole* projected list rather than a delta - an SSE
 * frame and a command response are the same shape - so merging is by ID rather
 * than by append. That is what makes a duplicate frame idempotent instead of
 * producing a second copy of a resolved roll.
 */
import type {
  DiceResolution,
  PlayerIntent,
  ResolutionRequest,
} from '@dnd/protocol';

export type M1TableState = {
  requests: ResolutionRequest[];
  resolutions: DiceResolution[];
  intents: PlayerIntent[];
};

export function createEmptyM1TableState(): M1TableState {
  return { intents: [], requests: [], resolutions: [] };
}

/**
 * Merge a projected slice into what the client holds.
 *
 * Requests are replaced by ID because their status advances - a pending row
 * becomes resolved or cancelled, and keeping the older copy would leave a
 * "roll this" button next to a roll that already happened. Resolutions and
 * intents are keyed the same way, so an event delivered twice changes nothing
 * the second time.
 *
 * Ordering is by the server's own timestamps, not by arrival. A reconnect can
 * deliver the backlog in a different order than it was produced, and an audit
 * that reordered itself on reconnect would be unreadable.
 */
export function mergeM1TableState(
  current: M1TableState,
  incoming: Partial<M1TableState>,
): M1TableState {
  return {
    intents: mergeById(
      current.intents,
      incoming.intents,
      (intent) => intent.id,
      (left, right) =>
        compare(left.createdAt, right.createdAt, left.id, right.id),
    ),
    requests: mergeById(
      current.requests,
      incoming.requests,
      (request) => request.id,
      (left, right) =>
        compare(left.createdAt, right.createdAt, left.id, right.id),
    ),
    resolutions: mergeById(
      current.resolutions,
      incoming.resolutions,
      (resolution) => resolution.id,
      (left, right) =>
        compare(left.resolvedAt, right.resolvedAt, left.id, right.id),
    ),
  };
}

function mergeById<T>(
  current: T[],
  incoming: T[] | undefined,
  identify: (entry: T) => string,
  order: (left: T, right: T) => number,
): T[] {
  if (!incoming) {
    return current;
  }

  const merged = new Map(current.map((entry) => [identify(entry), entry]));

  for (const entry of incoming) {
    merged.set(identify(entry), entry);
  }

  return [...merged.values()].sort(order);
}

function compare(
  leftAt: string,
  rightAt: string,
  leftId: string,
  rightId: string,
): number {
  return leftAt === rightAt
    ? leftId.localeCompare(rightId)
    : leftAt.localeCompare(rightAt);
}

export function pendingRequestsFor(
  state: M1TableState,
  participantId: string,
): ResolutionRequest[] {
  return state.requests.filter(
    (request) =>
      request.status === 'pending' &&
      request.targetParticipantId === participantId,
  );
}

export function findResolutionForRequest(
  state: M1TableState,
  requestId: string,
): DiceResolution | null {
  return (
    state.resolutions.find(
      (resolution) => resolution.requestId === requestId,
    ) ?? null
  );
}

/**
 * Whether an active condition is on the character.
 *
 * Read from authoritative overlay state rather than tracked locally, so a
 * refresh, a reconnect and a fresh apply all agree - and applying `poisoned`
 * twice reads as one condition, because the server stores a set.
 */
export function hasActiveCondition(
  activeConditions: readonly string[] | undefined,
  condition: string,
): boolean {
  return (activeConditions ?? []).includes(condition);
}
