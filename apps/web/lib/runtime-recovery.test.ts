import assert from 'node:assert/strict';
import test from 'node:test';

import type { CharacterResource, Scene } from '@dnd/protocol';

import type { SessionSnapshot } from './runtime-cockpit-helpers';
import {
  recoverSeat,
  type RecoveryRequest,
  type RecoveryTransport,
} from './runtime-recovery';

/**
 * Recovery is the flow whose ordering and fail-open/fail-closed split used to be
 * unobservable without a browser. These fakes make each decision an assertion:
 * the transport records what was asked for, so "which reads were even attempted"
 * is something a test can read off the log.
 */
type SentCommand = { channel: string; command: Record<string, unknown> };

function createSnapshot(
  overrides: Partial<SessionSnapshot['session']> = {},
  participants: SessionSnapshot['participants'] = [],
): SessionSnapshot {
  return {
    session: {
      id: 'ABC123',
      status: 'lobby',
      dmParticipantId: 'dm-001',
      playerParticipantIds: ['player-001'],
      rulesProfileId: 'dnd5e-2024-core',
      activeSceneId: 'scene_1',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
      revision: 3,
      ...overrides,
    },
    participants,
  };
}

function createParticipant(
  overrides: Partial<SessionSnapshot['participants'][number]> = {},
): SessionSnapshot['participants'][number] {
  return {
    id: 'player-001',
    displayName: 'Rin',
    role: 'player',
    connectionStatus: 'connected',
    joinedAt: '2026-08-01T10:00:00.000Z',
    lastSeenAt: '2026-08-01T10:00:00.000Z',
    characterId: null,
    pendingCharacterId: null,
    ...overrides,
  };
}

function createScene(): Scene {
  return {
    id: 'scene_1',
    sessionId: 'ABC123',
    name: 'Sunken Chapel',
    grid: { width: 10, height: 10, cellSizeFeet: 5 },
    terrain: null,
    entities: [],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  };
}

function createCharacter(id: string): CharacterResource {
  return {
    character: {
      id,
      sessionId: 'ABC123',
      ownerParticipantId: 'player-001',
      name: 'Rin',
      level: 1,
      hp: { current: 9, max: 9, temp: 0 },
      speedFeet: 30,
    },
    overlay: { activeConditions: [] },
  } as unknown as CharacterResource;
}

const request: RecoveryRequest = {
  displayName: 'Rin',
  knownCharacterIdsByParticipant: {},
  participantId: 'player-001',
  role: 'player',
  sessionId: 'ABC123',
};

/**
 * Build a transport whose every channel succeeds, then let a test override the
 * one channel it cares about. Starting from "everything is there" keeps each
 * test about a single absence rather than about assembling a whole table.
 */
function createTransport(
  overrides: Partial<RecoveryTransport> = {},
  sent: SentCommand[] = [],
): RecoveryTransport {
  const record =
    (channel: string, result: unknown) =>
    async (command: Record<string, unknown>) => {
      sent.push({ channel, command });

      return result;
    };

  return {
    sendSessionCommand: record('session', {
      ok: true,
      response: { data: { state: createSnapshot() } },
    }),
    sendSceneCommand: record('scene', {
      ok: true,
      response: { data: { scene: createScene() } },
    }),
    sendMovementCommand: record('movement', {
      ok: true,
      response: {
        data: {
          activeSceneId: 'scene_1',
          placedCharacters: [],
          sessionId: 'ABC123',
        },
      },
    }),
    sendEncounterCommand: record('encounter', {
      ok: true,
      response: { data: { encounter: null } },
    }),
    sendCharacterCommand: record('character', {
      ok: true,
      response: { data: createCharacter('character_1') },
    }),
    ...overrides,
  } as unknown as RecoveryTransport;
}

test('the session snapshot is read first and decides the rest', async () => {
  const sent: SentCommand[] = [];
  const outcome = await recoverSeat(request, createTransport({}, sent));

  assert.equal(sent[0]?.channel, 'session');
  assert.equal(sent[0]?.command.type, 'reconnect_session');
  assert.equal(outcome.session.session.id, 'ABC123');
  assert.deepEqual(outcome.notes, []);
});

test('a refused reconnect stops recovery rather than half-restoring the table', async () => {
  const sent: SentCommand[] = [];
  const transport = createTransport(
    {
      sendSessionCommand: (async () => ({
        ok: false,
        error: { code: 'participant_not_found', message: 'Unknown seat.' },
      })) as unknown as RecoveryTransport['sendSessionCommand'],
    },
    sent,
  );

  await assert.rejects(
    () => recoverSeat(request, transport),
    /reconnect_session failed\./,
  );

  // Nothing may be read on a seat the server just refused to re-admit.
  assert.deepEqual(
    sent.filter((entry) => entry.channel !== 'session'),
    [],
  );
});

test('a table with no active scene skips the scene reads entirely', async () => {
  const sent: SentCommand[] = [];
  const transport = createTransport(
    {
      sendSessionCommand: (async () => ({
        ok: true,
        response: { data: { state: createSnapshot({ activeSceneId: null }) } },
      })) as unknown as RecoveryTransport['sendSessionCommand'],
    },
    sent,
  );

  const outcome = await recoverSeat(request, transport);

  assert.equal(outcome.scene, null);
  assert.equal(outcome.activeScene, null);
  // A lobby is a valid table, so an absent scene is not an error to explain.
  assert.deepEqual(outcome.notes, []);
  assert.equal(
    sent.some((entry) => entry.channel === 'scene'),
    false,
  );
  assert.equal(
    sent.some((entry) => entry.channel === 'movement'),
    false,
  );
});

