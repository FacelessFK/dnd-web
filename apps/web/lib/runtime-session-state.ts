/**
 * What the browser believes about one seat at one table.
 *
 * This is a read model, never an authority. Every field here arrives from a
 * server response or a projected stream frame, and the reducer's job is to
 * decide which of those to keep - not to compute game state. Nothing in this
 * module may derive HP, visibility, legality, or identity; if a value is not in
 * a payload the server sent, it does not belong here.
 *
 * Three problems this exists to solve, all of which the cockpit previously
 * handled with scattered `useState` calls and got subtly wrong:
 *
 *  - **Identity switches must wipe state.** Changing session, role or
 *    participant leaves every projection stale, and a stale projection is worse
 *    than an empty one: the old table's map, HP and turn order look current.
 *    `resetForIdentity` is the only way to change identity, so forgetting to
 *    clear is not expressible.
 *  - **Out-of-order frames must lose.** SSE offers no ordering guarantee across
 *    reconnects, so a late frame carrying an older revision has to be dropped
 *    rather than applied. Every authoritative slice here carries a monotonic
 *    marker for exactly that comparison.
 *  - **A repeat is not a new moment.** Reconnecting replays `initial_sync`, and
 *    a frame identical to what is already held must not light up the UI as
 *    though the GM just did something. The reducer reports whether an event
 *    actually changed anything so callers can tell those apart.
 */
import type {
  ActiveSceneState,
  CharacterResource,
  Encounter,
  Scene,
  SessionStreamEvent,
} from '@dnd/protocol';

import type { RuntimeMode, SessionSnapshot } from './runtime-cockpit-helpers';

/**
 * How this client's subscription is doing.
 *
 * `credential_invalid` and `seat_unavailable` are terminal in a way
 * `reconnecting` is not: the browser retrying will never fix either, so they
 * exist as separate states rather than as an error string on a retrying
 * connection. Collapsing them would leave a client spinning forever on a
 * problem only the user can resolve.
 */
export type RuntimeConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'credential_invalid'
  | 'seat_unavailable';

/** Who this browser is claiming to be. Changing any part invalidates the rest. */
export type RuntimeIdentity = {
  sessionId: string;
  mode: RuntimeMode;
  participantId: string;
};

export type RuntimeSessionState = {
  identity: RuntimeIdentity;
  /**
   * Whether a participant token is held for this seat. Only ever a presence
   * flag - the token itself is never stored in this state, never logged, and
   * never rendered.
   */
  hasCredential: boolean;
  session: SessionSnapshot | null;
  scene: Scene | null;
  activeScene: ActiveSceneState | null;
  encounter: Encounter | null;
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  connection: RuntimeConnectionStatus;
  connectionError: string | null;
  /**
   * Human-readable notes from the last recovery attempt. Presentation-safe
   * strings only: raw error JSON must be turned into a message before it gets
   * here.
   */
  recoveryNotes: string[];
  recovering: boolean;
  /** Label of the command in flight, or null. Used for busy affordances. */
  pendingCommand: string | null;
  commandError: string | null;
  diagnosticsOpen: boolean;
};

export type RuntimeSessionAction =
  | { type: 'identity_changed'; identity: Partial<RuntimeIdentity> }
  | { type: 'credential_present'; hasCredential: boolean }
  | { type: 'stream_event'; event: SessionStreamEvent }
  | { type: 'session_snapshot_received'; snapshot: SessionSnapshot }
  | { type: 'scene_received'; scene: Scene }
  | { type: 'active_scene_received'; activeScene: ActiveSceneState }
  | { type: 'encounter_received'; encounter: Encounter | null }
  | {
      type: 'character_received';
      participantId: string;
      character: CharacterResource;
    }
  | { type: 'connection_changed'; status: RuntimeConnectionStatus }
  | {
      type: 'connection_failed';
      status: RuntimeConnectionStatus;
      message: string;
    }
  | { type: 'recovery_started' }
  | { type: 'recovery_finished'; notes: string[] }
  | { type: 'command_started'; label: string }
  | { type: 'command_succeeded' }
  | { type: 'command_failed'; message: string }
  | { type: 'diagnostics_toggled'; open: boolean }
  | { type: 'read_models_cleared' };

export function createRuntimeSessionState(
  identity: RuntimeIdentity,
): RuntimeSessionState {
  return {
    identity,
    hasCredential: false,
    session: null,
    scene: null,
    activeScene: null,
    encounter: null,
    charactersByParticipant: {},
    connection: 'idle',
    connectionError: null,
    recoveryNotes: [],
    recovering: false,
    pendingCommand: null,
    commandError: null,
    diagnosticsOpen: false,
  };
}

/**
 * Everything that describes a table, cleared.
 *
 * Identity, credential presence and diagnostics visibility deliberately
 * survive: the first two are what the caller is switching *to*, and the third
 * is an operator preference about the tool rather than a fact about the game.
 */
function clearReadModels(state: RuntimeSessionState): RuntimeSessionState {
  return {
    ...state,
    session: null,
    scene: null,
    activeScene: null,
    encounter: null,
    charactersByParticipant: {},
    connection: 'idle',
    connectionError: null,
    recoveryNotes: [],
    recovering: false,
    pendingCommand: null,
    commandError: null,
  };
}

