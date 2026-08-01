/**
 * Rebuilding a seat's whole view of the table from the server.
 *
 * Recovery is the one flow that has to distinguish "the server said no" from
 * "there is nothing there yet". A table with no scene, no encounter and no
 * characters is a perfectly good lobby, so a miss on those reads is a note, not
 * a failure; anything else is a real error and has to stop the sequence rather
 * than leave the client showing a half-restored table it will treat as current.
 *
 * The senders are injected so this sequence can be tested without a server. That
 * matters more here than anywhere else in the client: the ordering, the
 * fail-open/fail-closed split, and which reads are even attempted are the parts
 * that were previously buried in a 220-line function inside a 9,000-line
 * component and could only be exercised by driving a browser.
 *
 * Two things this deliberately does not do. It does not enable the stream -
 * subscription lifecycle belongs to the caller, because reopening the stream is
 * how the M1 table gets its `initial_sync` and that is a connection decision.
 * And it does not touch credentials: `reconnect_session` rotates the token when
 * the caller owns the seat, and storing it is the API layer's job.
 */
import type {
  ActiveSceneState,
  CharacterResource,
  Encounter,
  Scene,
} from '@dnd/protocol';

import {
  formatRuntimeFailure,
  getAssignedCharacterRefs,
  getPendingCharacterRefs,
  isExpectedRecoveryMiss,
  type SessionSnapshot,
} from './runtime-cockpit-helpers';
import {
  createCommandId,
  type RuntimeApiFailure,
  sendCharacterCommand,
  sendEncounterCommand,
  sendMovementCommand,
  sendSceneCommand,
  sendSessionCommand,
} from './runtime-api';

/** The command senders recovery needs, injectable for tests. */
export type RecoveryTransport = {
  sendCharacterCommand: typeof sendCharacterCommand;
  sendEncounterCommand: typeof sendEncounterCommand;
  sendMovementCommand: typeof sendMovementCommand;
  sendSceneCommand: typeof sendSceneCommand;
  sendSessionCommand: typeof sendSessionCommand;
};

export const defaultRecoveryTransport: RecoveryTransport = {
  sendCharacterCommand,
  sendEncounterCommand,
  sendMovementCommand,
  sendSceneCommand,
  sendSessionCommand,
};

export type RecoveryRequest = {
  displayName: string;
  /** Seat to character ID for characters this client held before resetting. */
  knownCharacterIdsByParticipant: Record<string, string>;
  participantId: string;
  role: 'dm' | 'player';
  sessionId: string;
};

export type RecoveryOutcome = {
  activeScene: ActiveSceneState | null;
  characters: CharacterResource[];
  encounter: Encounter | null;
  /**
   * Presentation-safe explanations of what was not there. Empty on a table that
   * had everything.
   */
  notes: string[];
  scene: Scene | null;
  session: SessionSnapshot;
};

/**
 * Re-read everything this seat is allowed to see.
 *
 * The session snapshot comes first and decides the rest: it names the active
 * scene, and without it there is nothing to recover into. Each later read is
 * projected for this participant by the server, so what comes back is already
 * this role's view - nothing here filters.
 */
export async function recoverSeat(
  request: RecoveryRequest,
  transport: RecoveryTransport = defaultRecoveryTransport,
): Promise<RecoveryOutcome> {
  const notes: string[] = [];
  const reconnected = await transport.sendSessionCommand({
    actor: {
      displayName: request.displayName,
      participantId: request.participantId,
      role: request.role,
    },
    commandId: createCommandId('reconnect'),
    payload: { sessionId: request.sessionId },
    type: 'reconnect_session',
  });

  if (!reconnected.ok) {
    throw new Error(
      formatRuntimeFailure('reconnect_session', reconnected.error),
    );
  }

  const session = reconnected.response.data.state;
  const activeSceneId = session.session.activeSceneId;
  const scene = activeSceneId
    ? await recoverScene(request, transport, activeSceneId, notes)
    : null;
  const activeScene = activeSceneId
    ? await recoverActiveScene(request, transport, notes)
    : null;
  const encounter = await recoverEncounter(request, transport, notes);
  const characters = await recoverCharacters(
    request,
    transport,
    session,
    notes,
  );

  return { activeScene, characters, encounter, notes, scene, session };
}

