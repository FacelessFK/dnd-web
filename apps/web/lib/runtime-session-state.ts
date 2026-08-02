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
 *    `identity_changed` is the only way to change identity, so forgetting to
 *    clear is not expressible.
 *  - **Out-of-order frames must lose.** SSE offers no ordering guarantee across
 *    reconnects, so a late frame carrying an older revision has to be dropped
 *    rather than applied. Every authoritative slice here carries a monotonic
 *    marker for exactly that comparison.
 *  - **A repeat is not a new moment.** Reconnecting replays `initial_sync`, and
 *    a frame identical to what is already held must not light up the UI as
 *    though the GM just did something. Because every apply returns the same
 *    object when nothing changed, callers can tell those apart by identity.
 *
 * How a payload folds in lives in `runtime-session-events.ts`. This file is only
 * about what each action means.
 */
import type {
  ActiveSceneState,
  CharacterResource,
  Encounter,
  SessionStreamEvent,
} from '@dnd/protocol';

import type { RuntimeScene } from './runtime-scene-view';

import type { RuntimeMode, SessionSnapshot } from './runtime-cockpit-helpers';
import {
  applyActiveScene,
  applyEncounter,
  applyScene,
  applySessionSnapshot,
  applyStreamEvent,
  rememberCharacter,
  rememberScene,
} from './runtime-session-events';

export type { SessionSnapshot };
export { shouldReplaceScene } from './runtime-session-events';

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
  scene: RuntimeScene | null;
  /** The active scene's ID, or '' when the table has no active scene. */
  sceneId: string;
  /** Every scene this client has read, so the GM can switch between them. */
  knownScenesById: Record<string, RuntimeScene>;
  activeScene: ActiveSceneState | null;
  encounter: Encounter | null;
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  /**
   * Seat to character ID, IDs only.
   *
   * Survives a read-model clear so a reset client can still ask the server for
   * the characters it held. Carrying the resource here instead would be a second
   * copy of live HP going stale the moment anyone took damage.
   */
  knownCharacterIdsByParticipant: Record<string, string>;
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
  | { type: 'scene_received'; scene: RuntimeScene }
  | { type: 'scene_remembered'; scene: RuntimeScene }
  | { type: 'scene_cleared' }
  | { type: 'active_scene_received'; activeScene: ActiveSceneState | null }
  | { type: 'encounter_received'; encounter: Encounter | null }
  | { type: 'character_remembered'; character: CharacterResource }
  | {
      type: 'known_character_ids_restored';
      knownCharacterIdsByParticipant: Record<string, string>;
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
  | { type: 'read_models_cleared'; clearKnownCharacterIds?: boolean };

export function createRuntimeSessionState(
  identity: RuntimeIdentity,
): RuntimeSessionState {
  return {
    activeScene: null,
    charactersByParticipant: {},
    commandError: null,
    connection: 'idle',
    connectionError: null,
    diagnosticsOpen: false,
    encounter: null,
    hasCredential: false,
    identity,
    knownCharacterIdsByParticipant: {},
    knownScenesById: {},
    pendingCommand: null,
    recovering: false,
    recoveryNotes: [],
    scene: null,
    sceneId: '',
    session: null,
  };
}

/**
 * Everything that describes a table, cleared.
 *
 * Identity, credential presence and diagnostics visibility deliberately
 * survive: the first two are what the caller is switching *to*, and the third
 * is an operator preference about the tool rather than a fact about the game.
 *
 * Known character IDs survive a plain clear because Recover needs them to ask
 * for the characters again. They are dropped only when the caller says the seat
 * itself changed.
 */
function clearReadModels(
  state: RuntimeSessionState,
  clearKnownCharacterIds = false,
): RuntimeSessionState {
  return {
    ...state,
    activeScene: null,
    charactersByParticipant: {},
    commandError: null,
    connection: 'idle',
    connectionError: null,
    encounter: null,
    knownCharacterIdsByParticipant: clearKnownCharacterIds
      ? {}
      : state.knownCharacterIdsByParticipant,
    knownScenesById: {},
    pendingCommand: null,
    recovering: false,
    recoveryNotes: [],
    scene: null,
    sceneId: '',
    session: null,
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

      // Adopting the ID of the session already held is the identity catching up
      // to a snapshot that just arrived, not a move to another table. Creating
      // or joining a session is exactly this shape: the server names the table
      // in its response, and the browser only learns the ID from that response.
      // Treating it as a switch would clear the snapshot that caused it and
      // leave the client holding a session it cannot name.
      if (
        state.session &&
        identity.sessionId === state.session.session.id &&
        identity.mode === state.identity.mode &&
        identity.participantId === state.identity.participantId
      ) {
        return { ...state, identity };
      }

      // Any part of identity changing invalidates all of it. A seat's
      // credential belongs to that seat, so it goes too - carrying it across a
      // switch is how a client ends up authenticated as somebody else.
      //
      // Known character IDs are dropped only when the table changes. Switching
      // role or seat within one session leaves the same characters addressable.
      return {
        ...clearReadModels(
          state,
          identity.sessionId !== state.identity.sessionId,
        ),
        hasCredential: false,
        identity,
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
    case 'scene_remembered':
      return rememberScene(state, action.scene);
    case 'scene_cleared':
      return state.scene === null && state.activeScene === null
        ? state
        : { ...state, activeScene: null, scene: null };
    case 'active_scene_received':
      return applyActiveScene(state, action.activeScene);
    case 'encounter_received':
      return applyEncounter(state, action.encounter);
    case 'character_remembered':
      return rememberCharacter(state, action.character);
    case 'known_character_ids_restored':
      return {
        ...state,
        knownCharacterIdsByParticipant: {
          ...action.knownCharacterIdsByParticipant,
          ...state.knownCharacterIdsByParticipant,
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
      return { ...state, commandError: null, pendingCommand: action.label };
    case 'command_succeeded':
      return { ...state, commandError: null, pendingCommand: null };
    case 'command_failed':
      return { ...state, commandError: action.message, pendingCommand: null };
    case 'diagnostics_toggled':
      return state.diagnosticsOpen === action.open
        ? state
        : { ...state, diagnosticsOpen: action.open };
    case 'read_models_cleared':
      return clearReadModels(state, action.clearKnownCharacterIds);
  }
}
