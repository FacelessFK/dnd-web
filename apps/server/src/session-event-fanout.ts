/**
 * Role-aware delivery of the two session events that can carry concealed
 * identities.
 *
 * This exists as one module because `InMemorySessionStore` and
 * `DbBackedSessionStore` are separate implementations with no shared base
 * class. Their plain `broadcast` was already duplicated, which is harmless for
 * a loop that sends one payload to everyone. Duplicating *concealment* is not:
 * two copies of a projection boundary means a fix applied to one store leaves
 * the other quietly leaking, and the DB-backed store is the deployed path.
 *
 * Both stores delegate here so there is exactly one place where the decision
 * "who is allowed to see which payload" is made.
 */
import type { CombatEvent, EncounterStateUpdate } from '@dnd/protocol';
import { projectEncounterForRole } from '@dnd/rules';
import type {
  ParticipantId,
  ParticipantRole,
  SceneEntityId,
  SessionSnapshot,
} from '@dnd/shared';
import type { SessionStreamEvent } from '@dnd/protocol';

import { projectCombatEventForRole } from './encounter-visibility.js';

/** The minimum a subscriber has to offer to receive an event. */
type FanoutSubscriber = {
  send: (update: SessionStreamEvent) => void;
};

/**
 * Structural view of a session room. Declared by shape rather than importing
 * each store's private `SessionRoomState`, so neither store has to expose its
 * internals and this module stays free of a dependency cycle.
 */
export type SessionEventFanoutRoom = {
  snapshot: SessionSnapshot;
  subscribers: Iterable<readonly [ParticipantId, FanoutSubscriber]>;
};

export function publishEncounterStateUpdateToRoom(
  room: SessionEventFanoutRoom,
  update: EncounterStateUpdate,
  concealedCombatantIds?: ReadonlySet<SceneEntityId>,
): void {
  if (!concealedCombatantIds?.size) {
    broadcast(room, update);
    return;
  }

  broadcastByRole(room, (role) => ({
    ...update,
    encounter: projectEncounterForRole(
      update.encounter,
      role,
      concealedCombatantIds,
    ),
  }));
}

export function publishCombatEventToRoom(
  room: SessionEventFanoutRoom,
  event: CombatEvent,
  concealedCombatantIds?: ReadonlySet<SceneEntityId>,
): void {
  if (!concealedCombatantIds?.size) {
    broadcast(room, event);
    return;
  }

  broadcastByRole(room, (role) =>
    projectCombatEventForRole(event, role, concealedCombatantIds),
  );
}

function broadcast(
  room: SessionEventFanoutRoom,
  update: SessionStreamEvent,
): void {
  for (const [, subscriber] of room.subscribers) {
    subscriber.send(structuredClone(update));
  }
}

/**
 * Fan out a per-role view of one event.
 *
 * Concealment cannot be applied once and broadcast, because the DM and the
 * players are entitled to different payloads on the same stream. There are only
 * two roles, so each variant is built at most once and reused.
 *
 * A subscriber whose participant cannot be resolved is treated as a player.
 * Failing closed matters here: an unknown viewer must never be handed the
 * omniscient payload.
 */
function broadcastByRole(
  room: SessionEventFanoutRoom,
  project: (role: ParticipantRole) => SessionStreamEvent,
): void {
  const projectedByRole = new Map<ParticipantRole, SessionStreamEvent>();

  for (const [participantId, subscriber] of room.subscribers) {
    const role =
      room.snapshot.participants.find(
        (participant) => participant.id === participantId,
      )?.role ?? 'player';
    let projected = projectedByRole.get(role);

    if (!projected) {
      projected = project(role);
      projectedByRole.set(role, projected);
    }

    subscriber.send(structuredClone(projected));
  }
}
