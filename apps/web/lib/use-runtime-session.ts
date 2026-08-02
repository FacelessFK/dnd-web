'use client';

/**
 * One seat, one subscription, one state path.
 *
 * Everything about "which table am I looking at and is it current" lives here:
 * the reducer, the identity that scopes it, the stream that feeds it, and the
 * recovery that rebuilds it. The cockpit used to own all four across roughly
 * thirty `useState` calls, and the failure mode was always the same shape - one
 * of them got updated on a switch and another did not, leaving the previous
 * table's map, HP or turn order on screen looking current.
 *
 * The invariant that makes that unexpressible: **identity changes only through
 * `switchIdentity`, and every switch clears the read models.** There is no code
 * path that changes a session, role or seat without wiping what was projected
 * for the old one.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import type { SessionStreamEvent } from '@dnd/protocol';

import {
  cockpitStorageKey,
  defaultDm,
  defaultPlayer,
  sanitizeSessionIdInput,
  type RuntimeMode,
  type StoredCockpitState,
} from './runtime-cockpit-helpers';
import {
  createRuntimeSessionState,
  runtimeSessionReducer,
  type RuntimeSessionAction,
  type RuntimeSessionState,
} from './runtime-session-state';
import { recoverSeat } from './runtime-recovery';
import { hasParticipantCredential } from './runtime-api';
import {
  useSessionStream,
  type SessionStreamStatus,
} from './use-session-stream';

/** The seats this browser can act as, independent of which one is active. */
export type RuntimeSeats = {
  dmDisplayName: string;
  dmParticipantId: string;
  mode: RuntimeMode;
  playerDisplayName: string;
  playerParticipantId: string;
  sessionId: string;
};

const defaultSeats: RuntimeSeats = {
  dmDisplayName: defaultDm.displayName,
  dmParticipantId: defaultDm.participantId,
  mode: 'dm',
  playerDisplayName: defaultPlayer.displayName,
  playerParticipantId: defaultPlayer.participantId,
  sessionId: '',
};

export type UseRuntimeSessionParams = {
  /**
   * Extra consumers of a projected frame - today, the M1 table model.
   *
   * They are called only for frames this hook accepted as belonging to the
   * current seat, so a listener cannot see traffic the reducer discarded as
   * stale or as another session's.
   */
  onStreamEvent?: (event: SessionStreamEvent) => void;
  /** Called whenever the seat changes, so dependent models can reset too. */
  onIdentityReset?: () => void;
};