export function runtimeSessionReducer(
  state: RuntimeSessionState,
  action: RuntimeSessionAction,
): RuntimeSessionState {
  switch (action.type) {
    case 'identity_changed': {
      const identity = { ...state.identity, ...action.identity };

      if (
        identity.sessionId === state.identity.sessionId &&
        identity.mode === state.identity.mode &&
        identity.participantId === state.identity.participantId
      ) {
        return state;
      }

      // Any part of identity changing invalidates all of it. A seat's
      // credential belongs to that seat, so it goes too - carrying it across a
      // switch is how a client ends up authenticated as somebody else.
      return {
        ...clearReadModels(state),
        identity,
        hasCredential: false,
      };
    }
    case 'credential_present':
      return state.hasCredential === action.hasCredential
        ? state
        : { ...state, hasCredential: action.hasCredential };
    case 'stream_event':
      return applyStreamEvent(state, action.event);
    case 'session_snapshot_received':
      return applySessionSnapshot(state, action.snapshot);
    case 'scene_received':
      return applyScene(state, action.scene);
    case 'active_scene_received':
      return { ...state, activeScene: action.activeScene };
    case 'encounter_received':
      return action.encounter
        ? applyEncounter(state, action.encounter)
        : { ...state, encounter: null };
    case 'character_received':
      return {
        ...state,
        charactersByParticipant: {
          ...state.charactersByParticipant,
          [action.participantId]: action.character,
        },
      };
    case 'connection_changed':
      return state.connection === action.status && !state.connectionError
        ? state
        : { ...state, connection: action.status, connectionError: null };
    case 'connection_failed':
      return {
        ...state,
        connection: action.status,
        connectionError: action.message,
      };
    case 'recovery_started':
      return { ...state, recovering: true, recoveryNotes: [] };
    case 'recovery_finished':
      return { ...state, recovering: false, recoveryNotes: action.notes };
    case 'command_started':
      return { ...state, pendingCommand: action.label, commandError: null };
    case 'command_succeeded':
      return { ...state, pendingCommand: null, commandError: null };
    case 'command_failed':
      return { ...state, pendingCommand: null, commandError: action.message };
    case 'diagnostics_toggled':
      return state.diagnosticsOpen === action.open
        ? state
        : { ...state, diagnosticsOpen: action.open };
    case 'read_models_cleared':
      return clearReadModels(state);
  }
}

/**
 * Apply one projected frame.
 *
 * Events for another session are dropped outright rather than trusted: a client
 * that switched tables while a frame was in flight must not have the old
 * table's map painted over the new one.
 */
function applyStreamEvent(
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
 */
function applySessionSnapshot(
  state: RuntimeSessionState,
  snapshot: SessionSnapshot,
): RuntimeSessionState {
  const currentRevision = state.session?.session.revision ?? -1;

  if (state.session && snapshot.session.revision <= currentRevision) {
    return state;
  }

  return { ...state, session: snapshot };
}

/**
 * A scene frame replaces the map only when it is newer, or when it is a
 * different map.
 *
 * The timestamp comparison is per scene ID: activating a different scene is not
 * "older data" even when the new scene's `updatedAt` predates the old one's,
 * which happens whenever the GM switches back to a map they prepared earlier.
 */
function applyScene(
  state: RuntimeSessionState,
  scene: Scene,
): RuntimeSessionState {
  return shouldReplaceScene(state.scene, scene) ? { ...state, scene } : state;
}

/**
 * Whether an arriving scene should replace the one already held.
 *
 * Exported because the cockpit still holds its map in `useState` while it is
 * being decomposed, and one staleness rule applied in two places is a bug
 * waiting for the day the two copies disagree.
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

function applyEncounter(
  state: RuntimeSessionState,
  encounter: Encounter,
): RuntimeSessionState {
  if (
    state.encounter &&
    state.encounter.id === encounter.id &&
    Date.parse(encounter.updatedAt) < Date.parse(state.encounter.updatedAt)
  ) {
    return state;
  }

  return { ...state, encounter };
}

function applyMovement(
  state: RuntimeSessionState,
  event: Extract<SessionStreamEvent, { type: 'movement_state' }>,
): RuntimeSessionState {
  const activeScene: ActiveSceneState = state.activeScene ?? {
    sessionId: event.sessionId,
    activeSceneId: event.activeSceneId,
    placedCharacters: [],
  };

  if (activeScene.activeSceneId !== event.activeSceneId) {
    // The mover is on a map this client is not holding. Replacing the whole
    // placement list from one movement frame would invent a scene state that
    // was never sent.
    return state;
  }

  const placement = {
    characterId: event.characterId,
    participantId: event.participantId,
    position: event.position,
    footprint: event.footprint,
  };
  const existing = activeScene.placedCharacters.find(
    (entry) => entry.characterId === event.characterId,
  );

  if (
    existing &&
    existing.position.x === placement.position.x &&
    existing.position.y === placement.position.y
  ) {
    return state;
  }

  return {
    ...state,
    activeScene: {
      ...activeScene,
      placedCharacters: existing
        ? activeScene.placedCharacters.map((entry) =>
            entry.characterId === event.characterId ? placement : entry,
          )
        : [...activeScene.placedCharacters, placement],
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
 * `targetHp` is withheld whenever the viewer may not identify the target, so
 * its absence is a projection decision rather than missing data, and there is
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
