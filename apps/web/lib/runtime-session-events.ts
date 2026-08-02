/**
 * How one projected payload folds into the browser's read model.
 *
 * Split from `runtime-session-state.ts` so that file answers "what does this
 * action mean" and this one answers "which of two versions of the truth wins".
 * They are different kinds of decision and the second is where the bugs live.
 *
 * Nothing here derives game state. Every value is copied from something the
 * server sent; if a field is absent from a payload, its absence is a projection
 * decision and there is correctly nothing to apply.
 */
import type {
  ActiveSceneState,
  CharacterResource,
  Encounter,
  Scene,
  SessionStreamEvent,
} from '@dnd/protocol';

import type {
  RuntimeSessionState,
  SessionSnapshot,
} from './runtime-session-state';

/**
 * Apply one projected frame.
 *
 * Events for another session are dropped outright rather than trusted: a client
 * that switched tables while a frame was in flight must not have the old
 * table's map painted over the new one.
 */
export function applyStreamEvent(
  state: RuntimeSessionState,
  event: SessionStreamEvent,
): RuntimeSessionState {
  if (
    state.identity.sessionId &&
    event.sessionId !== state.identity.sessionId
  ) {
    return state;
  }

  switch (event.type) {
    case 'session_state':
      return applySessionSnapshot(state, event.state);
    case 'scene_state':
      return applyScene(state, event.scene);
    case 'encounter_state':
      return applyEncounter(state, event.encounter);
    case 'movement_state':
      return applyMovement(state, event);
    case 'character_state':
      return applyCharacterHp(state, event);
    case 'combat_event':
      return applyCombatDamage(state, event);
    default:
      // Resolution and player-intent frames belong to the M1 table model, which
      // owns its own state. Ignoring them here keeps one slice per owner rather
      // than two copies of the same authoritative list.
      return state;
  }
}

/**
 * Newer revisions win; equal or older ones are dropped.
 *
 * Equal is dropped rather than reapplied because `initial_sync` on every
 * reconnect would otherwise register as a change and make the UI announce a
 * moment that did not happen.
 *
 * A snapshot also settles which scene is active. When the session has none, the
 * held map and placements go with it: keeping them would leave the last scene on
 * screen as though it were still the table's.
 */
export function applySessionSnapshot(
  state: RuntimeSessionState,
  snapshot: SessionSnapshot,
): RuntimeSessionState {
  const currentRevision = state.session?.session.revision ?? -1;

  if (state.session && snapshot.session.revision <= currentRevision) {
    return state;
  }

  const activeSceneId = snapshot.session.activeSceneId;

  if (!activeSceneId) {
    return {
      ...state,
      activeScene: null,
      scene: null,
      sceneId: '',
      session: snapshot,
    };
  }

  return {
    ...state,
    sceneId: activeSceneId,
    session: snapshot,
  };
}

/**
 * A scene frame replaces the map only when it is newer, or when it is a
 * different map.
 */
export function applyScene(
  state: RuntimeSessionState,
  scene: Scene,
): RuntimeSessionState {
  if (!shouldReplaceScene(state.scene, scene)) {
    return state;
  }

  return {
    ...state,
    knownScenesById: { ...state.knownScenesById, [scene.id]: scene },
    scene,
  };
}

/**
 * Record a scene the client asked for by ID, whether or not it is the active
 * one.
 *
 * Distinct from `applyScene` because creating or reading a scene should make it
 * selectable without pretending the table moved to it. Only an activation - a
 * session snapshot - changes which scene is active.
 */
export function rememberScene(
  state: RuntimeSessionState,
  scene: Scene,
): RuntimeSessionState {
  return {
    ...state,
    knownScenesById: { ...state.knownScenesById, [scene.id]: scene },
    scene: shouldReplaceScene(state.scene, scene) ? scene : state.scene,
    sceneId: scene.id,
  };
}

/**
 * Whether an arriving scene should replace the one already held.
 *
 * The timestamp comparison is per scene ID: activating a different scene is not
 * "older data" even when the new scene's `updatedAt` predates the old one's,
 * which happens whenever the GM switches back to a map they prepared earlier.
 */
export function shouldReplaceScene(
  current: Scene | null,
  next: Scene,
): boolean {
  if (!current || current.id !== next.id) {
    return true;
  }

  return Date.parse(next.updatedAt) > Date.parse(current.updatedAt);
}

export function applyEncounter(
  state: RuntimeSessionState,
  encounter: Encounter | null,
): RuntimeSessionState {
  if (!encounter) {
    return state.encounter === null ? state : { ...state, encounter: null };
  }

  if (
    state.encounter &&
    state.encounter.id === encounter.id &&
    Date.parse(encounter.updatedAt) < Date.parse(state.encounter.updatedAt)
  ) {
    return state;
  }

  return { ...state, encounter };
}