export function useRuntimeSession(params: UseRuntimeSessionParams = {}) {
  const { onIdentityReset, onStreamEvent } = params;
  const [seats, setSeats] = useState<RuntimeSeats>(defaultSeats);
  const [hydrated, setHydrated] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(false);
  // Bumped to force a fresh subscription. The M1 table has no read command, so
  // reopening the stream is the only way to ask the server for its projection of
  // the requests, resolutions and intents this seat is allowed to see.
  const [streamEpoch, setStreamEpoch] = useState(0);

  const activeParticipantId =
    seats.mode === 'dm' ? seats.dmParticipantId : seats.playerParticipantId;
  const activeDisplayName =
    seats.mode === 'dm' ? seats.dmDisplayName : seats.playerDisplayName;

  const [state, dispatch] = useReducer(
    runtimeSessionReducer,
    {
      mode: defaultSeats.mode,
      participantId: defaultSeats.dmParticipantId,
      sessionId: '',
    },
    createRuntimeSessionState,
  );

  // Read inside callbacks that must see the newest state without being
  // re-created on every keystroke. Storing the value rather than deriving it
  // keeps the command context's identity stable across renders.
  const stateRef = useRef(state);
  stateRef.current = state;

  const onStreamEventRef = useRef(onStreamEvent);
  onStreamEventRef.current = onStreamEvent;

  const onIdentityResetRef = useRef(onIdentityReset);
  onIdentityResetRef.current = onIdentityReset;

  useEffect(() => {
    dispatch({
      identity: {
        mode: seats.mode,
        participantId: activeParticipantId,
        sessionId: seats.sessionId,
      },
      type: 'identity_changed',
    });
  }, [activeParticipantId, seats.mode, seats.sessionId]);

  /**
   * Take the table's ID from the snapshot the server sent.
   *
   * Creating or joining a session is the one flow where the browser does not
   * know the session ID until the response arrives, so the seat has to adopt it
   * rather than supply it. This is what puts the ID in the form, into
   * `localStorage`, and into the identity every later command is scoped to -
   * without it, a freshly created table is unreachable by its own creator.
   *
   * The reducer treats adopting a held session as a catch-up rather than a
   * switch, so the snapshot that triggered this is not cleared by it.
   */
  const heldSessionId = state.session?.session.id ?? '';

  useEffect(() => {
    if (heldSessionId && heldSessionId !== seats.sessionId) {
      setSeats((current) => ({ ...current, sessionId: heldSessionId }));
    }
  }, [heldSessionId, seats.sessionId]);

  // --- persistence ---------------------------------------------------------

  useEffect(() => {
    const raw = localStorage.getItem(cockpitStorageKey);

    if (raw) {
      try {
        const stored = JSON.parse(raw) as StoredCockpitState;

        setSeats({
          dmDisplayName: stored.dmDisplayName ?? defaultDm.displayName,
          dmParticipantId: stored.dmParticipantId ?? defaultDm.participantId,
          mode: stored.mode ?? 'dm',
          playerDisplayName:
            stored.playerDisplayName ?? defaultPlayer.displayName,
          playerParticipantId:
            stored.playerParticipantId ?? defaultPlayer.participantId,
          sessionId: stored.sessionId ?? '',
        });
        dispatch({
          knownCharacterIdsByParticipant: stored.charactersByParticipant ?? {},
          type: 'known_character_ids_restored',
        });
      } catch {
        localStorage.removeItem(cockpitStorageKey);
      }
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      // Writing before the read completes would persist the defaults over
      // whatever this browser had, turning a reload into a reset.
      return;
    }

    const stored: StoredCockpitState = {
      charactersByParticipant: state.knownCharacterIdsByParticipant,
      dmDisplayName: seats.dmDisplayName,
      dmParticipantId: seats.dmParticipantId,
      mode: seats.mode,
      playerDisplayName: seats.playerDisplayName,
      playerParticipantId: seats.playerParticipantId,
      sceneId: state.sceneId,
      sessionId: seats.sessionId,
    };

    localStorage.setItem(cockpitStorageKey, JSON.stringify(stored));
  }, [hydrated, seats, state.knownCharacterIdsByParticipant, state.sceneId]);

  // --- subscription --------------------------------------------------------

  /**
   * Accept a frame only if it still belongs to the seat that is subscribed.
   *
   * `useSessionStream` closes its `EventSource` in cleanup, so a frame after a
   * switch should be impossible - but "should be impossible" is how the previous
   * version let one table's state land on another. The identity comparison makes
   * it actually impossible, and costs one string compare.
   */
  const handleStreamEvent = useCallback((event: SessionStreamEvent) => {
    const identity = stateRef.current.identity;

    if (identity.sessionId && event.sessionId !== identity.sessionId) {
      return;
    }

    dispatch({ event, type: 'stream_event' });
    onStreamEventRef.current?.(event);
  }, []);

  /**
   * Read every render so the subscription effect sees the credential appear.
   *
   * The credential is issued by a command response and kept outside React, so
   * nothing re-renders when it is stored. What does re-render is the reducer
   * state the same response dispatches - and this line is evaluated on that
   * render, which is what turns "the join finished" into a dependency change
   * the stream effect can act on.
   */
  const hasCredential = hasParticipantCredential(
    seats.sessionId || null,
    activeParticipantId,
  );

  const stream = useSessionStream({
    enabled: streamEnabled,
    hasCredential,
    onEvent: handleStreamEvent,
    participantId: activeParticipantId,
    resubscribeToken: streamEpoch,
    sessionId: seats.sessionId || null,
  });

  useEffect(() => {
    dispatch({
      status: mapStreamStatus(stream.status, streamEnabled),
      type: 'connection_changed',
    });
  }, [stream.status, streamEnabled]);

  // --- identity ------------------------------------------------------------

  /**
   * Change seat, and take the old seat's view down with it.
   *
   * Dropping the subscription first is deliberate: a stream opened for the
   * previous participant must not still be delivering while the new identity is
   * settling, and `useSessionStream` closes it synchronously on this change.
   */
  const switchIdentity = useCallback((next: Partial<RuntimeSeats>) => {
    setStreamEnabled(false);
    setSeats((current) => {
      const merged = { ...current, ...next };

      return next.sessionId === undefined
        ? merged
        : { ...merged, sessionId: sanitizeSessionIdInput(next.sessionId) };
    });
    dispatch({
      clearKnownCharacterIds: next.sessionId !== undefined,
      type: 'read_models_cleared',
    });
    onIdentityResetRef.current?.();
  }, []);

  /**
   * Clear this browser's view without giving up the seat.
   *
   * The participant credential deliberately survives. Local Reset means "clear
   * what this browser is showing", not "leave the table": re-entering the
   * session ID and recovering has to bring back the same participant, which is
   * what the smoke harnesses assert. Dropping the credential here would turn a
   * UI reset into an unrecoverable exit.
   */
  const resetLocal = useCallback(() => {
    localStorage.removeItem(cockpitStorageKey);
    setStreamEnabled(false);
    setSeats(defaultSeats);
    dispatch({ clearKnownCharacterIds: true, type: 'read_models_cleared' });
    onIdentityResetRef.current?.();
  }, []);

  // --- recovery ------------------------------------------------------------

  /**
   * Re-read the table and reopen the stream.
   *
   * The stream is bumped rather than merely enabled because the server sends
   * `initial_sync` once per connection, and the M1 table has no read command -
   * so a Recover that reused an open subscription would restore the map and the
   * encounter and silently leave the request, resolution and intent panels
   * empty.
   */
  const recover = useCallback(async () => {
    const identity = stateRef.current.identity;

    if (!identity.sessionId) {
      dispatch({
        message: 'Enter a session ID before recovering.',
        type: 'command_failed',
      });

      return;
    }

    dispatch({ label: 'recover read models', type: 'command_started' });
    dispatch({ type: 'recovery_started' });

    try {
      const outcome = await recoverSeat({
        displayName: activeDisplayName,
        knownCharacterIdsByParticipant:
          stateRef.current.knownCharacterIdsByParticipant,
        participantId: identity.participantId,
        role: identity.mode === 'dm' ? 'dm' : 'player',
        sessionId: identity.sessionId,
      });

      dispatch({ clearKnownCharacterIds: false, type: 'read_models_cleared' });
      dispatch({
        snapshot: outcome.session,
        type: 'session_snapshot_received',
      });

      if (outcome.scene) {
        dispatch({ scene: outcome.scene, type: 'scene_received' });
      }

      dispatch({
        activeScene: outcome.activeScene,
        type: 'active_scene_received',
      });
      dispatch({ encounter: outcome.encounter, type: 'encounter_received' });

      for (const character of outcome.characters) {
        dispatch({ character, type: 'character_remembered' });
      }

      onIdentityResetRef.current?.();
      setStreamEnabled(true);
      setStreamEpoch((current) => current + 1);
      dispatch({ notes: outcome.notes, type: 'recovery_finished' });
      dispatch({ type: 'command_succeeded' });

      return outcome;
    } catch (error) {
      dispatch({ notes: [], type: 'recovery_finished' });
      dispatch({
        message: error instanceof Error ? error.message : String(error),
        type: 'command_failed',
      });

      return undefined;
    }
  }, [activeDisplayName]);

  const actions = useMemo(
    () => ({
      recover,
      resetLocal,
      setDiagnosticsOpen: (open: boolean) =>
        dispatch({ open, type: 'diagnostics_toggled' }),
      switchIdentity,
      /** Re-open the subscription without re-reading over HTTP. */
      resubscribe: () => {
        setStreamEnabled(true);
        setStreamEpoch((current) => current + 1);
      },
      unsubscribe: () => setStreamEnabled(false),
    }),
    [recover, resetLocal, switchIdentity],
  );

  return {
    actions,
    activeDisplayName,
    activeParticipantId,
    dispatch: dispatch as (action: RuntimeSessionAction) => void,
    hydrated,
    seats,
    setSeats,
    state,
    stateRef,
    stream,
    streamEnabled,
  };
}

/**
 * Translate transport status into the connection state a shell renders.
 *
 * A subscription that was never asked for is `idle`, not `reconnecting`: a
 * player who has not recovered yet is not having connection trouble, and telling
 * them they are would send them chasing a problem that does not exist.
 */
function mapStreamStatus(
  status: SessionStreamStatus,
  enabled: boolean,
): RuntimeSessionState['connection'] {
  if (!enabled) {
    return 'idle';
  }

  return status === 'connected'
    ? 'connected'
    : status === 'reconnecting'
      ? 'reconnecting'
      : 'connecting';
}