async function recoverScene(
  request: RecoveryRequest,
  transport: RecoveryTransport,
  sceneId: string,
  notes: string[],
): Promise<Scene | null> {
  const result = await transport.sendSceneCommand({
    actor: { participantId: request.participantId },
    commandId: createCommandId('get-scene'),
    payload: { sceneId, sessionId: request.sessionId },
    type: 'get_scene',
  });

  if (result.ok && 'scene' in result.response.data) {
    return result.response.data.scene;
  }

  if (result.ok) {
    return null;
  }

  return handleMiss('get_scene', result.error, notes);
}

async function recoverActiveScene(
  request: RecoveryRequest,
  transport: RecoveryTransport,
  notes: string[],
): Promise<ActiveSceneState | null> {
  const result = await transport.sendMovementCommand({
    actor: { participantId: request.participantId },
    commandId: createCommandId('get-active-scene'),
    payload: { sessionId: request.sessionId },
    type: 'get_active_scene_state',
  });

  if (result.ok && 'placedCharacters' in result.response.data) {
    return result.response.data;
  }

  if (result.ok) {
    return null;
  }

  return handleMiss('get_active_scene_state', result.error, notes);
}

async function recoverEncounter(
  request: RecoveryRequest,
  transport: RecoveryTransport,
  notes: string[],
): Promise<Encounter | null> {
  const result = await transport.sendEncounterCommand({
    actor: { participantId: request.participantId },
    commandId: createCommandId('get-encounter'),
    payload: { sessionId: request.sessionId },
    type: 'get_encounter_state',
  });

  if (result.ok) {
    return result.response.data.encounter;
  }

  return handleMiss('get_encounter_state', result.error, notes);
}

/**
 * Re-read every character this seat can name.
 *
 * Three sources, de-duplicated by character ID: assigned characters from the
 * snapshot, characters still pending assignment, and whatever this browser
 * remembered before it reset. The last one is why a client that cleared its view
 * can still get its own character back - the snapshot alone would not mention a
 * character that was never assigned.
 */
async function recoverCharacters(
  request: RecoveryRequest,
  transport: RecoveryTransport,
  session: SessionSnapshot,
  notes: string[],
): Promise<CharacterResource[]> {
  const refs = new Map<
    string,
    { characterId: string; participantId: string }
  >();

  for (const ref of getAssignedCharacterRefs(session)) {
    refs.set(ref.characterId, ref);
  }

  for (const ref of getPendingCharacterRefs(session)) {
    if (!refs.has(ref.characterId)) {
      refs.set(ref.characterId, ref);
    }
  }

  for (const [participantId, characterId] of Object.entries(
    request.knownCharacterIdsByParticipant,
  )) {
    if (characterId && !refs.has(characterId)) {
      refs.set(characterId, { characterId, participantId });
    }
  }

  const characters: CharacterResource[] = [];

  for (const ref of refs.values()) {
    const result = await transport.sendCharacterCommand({
      actor: { participantId: request.participantId },
      commandId: createCommandId(`get-character-${ref.participantId}`),
      payload: { characterId: ref.characterId, sessionId: request.sessionId },
      type: 'get_character',
    });

    if (result.ok && 'character' in result.response.data) {
      characters.push(result.response.data);
      continue;
    }

    if (!result.ok) {
      handleMiss('get_character', result.error, notes);
    }
  }

  return characters;
}

/**
 * An expected absence becomes a note; anything else stops recovery.
 *
 * Returning null for the expected case lets each caller read as "the value, or
 * nothing" instead of repeating the same three-branch shape five times.
 */
function handleMiss(
  label: string,
  error: RuntimeApiFailure,
  notes: string[],
): null {
  const message = formatRuntimeFailure(label, error);

  if (!isExpectedRecoveryMiss(error.code)) {
    throw new Error(message);
  }

  notes.push(message);

  return null;
}