export function applyActiveScene(
  state: RuntimeSessionState,
  activeScene: ActiveSceneState | null,
): RuntimeSessionState {
  return { ...state, activeScene };
}

/**
 * Fold one token's movement into the placement list.
 *
 * Placements are keyed by participant, not character: a seat has one token, and
 * keying by character would strand the old entry when the GM reassigns a
 * character to a different seat.
 */
export function applyMovement(
  state: RuntimeSessionState,
  event: Extract<SessionStreamEvent, { type: 'movement_state' }>,
): RuntimeSessionState {
  const previous: ActiveSceneState = state.activeScene ?? {
    activeSceneId: event.activeSceneId,
    placedCharacters: [],
    sessionId: event.sessionId,
  };

  if (state.activeScene && previous.activeSceneId !== event.activeSceneId) {
    // The mover is on a map this client is not holding. Replacing the whole
    // placement list from one movement frame would invent a scene state that
    // was never sent.
    return state;
  }

  const placement = {
    characterId: event.characterId,
    footprint: event.footprint,
    participantId: event.participantId,
    position: event.position,
  };
  const existing = previous.placedCharacters.find(
    (entry) => entry.participantId === event.participantId,
  );

  if (
    existing &&
    existing.characterId === placement.characterId &&
    existing.position.x === placement.position.x &&
    existing.position.y === placement.position.y
  ) {
    return state;
  }

  return {
    ...state,
    activeScene: {
      ...previous,
      activeSceneId: event.activeSceneId,
      placedCharacters: existing
        ? previous.placedCharacters.map((entry) =>
            entry.participantId === event.participantId ? placement : entry,
          )
        : [...previous.placedCharacters, placement],
    },
  };
}

/**
 * Record a character resource and the seat it belongs to.
 *
 * The ID map survives a read-model clear so a client that reset its view can
 * still ask the server for the characters it used to hold. It carries IDs only -
 * never the character itself - so it can never become a stale second copy of
 * live HP.
 */
export function rememberCharacter(
  state: RuntimeSessionState,
  resource: CharacterResource,
): RuntimeSessionState {
  const participantId = resource.character.ownerParticipantId;

  return {
    ...state,
    charactersByParticipant: {
      ...state.charactersByParticipant,
      [participantId]: resource,
    },
    knownCharacterIdsByParticipant: {
      ...state.knownCharacterIdsByParticipant,
      [participantId]: resource.character.id,
    },
  };
}

function applyCharacterHp(
  state: RuntimeSessionState,
  event: Extract<SessionStreamEvent, { type: 'character_state' }>,
): RuntimeSessionState {
  return patchCharacter(state, event.characterId, (resource) => ({
    ...resource,
    character: { ...resource.character, hp: event.hp },
    overlay: {
      ...resource.overlay,
      activeConditions:
        event.activeConditions ?? resource.overlay.activeConditions,
    },
  }));
}

/**
 * Reconcile the health a combat event reported.
 *
 * `targetHp` is withheld whenever the viewer may not identify the target, so its
 * absence is a projection decision rather than missing data, and there is
 * correctly nothing to apply. The server stays the authority either way; this
 * only saves a round trip.
 */
function applyCombatDamage(
  state: RuntimeSessionState,
  event: Extract<SessionStreamEvent, { type: 'combat_event' }>,
): RuntimeSessionState {
  const targetHp = event.targetHp;

  if (!targetHp) {
    return state;
  }

  if (event.targetCharacterId) {
    return patchCharacter(state, event.targetCharacterId, (resource) => ({
      ...resource,
      character: {
        ...resource.character,
        hp: { ...resource.character.hp, current: targetHp.current },
      },
    }));
  }

  if (!event.targetCombatantId || !state.scene) {
    return state;
  }

  const combatantId = event.targetCombatantId;

  return {
    ...state,
    scene: {
      ...state.scene,
      entities: state.scene.entities.map((entity: Scene['entities'][number]) =>
        entity.id === combatantId && entity.combatant
          ? {
              ...entity,
              combatant: {
                ...entity.combatant,
                hp: { ...entity.combatant.hp, current: targetHp.current },
              },
            }
          : entity,
      ),
    },
  };
}

function patchCharacter(
  state: RuntimeSessionState,
  characterId: string,
  patch: (resource: CharacterResource) => CharacterResource,
): RuntimeSessionState {
  const entry = Object.entries(state.charactersByParticipant).find(
    ([, resource]) => resource?.character.id === characterId,
  );

  if (!entry?.[1]) {
    return state;
  }

  return {
    ...state,
    charactersByParticipant: {
      ...state.charactersByParticipant,
      [entry[0]]: patch(entry[1]),
    },
  };
}