test('an expected absence becomes a note and recovery continues', async () => {
  const transport = createTransport({
    sendEncounterCommand: (async () => ({
      ok: false,
      error: { code: 'no_active_encounter', message: 'No encounter yet.' },
    })) as unknown as RecoveryTransport['sendEncounterCommand'],
  });

  const outcome = await recoverSeat(request, transport);

  assert.equal(outcome.encounter, null);
  assert.equal(outcome.notes.length, 1);
  // The note is the stable error code, so a surface can localize it
  // instead of showing a player a command name and an HTTP status.
  assert.equal(outcome.notes[0], 'no_active_encounter');
  // The scene still came back: one expected miss must not abort the sequence.
  assert.equal(outcome.scene?.id, 'scene_1');
});

test('an unexpected failure stops recovery instead of becoming a note', async () => {
  const transport = createTransport({
    sendEncounterCommand: (async () => ({
      ok: false,
      error: { code: 'forbidden_role', message: 'Not allowed.', status: 403 },
    })) as unknown as RecoveryTransport['sendEncounterCommand'],
  });

  await assert.rejects(
    () => recoverSeat(request, transport),
    /get_encounter_state failed\. HTTP 403: forbidden_role/,
  );
});

test('characters are read once each across assigned, pending and remembered sources', async () => {
  const sent: SentCommand[] = [];
  const transport = createTransport(
    {
      sendSessionCommand: (async () => ({
        ok: true,
        response: {
          data: {
            state: createSnapshot({}, [
              createParticipant({ characterId: 'character_1' }),
              createParticipant({
                id: 'player-002',
                pendingCharacterId: 'character_2',
              }),
            ]),
          },
        },
      })) as unknown as RecoveryTransport['sendSessionCommand'],
    },
    sent,
  );

  const outcome = await recoverSeat(
    {
      ...request,
      // Already assigned above; must not be fetched a second time.
      knownCharacterIdsByParticipant: {
        'player-001': 'character_1',
        'player-003': 'character_3',
      },
    },
    transport,
  );

  const characterIds = sent
    .filter((entry) => entry.channel === 'character')
    .map(
      (entry) => (entry.command.payload as { characterId: string }).characterId,
    );

  assert.deepEqual(characterIds, ['character_1', 'character_2', 'character_3']);
  assert.equal(outcome.characters.length, 3);
});

test('a character this browser remembered is re-read after a local reset', async () => {
  const sent: SentCommand[] = [];
  const transport = createTransport(
    {
      // The snapshot mentions nobody: the character was never assigned.
      sendSessionCommand: (async () => ({
        ok: true,
        response: { data: { state: createSnapshot({}, []) } },
      })) as unknown as RecoveryTransport['sendSessionCommand'],
    },
    sent,
  );

  const outcome = await recoverSeat(
    {
      ...request,
      knownCharacterIdsByParticipant: { 'player-001': 'character_9' },
    },
    transport,
  );

  assert.equal(outcome.characters.length, 1);
  assert.equal(
    (
      sent.find((entry) => entry.channel === 'character')?.command.payload as {
        characterId: string;
      }
    ).characterId,
    'character_9',
  );
});

test('a missing character is noted without losing the ones that resolved', async () => {
  let call = 0;
  const transport = createTransport({
    sendSessionCommand: (async () => ({
      ok: true,
      response: {
        data: {
          state: createSnapshot({}, [
            createParticipant({ characterId: 'character_1' }),
            createParticipant({ id: 'player-002', characterId: 'character_2' }),
          ]),
        },
      },
    })) as unknown as RecoveryTransport['sendSessionCommand'],
    sendCharacterCommand: (async () => {
      call += 1;

      return call === 1
        ? {
            ok: false,
            error: { code: 'character_not_found', message: 'Gone.' },
          }
        : { ok: true, response: { data: createCharacter('character_2') } };
    }) as unknown as RecoveryTransport['sendCharacterCommand'],
  });

  const outcome = await recoverSeat(request, transport);

  assert.equal(outcome.characters.length, 1);
  assert.equal(outcome.notes.length, 1);
  assert.equal(outcome.notes[0], 'character_not_found');
});

test('recovery never puts a participant token in a command payload', async () => {
  const sent: SentCommand[] = [];

  await recoverSeat(
    {
      ...request,
      knownCharacterIdsByParticipant: { 'player-001': 'character_1' },
    },
    createTransport({}, sent),
  );

  assert.ok(sent.length > 1);

  for (const entry of sent) {
    const serialized = JSON.stringify(entry.command);

    assert.equal(
      /token|credential|secret|bearer/i.test(serialized),
      false,
      `${entry.command.type as string} carried a credential-shaped field`,
    );
  }
});

test('every recovery command carries a distinct command ID', async () => {
  const sent: SentCommand[] = [];

  await recoverSeat(
    {
      ...request,
      knownCharacterIdsByParticipant: { 'player-001': 'character_1' },
    },
    createTransport({}, sent),
  );

  const commandIds = sent.map((entry) => entry.command.commandId as string);

  assert.equal(new Set(commandIds).size, commandIds.length);
  // The scope prefix is what makes an idempotency record readable in the outbox.
  assert.ok(commandIds.every((id) => id.startsWith('web-')));
});
