/**
 * The one shape every runtime command has.
 *
 * Each command family is a plain factory over this context, which is what makes
 * them testable: a test supplies fake senders and a recording store, and the
 * payload a command builds becomes an assertion instead of something only a
 * browser could observe. None of them touch React.
 *
 * `run` is deliberately the only way a command reaches the UI. It owns the
 * pending label, clears the previous error before starting, and turns a thrown
 * error into presentation-safe text - so no command has to remember to do any of
 * that, and none of them can report success by forgetting to.
 */
import type { RuntimeApiResult } from './runtime-api';
import type {
  ActiveSceneState,
  CharacterResource,
  Encounter,
  Scene,
} from '@dnd/protocol';

import {
  formatRuntimeFailure,
  type SessionSnapshot,
} from './runtime-cockpit-helpers';
import type { RuntimeSessionAction } from './runtime-session-state';

/** Who a command may act as. Read fresh per command, never captured. */
export type RuntimeCommandActors = {
  /** The seat whose turn is being taken: the selected token in DM mode. */
  acting: string;
  dm: string;
  player: string;
  /** The seat this browser is authenticated as. */
  stream: string;
  streamDisplayName: string;
  streamRole: 'dm' | 'player';
};

/**
 * Where a command's authoritative response goes.
 *
 * Every method takes something the server returned. There is no method for
 * "set the map to what I think it is", because a command that could do that
 * would be deciding state the server owns.
 */
export type RuntimeCommandStore = {
  applyActiveScene: (activeScene: ActiveSceneState | null) => void;
  applyEncounter: (encounter: Encounter | null) => void;
  applySessionSnapshot: (snapshot: SessionSnapshot) => void;
  clearReadModels: (options?: { clearKnownCharacterIds?: boolean }) => void;
  noteKnownCharacterId: (participantId: string, characterId: string) => void;
  rememberCharacter: (resource: CharacterResource) => void;
  rememberScene: (scene: Scene) => void;
};

export type RuntimeCommandContext = {
  getActors: () => RuntimeCommandActors;
  /** The active session ID, or a thrown error naming what to do about it. */
  requireSessionId: () => string;
  run: <T>(label: string, task: () => Promise<T>) => Promise<void>;
  store: RuntimeCommandStore;
  /** Unwrap an API result or throw its failure as presentation-safe text. */
  unwrap: <T>(
    label: string,
    result: Promise<RuntimeApiResult<T>>,
  ) => Promise<T>;
};

export type RuntimeCommandContextParams = {
  dispatch: (action: RuntimeSessionAction) => void;
  /** Read fresh per command so a command never acts as a stale seat. */
  getActors: () => RuntimeCommandActors;
  getSessionId: () => string;
  /** Diagnostics sink for the debug ledger. Never receives a credential. */
  onSettled?: (label: string, payload: unknown) => void;
};

/**
 * Build the context every command family runs on.
 *
 * Deliberately not a hook. The funnel that decides whether a command reports
 * success, and what a user reads when one fails, is the part most worth testing,
 * and a React-free factory means a test can drive it directly instead of through
 * a rendered component.
 */
export function createRuntimeCommandContext(
  params: RuntimeCommandContextParams,
): RuntimeCommandContext {
  const store: RuntimeCommandStore = {
    applyActiveScene: (activeScene) =>
      params.dispatch({ activeScene, type: 'active_scene_received' }),
    applyEncounter: (encounter) =>
      params.dispatch({ encounter, type: 'encounter_received' }),
    applySessionSnapshot: (snapshot) =>
      params.dispatch({ snapshot, type: 'session_snapshot_received' }),
    clearReadModels: (options) =>
      params.dispatch({
        clearKnownCharacterIds: options?.clearKnownCharacterIds,
        type: 'read_models_cleared',
      }),
    noteKnownCharacterId: (participantId, characterId) =>
      params.dispatch({
        knownCharacterIdsByParticipant: { [participantId]: characterId },
        type: 'known_character_ids_restored',
      }),
    rememberCharacter: (character) =>
      params.dispatch({ character, type: 'character_remembered' }),
    rememberScene: (scene) =>
      params.dispatch({ scene, type: 'scene_remembered' }),
  };

  return {
    getActors: () => params.getActors(),

    requireSessionId: () => {
      const sessionId = params.getSessionId();

      if (!sessionId) {
        throw new Error('Create or join a session first.');
      }

      return sessionId;
    },

    run: async <T>(label: string, task: () => Promise<T>) => {
      params.dispatch({ label, type: 'command_started' });

      try {
        const payload = await task();

        params.dispatch({ type: 'command_succeeded' });
        params.onSettled?.(label, payload);
      } catch (error) {
        params.dispatch({
          message: error instanceof Error ? error.message : String(error),
          type: 'command_failed',
        });
      }
    },

    store,

    unwrap: async <T>(label: string, result: Promise<RuntimeApiResult<T>>) => {
      const response = await result;

      if (!response.ok) {
        throw new Error(formatRuntimeFailure(label, response.error));
      }

      return response.response;
    },
  };
}

/**
 * Narrow a command response to the variant that carries a scene.
 *
 * Several scene commands share one response union, so the type system cannot
 * tell which arm came back. Failing loudly here beats writing `undefined` into
 * the map and rendering an empty board as though the GM had cleared it.
 */
export function requireSceneResponse<T extends { data: unknown }>(
  label: string,
  response: T,
): Scene {
  const data = response.data;

  if (!data || typeof data !== 'object' || !('scene' in data)) {
    throw new Error(`${label} returned a non-scene response.`);
  }

  return (data as { scene: Scene }).scene;
}

/**
 * Refuse to send a command built from an invalid draft.
 *
 * The errors are computed once by the caller - the same array the form renders -
 * rather than re-derived here, so the message a user reads and the reason a
 * command refused can never disagree. The disabled button is the affordance;
 * this is the guarantee, and it throws inside `run` so the failure surfaces the
 * same way every other command failure does.
 */
export function assertDraftValid(prefix: string, errors: string[]): void {
  if (errors.length) {
    throw new Error(`${prefix}: ${errors.join(' ')}`);
  }
}

export function requireCharacterResponse<T extends { data: unknown }>(
  label: string,
  response: T,
): CharacterResource {
  const data = response.data;

  if (!data || typeof data !== 'object' || !('character' in data)) {
    throw new Error(`${label} returned a non-character response.`);
  }

  return data as CharacterResource;
}
