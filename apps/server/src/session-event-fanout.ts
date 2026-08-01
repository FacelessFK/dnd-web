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
import type {
  CombatEvent,
  DiceResolution,
  EncounterStateUpdate,
  PlayerIntent,
  PlayerIntentStateUpdateReason,
  ResolutionRequest,
  ResolutionStateUpdateReason,
  SceneStateUpdate,
} from '@dnd/protocol';
import { projectEncounterForRole, projectSceneForRole } from '@dnd/rules';
import type {
  ParticipantId,
  ParticipantRole,
  SceneEntityId,
  SessionId,
  SessionSnapshot,
} from '@dnd/shared';
import type { SessionStreamEvent } from '@dnd/protocol';

import { projectCombatEventForRole } from './encounter-visibility.js';
import { projectTableStateForRole } from './session-table-state.js';

/**
 * The authoritative slice one M1 event describes.
 *
 * Carries the lists rather than a whole `SessionTableState` so the payload a
 * caller hands in is exactly the payload that goes to the durable outbox and
 * comes back out of it. A shape that had to be reassembled on replay would be
 * one more place for the live path and the recovery path to diverge.
 */
export type ResolutionStateFanout = {
  sessionId: SessionId;
  reason: ResolutionStateUpdateReason;
  requests: ResolutionRequest[];
  resolutions: DiceResolution[];
};

export type PlayerIntentStateFanout = {
  sessionId: SessionId;
  reason: PlayerIntentStateUpdateReason;
  intents: PlayerIntent[];
};

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

/**
 * Fan out the active scene, projected per role before serialization.
 *
 * Always projected, with no "nothing is hidden" fast path. The equivalent
 * shortcut on the encounter is safe because concealment there is a set the
 * caller has already computed; here the answer lives on each entity, so a fast
 * path would mean deciding whether anything is hidden in a second place and
 * getting to broadcast the authoritative scene when that decision was wrong.
 * `projectSceneForRole` returns the same object for the DM anyway, so the cost
 * of always asking is one array filter per player payload.
 */
export function publishSceneStateUpdateToRoom(
  room: SessionEventFanoutRoom,
  update: SceneStateUpdate,
): void {
  broadcastByRole(room, (role) => ({
    ...update,
    scene: projectSceneForRole(update.scene, role),
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

/**
 * Fan out the table's resolution state, projected per subscriber.
 *
 * Unlike concealment, this cannot be decided by role alone. Two players at the
 * same table are entitled to different payloads: a request addressed to one of
 * them carries a DC and a GM reason that telegraphs what is coming to the
 * other. So the projection is computed per participant, before serialization,
 * and a subscriber the snapshot cannot identify is projected as a player under
 * their own ID - which resolves to nothing addressed to them.
 */
export function publishResolutionStateUpdateToRoom(
  room: SessionEventFanoutRoom,
  params: ResolutionStateFanout,
): void {
  for (const [participantId, subscriber] of room.subscribers) {
    const projected = projectTableStateForRole(
      {
        intents: [],
        requests: params.requests,
        resolutions: params.resolutions,
      },
      resolveSubscriberRole(room, participantId),
      participantId,
    );

    subscriber.send({
      type: 'resolution_state',
      reason: params.reason,
      sessionId: params.sessionId,
      state: {
        requests: projected.requests,
        resolutions: projected.resolutions,
      },
    });
  }
}

/**
 * Fan out the table's intents, projected per subscriber.
 *
 * An intent is a note between its author and the GM, so every other seat
 * receives an update carrying none of them rather than no update at all - the
 * stream stays a consistent description of what that client is allowed to know.
 */
export function publishPlayerIntentStateUpdateToRoom(
  room: SessionEventFanoutRoom,
  params: PlayerIntentStateFanout,
): void {
  for (const [participantId, subscriber] of room.subscribers) {
    const projected = projectTableStateForRole(
      { intents: params.intents, requests: [], resolutions: [] },
      resolveSubscriberRole(room, participantId),
      participantId,
    );

    subscriber.send({
      type: 'player_intent_state',
      reason: params.reason,
      sessionId: params.sessionId,
      state: { intents: projected.intents },
    });
  }
}

/**
 * A subscriber's role, failing closed. An unknown viewer is a player: the one
 * mistake that must never be made here is handing out the omniscient payload.
 */
function resolveSubscriberRole(
  room: SessionEventFanoutRoom,
  participantId: ParticipantId,
): ParticipantRole {
  return (
    room.snapshot.participants.find(
      (participant) => participant.id === participantId,
    )?.role ?? 'player'
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
    const role = resolveSubscriberRole(room, participantId);
    let projected = projectedByRole.get(role);

    if (!projected) {
      projected = project(role);
      projectedByRole.set(role, projected);
    }

    subscriber.send(structuredClone(projected));
  }
}
