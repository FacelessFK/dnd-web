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
  AuthoritativeSceneStateUpdate,
  CombatEvent,
  DiceResolution,
  EncounterStateUpdate,
  PlayerIntent,
  PlayerIntentStateUpdateReason,
  ResolutionRequest,
  ResolutionStateUpdateReason,
} from '@dnd/protocol';
import {
  buildSceneVisibilityIndex,
  projectEncounterForRole,
  projectSceneViewForObservers,
  type OccupancyShape,
} from '@dnd/rules';
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
 * Everything the scene fan-out needs to answer "what may this seat see".
 *
 * Observers are handed in rather than looked up here because resolving them
 * means reading character records, which is a promise in DB mode and a value in
 * memory, and this module has to stay synchronous - it runs inside a loop over
 * live subscribers. The caller that already knows how to settle a repository
 * result does that work and passes the answer down.
 *
 * `projectedAt` is stamped once, by whoever raised the update, and shared by
 * every viewer's payload. Stamping per-viewer here would be wrong on the live
 * path: two updates whose observer lookups settle out of order would be
 * time-stamped in the order they *finished*, so the older scene would carry the
 * newer stamp and a client would keep it.
 */
export type SceneVisibilityContext = {
  projectedAt: string;
  observersByParticipant: ReadonlyMap<ParticipantId, readonly OccupancyShape[]>;
};

/**
 * Whether anyone listening to this room needs a projected payload.
 *
 * Resolving observers is a database read, and a room with no player subscribed
 * has nobody to resolve them for. Answering `false` never risks a leak: the
 * caller then publishes with no observers, which projects an empty view, so the
 * worst case of getting this wrong is a player who is told less than they could
 * have been - and the next frame corrects it.
 */
export function roomHasProjectedSubscribers(
  room: SessionEventFanoutRoom,
): boolean {
  for (const [participantId] of room.subscribers) {
    if (resolveSubscriberRole(room, participantId) !== 'dm') {
      return true;
    }
  }

  return false;
}

/**
 * Fan out the active scene, projected per subscriber before serialization.
 *
 * The DM gets the authoritative scene. Every other seat gets a `SceneView`
 * containing only the cells and entities that seat's characters can currently
 * perceive - a different payload per seat, because two players standing in
 * different rooms are entitled to different maps. That is why this cannot cache
 * one payload per role the way the encounter fan-out does.
 *
 * A seat with no entry in `observersByParticipant`, and every seat when no
 * context was supplied at all, is projected with no observers: an empty view.
 * Failing closed here is the whole point. A caller that forgot to resolve
 * observers must under-inform a player, never hand them the map.
 */
export function publishSceneStateUpdateToRoom(
  room: SessionEventFanoutRoom,
  update: AuthoritativeSceneStateUpdate,
  visibility?: SceneVisibilityContext,
): void {
  // Built lazily and shared across every player in the room: the blocker grid
  // and decoded terrain are the same for all of them, and only the observer set
  // differs.
  let index: ReturnType<typeof buildSceneVisibilityIndex> | null = null;
  const projectedAt = visibility?.projectedAt ?? new Date().toISOString();

  for (const [participantId, subscriber] of room.subscribers) {
    if (resolveSubscriberRole(room, participantId) === 'dm') {
      subscriber.send(structuredClone(update));
      continue;
    }

    index ??= buildSceneVisibilityIndex(update.scene);

    subscriber.send({
      type: 'scene_state',
      view: 'player_projection',
      reason: update.reason,
      sessionId: update.sessionId,
      scene: projectSceneViewForObservers({
        scene: update.scene,
        observers: visibility?.observersByParticipant.get(participantId) ?? [],
        projectedAt,
        index,
      }),
    });
  }
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
