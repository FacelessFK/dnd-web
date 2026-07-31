/**
 * Transient feedback derived from authoritative events.
 *
 * A feedback item is never state. It is a short-lived description of something
 * the server already told us happened, so losing one costs nothing and the
 * panels keep rendering the authoritative record either way. That distinction
 * is why nothing here writes back into table state.
 *
 * Deduplication is by a key derived from the event itself rather than by
 * arrival order: a reconnect can redeliver the same terminal frame, and a
 * second "critical hit" banner for one attack is a lie about what happened.
 */
import type {
  CombatEvent,
  EncounterStateUpdate,
  PlayerIntentStateUpdate,
  ResolutionStateUpdate,
  SessionStreamEvent,
} from '@dnd/protocol';

import type { MessageKey } from './i18n';

export type M1FeedbackTone = 'info' | 'success' | 'warning' | 'danger';

export type M1FeedbackItem = {
  /** Stable per underlying fact, so redelivery collapses rather than repeats. */
  id: string;
  messageKey: MessageKey;
  values?: Record<string, string>;
  tone: M1FeedbackTone;
};

export const M1_FEEDBACK_LIMIT = 5;

/**
 * What a stream event should announce, if anything.
 *
 * Returns `null` for events that carry no moment worth a callout - a routine
 * session revision, a movement the map already animates - rather than
 * inventing one so every event type has a banner.
 */
export function describeM1Feedback(
  event: SessionStreamEvent,
): M1FeedbackItem | null {
  switch (event.type) {
    case 'combat_event':
      return describeCombatFeedback(event);
    case 'encounter_state':
      return describeEncounterFeedback(event);
    case 'resolution_state':
      return describeResolutionFeedback(event);
    case 'player_intent_state':
      return describeIntentFeedback(event);
    default:
      return null;
  }
}

function describeCombatFeedback(event: CombatEvent): M1FeedbackItem {
  // The event carries no ID of its own, so the key is what makes this attack
  // distinguishable from the next one: who, at whom, and the exact roll.
  const id = [
    'combat',
    event.attackerParticipantId,
    event.targetParticipantId,
    event.targetCombatantId ?? event.targetCharacterId ?? 'concealed',
    String(event.roll.total),
    String(event.damage),
  ].join(':');

  if (!event.hit) {
    return {
      id,
      messageKey: event.roll.criticalMiss
        ? 'runtime.m1.feedback.criticalMiss'
        : 'runtime.m1.feedback.miss',
      tone: 'info',
    };
  }

  return {
    id,
    messageKey: event.roll.critical
      ? 'runtime.m1.feedback.criticalHit'
      : 'runtime.m1.feedback.hit',
    tone: event.roll.critical ? 'danger' : 'warning',
    values: { damage: String(event.damage) },
  };
}

function describeEncounterFeedback(
  event: EncounterStateUpdate,
): M1FeedbackItem | null {
  if (event.reason === 'turn_advanced') {
    return {
      id: `turn:${event.encounter.id}:${event.encounter.roundNumber}:${event.encounter.currentTurnIndex}`,
      messageKey: 'runtime.m1.feedback.turnChanged',
      tone: 'info',
      values: { round: String(event.encounter.roundNumber) },
    };
  }

  if (event.reason === 'dm_combatant_visibility_changed') {
    // The count is what a player can legitimately observe change; the identity
    // of what was concealed is exactly what the projection withheld.
    return {
      id: `visibility:${event.encounter.id}:${event.encounter.updatedAt}`,
      messageKey: 'runtime.m1.feedback.visibilityChanged',
      tone: 'info',
    };
  }

  return null;
}

function describeResolutionFeedback(
  event: ResolutionStateUpdate,
): M1FeedbackItem | null {
  if (event.reason === 'resolution_requested') {
    const request = event.state.requests.at(-1);

    return request
      ? {
          id: `request:${request.id}`,
          messageKey: 'runtime.m1.feedback.resolutionRequested',
          tone: 'info',
        }
      : null;
  }

  if (event.reason === 'resolution_request_cancelled') {
    return {
      id: `cancelled:${event.state.requests.length}:${event.sessionId}`,
      messageKey: 'runtime.m1.feedback.resolutionCancelled',
      tone: 'info',
    };
  }

  const resolution = event.state.resolutions.at(-1);

  if (!resolution) {
    return null;
  }

  return {
    id: `resolution:${resolution.id}`,
    messageKey:
      resolution.success === undefined
        ? 'runtime.m1.feedback.resolutionSubmitted'
        : resolution.success
          ? 'runtime.m1.feedback.resolutionSuccess'
          : 'runtime.m1.feedback.resolutionFailure',
    tone: resolution.success ? 'success' : 'warning',
    values: { total: String(resolution.total) },
  };
}

function describeIntentFeedback(
  event: PlayerIntentStateUpdate,
): M1FeedbackItem | null {
  const intent = event.state.intents.at(-1);

  if (!intent) {
    return null;
  }

  // Keyed on the intent's own `updatedAt`, so a status change announces itself
  // once and the original submission does not re-announce beside it.
  return {
    id: `intent:${intent.id}:${intent.updatedAt}`,
    messageKey:
      event.reason === 'intent_submitted'
        ? 'runtime.m1.feedback.intentSubmitted'
        : 'runtime.m1.feedback.intentStatusChanged',
    tone: 'info',
    values: { statusKey: `runtime.m1.intentStatus.${intent.status}` },
  };
}

/**
 * Adds an item unless the same underlying fact is already showing.
 *
 * Bounded, and oldest-first eviction: a burst during combat should leave the
 * most recent moments visible rather than the first five of them.
 */
export function appendM1Feedback(
  current: M1FeedbackItem[],
  item: M1FeedbackItem | null,
  limit: number = M1_FEEDBACK_LIMIT,
): M1FeedbackItem[] {
  if (!item || current.some((existing) => existing.id === item.id)) {
    return current;
  }

  const next = [...current, item];

  return next.length <= limit ? next : next.slice(next.length - limit);
}

/**
 * How long a callout stays up.
 *
 * Reduced motion returns `null`, which the layer reads as "do not schedule a
 * dismissal". The message stays until it is pushed out by newer ones, because
 * a reader who has asked for less motion has not asked for less information.
 */
export function m1FeedbackDismissDelayMs(
  prefersReducedMotion: boolean,
): number | null {
  return prefersReducedMotion ? null : 6000;
}

export function describeStreamStatus(
  status: 'connected' | 'idle' | 'reconnecting',
  hasRecovered: boolean,
): { messageKey: MessageKey; tone: M1FeedbackTone } {
  if (status === 'reconnecting') {
    return { messageKey: 'runtime.m1.status.reconnecting', tone: 'warning' };
  }

  if (status === 'idle') {
    return { messageKey: 'runtime.m1.status.disconnected', tone: 'danger' };
  }

  return hasRecovered
    ? { messageKey: 'runtime.m1.status.recovered', tone: 'success' }
    : { messageKey: 'runtime.m1.status.connected', tone: 'success' };
}
