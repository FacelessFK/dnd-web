import assert from 'node:assert/strict';
import type { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
  activeSceneStateCommandSuccessSchema,
  type CharacterCommandResponse,
  type EncounterCommandResponse,
  type MovementCommandResponse,
  type SessionCommandResponse,
  characterCommandSchema,
  clientCommandSchema,
  encounterCommandSchema,
  encounterCommandSuccessSchema,
  movementCommandSchema,
  sceneCommandSchema,
  sessionStreamEventSchema,
  type SessionStreamEvent,
} from '@dnd/protocol';

import { InMemoryCommandIdempotencyStore } from './command-idempotency-store.js';
import { InMemoryGameRuntime } from './game-runtime.js';
import { handleRequest } from './session-server.js';
import { InMemorySessionStore } from './session-store.js';

type JsonResponse<T> = {
  body: T;
  status: number;
};

async function postJson<TResponse>(
  runtime: InMemoryGameRuntime,
  idempotency: InMemoryCommandIdempotencyStore,
  path: string,
  body: unknown,
): Promise<JsonResponse<TResponse>> {
  const request = Readable.from([JSON.stringify(body)]) as Readable & {
    headers: IncomingHttpHeaders;
    method?: string;
    url?: string;
  };
  const response = createMockResponse();

  request.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1',
  };
  request.method = 'POST';
  request.url = path;

  await handleRequest(
    request as never,
    response as never,
    runtime,
    idempotency,
  );

  return {
    status: response.statusCode,
    body: JSON.parse(response.body) as TResponse,
  };
}

function createMockResponse() {
  return {
    body: '',
    headers: new Map<string, string | number | readonly string[]>(),
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    end(chunk?: unknown) {
      if (chunk != null) {
        this.body += String(chunk);
      }

      this.writableEnded = true;
      return this;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      this.headers.set(name.toLowerCase(), value);
      return this;
    },
    write(chunk: unknown) {
      this.body += String(chunk);
      return true;
    },
    writeHead(
      statusCode: number,
      headers?: Record<string, string | number | readonly string[]>,
    ) {
      this.statusCode = statusCode;
      this.headersSent = true;

      if (headers) {
        for (const [name, value] of Object.entries(headers)) {
          this.setHeader(name, value);
        }
      }

      return this;
    },
  };
}

function subscribeToSessionEvents(
  runtime: InMemoryGameRuntime,
  sessionId: string,
) {
  const updates: SessionStreamEvent[] = [];

  runtime.connectParticipant(sessionId, 'dm-001', {
    connectionId: `test-dm-stream-${sessionId}`,
    close: () => undefined,
    send: (update) => {
      updates.push(update);
    },
  });

  return updates;
}

function getEncounterUpdates(updates: SessionStreamEvent[]) {
  return updates.filter((update) => update.type === 'encounter_state');
}

function getCombatEvents(updates: SessionStreamEvent[]) {
  return updates.filter((update) => update.type === 'combat_event');
}

function setupEncounterForIdempotency(runtime: InMemoryGameRuntime) {
  const session = runtime.createSession({
    commandId: 'setup-create-session',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'dnd5e-2024-core',
    },
  });

  runtime.joinSession({
    commandId: 'setup-join-player-1',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });
  runtime.joinSession({
    commandId: 'setup-join-player-2',
    type: 'join_session',
    actor: {
      participantId: 'player-002',
      displayName: 'Player Two',
      role: 'player',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });

  const firstCharacter = createCharacterForIdempotency(
    runtime,
    session.sessionId,
    'player-001',
    {
      name: 'Aria',
      armorClass: 13,
      abilities: {
        str: 8,
        dex: 14,
        con: 13,
        int: 16,
        wis: 12,
        cha: 10,
      },
      hp: {
        max: 26,
        current: 26,
        temp: 0,
      },
    },
  );
  const secondCharacter = createCharacterForIdempotency(
    runtime,
    session.sessionId,
    'player-002',
    {
      name: 'Borin',
      armorClass: 16,
      abilities: {
        str: 16,
        dex: 12,
        con: 14,
        int: 10,
        wis: 10,
        cha: 8,
      },
      hp: {
        max: 34,
        current: 34,
        temp: 0,
      },
    },
  );

  assignCharacterForIdempotency(
    runtime,
    session.sessionId,
    'player-001',
    firstCharacter.character.id,
  );
  assignCharacterForIdempotency(
    runtime,
    session.sessionId,
    'player-002',
    secondCharacter.character.id,
  );

  const scene = runtime.createScene({
    commandId: 'setup-create-scene',
    type: 'create_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      scene: {
        name: 'Reliability Test Arena',
        grid: {
          width: 8,
          height: 8,
          cellSizeFeet: 5,
        },
      },
    },
  });

  runtime.activateSceneForSession({
    commandId: 'setup-activate-scene',
    type: 'activate_scene_for_session',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      sceneId: scene.id,
    },
  });
  placeCharacterForIdempotency(runtime, session.sessionId, 'player-001', {
    x: 0,
    y: 0,
  });
  placeCharacterForIdempotency(runtime, session.sessionId, 'player-002', {
    x: 1,
    y: 0,
  });

  runtime.startEncounter({
    commandId: 'setup-start-encounter',
    type: 'start_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });

  return {
    firstCharacterId: firstCharacter.character.id,
    secondCharacterId: secondCharacter.character.id,
    sessionId: session.sessionId,
  };
}

function createCharacterForIdempotency(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  overrides: {
    abilities: {
      cha: number;
      con: number;
      dex: number;
      int: number;
      str: number;
      wis: number;
    };
    armorClass: number;
    hp: {
      current: number;
      max: number;
      temp: number;
    };
    name: string;
  },
) {
  return runtime.createCharacter({
    commandId: `setup-create-character-${participantId}`,
    type: 'create_character',
    actor: {
      participantId,
    },
    payload: {
      sessionId,
      ownerParticipantId: participantId,
      character: {
        name: overrides.name,
        level: 5,
        className: 'Fighter',
        speciesOrRace: 'Human',
        background: 'Soldier',
        abilities: overrides.abilities,
        hp: overrides.hp,
        armorClass: overrides.armorClass,
        speed: 30,
        notes: null,
        meta: {},
      },
    },
  });
}

function assignCharacterForIdempotency(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  characterId: string,
) {
  runtime.assignCharacterToParticipant({
    commandId: `setup-assign-character-${participantId}`,
    type: 'assign_character_to_participant',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId,
      characterId,
    },
  });
}

function placeCharacterForIdempotency(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  position: {
    x: number;
    y: number;
  },
) {
  runtime.placeCharacterInActiveScene({
    commandId: `setup-place-character-${participantId}`,
    type: 'place_character_in_active_scene',
    actor: {
      participantId,
    },
    payload: {
      sessionId,
      participantId,
      position,
    },
  });
}

test('invalid session IDs are rejected by command validation', () => {
  const result = clientCommandSchema.safeParse({
    commandId: 'invalid-join',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId: 'bad-id',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'sessionId']);
});

test('invalid rules profile IDs are rejected during session command validation', () => {
  const result = clientCommandSchema.safeParse({
    commandId: 'invalid-create',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'INVALID PROFILE',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'rulesProfileId']);
});

test('invalid ability score shapes are rejected for character creation', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'create-character-invalid-abilities',
    type: 'create_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 1,
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 0,
          dex: 14,
          con: 12,
          int: 16,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'character',
    'abilities',
    'str',
  ]);
});

test('invalid level ranges are rejected for character creation', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'create-character-invalid-level',
    type: 'create_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 21,
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 8,
          dex: 14,
          con: 12,
          int: 16,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'character',
    'level',
  ]);
});

test('invalid character IDs are rejected for character retrieval', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'get-character-invalid-id',
    type: 'get_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      characterId: 'character-1',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'characterId']);
});

test('invalid scene IDs are rejected for scene retrieval', () => {
  const result = sceneCommandSchema.safeParse({
    commandId: 'get-scene-invalid-id',
    type: 'get_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      sceneId: 'scene-one',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'sceneId']);
});

test('invalid grid sizes are rejected for scene creation', () => {
  const result = sceneCommandSchema.safeParse({
    commandId: 'create-scene-invalid-grid',
    type: 'create_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      scene: {
        name: 'Broken Grid',
        grid: {
          width: 0,
          height: 8,
        },
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'scene',
    'grid',
    'width',
  ]);
});

test('invalid update payloads are rejected for character updates', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'update-character-invalid',
    type: 'update_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      characterId: 'char_11111111-1111-4111-8111-111111111111',
      character: {
        name: '',
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 8,
          dex: 14,
          con: 12,
          int: 16,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'character',
    'name',
  ]);
});

test('invalid movement target positions are rejected for movement commands', () => {
  const result = movementCommandSchema.safeParse({
    commandId: 'move-character-invalid-target',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      participantId: 'player-001',
      position: {
        x: -1,
        y: 0,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'position', 'x']);
});

test('active-scene state read commands are accepted by movement command validation', () => {
  const result = movementCommandSchema.safeParse({
    commandId: 'get-active-scene-state-1',
    type: 'get_active_scene_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });

  assert.equal(result.success, true);
});

test('encounter commands are accepted for narrow start/read/advance validation', () => {
  const startResult = encounterCommandSchema.safeParse({
    commandId: 'start-encounter-1',
    type: 'start_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const readResult = encounterCommandSchema.safeParse({
    commandId: 'get-encounter-state-1',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const advanceResult = encounterCommandSchema.safeParse({
    commandId: 'advance-turn-1',
    type: 'advance_turn',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const useActionResult = encounterCommandSchema.safeParse({
    commandId: 'use-action-1',
    type: 'use_action',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const useBonusActionResult = encounterCommandSchema.safeParse({
    commandId: 'use-bonus-action-1',
    type: 'use_bonus_action',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const useReactionResult = encounterCommandSchema.safeParse({
    commandId: 'use-reaction-1',
    type: 'use_reaction',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const recordMovementUsageResult = encounterCommandSchema.safeParse({
    commandId: 'record-movement-usage-1',
    type: 'record_movement_usage',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      amountFeet: 10,
    },
  });
  const attackResult = encounterCommandSchema.safeParse({
    commandId: 'attack-1',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      targetParticipantId: 'player-002',
    },
  });

  assert.equal(startResult.success, true);
  assert.equal(readResult.success, true);
  assert.equal(advanceResult.success, true);
  assert.equal(useActionResult.success, true);
  assert.equal(useBonusActionResult.success, true);
  assert.equal(useReactionResult.success, true);
  assert.equal(recordMovementUsageResult.success, true);
  assert.equal(attackResult.success, true);
});

test('invalid encounter movement-usage payloads are rejected during command validation', () => {
  const result = encounterCommandSchema.safeParse({
    commandId: 'record-movement-usage-invalid',
    type: 'record_movement_usage',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      amountFeet: 0,
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'amountFeet']);
});

test('encounter success payloads are validated as authoritative turn-order responses', () => {
  const result = encounterCommandSuccessSchema.safeParse({
    ok: true,
    data: {
      encounter: {
        id: 'encounter_11111111-1111-4111-8111-111111111111',
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        status: 'active',
        participants: [
          {
            characterId: 'char_11111111-1111-4111-8111-111111111111',
            participantId: 'player-001',
            initiative: 2,
          },
        ],
        currentTurnIndex: 0,
        roundNumber: 1,
        currentTurnUsage: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          movementUsed: 0,
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    },
  });

  assert.equal(result.success, true);
});

test('duplicate mutating encounter commands return cached success without duplicate SSE', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const command = {
    commandId: 'idempotent-use-action-1',
    type: 'use_action',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  };
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const first = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
  );
  const second = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
  );
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdatesBefore,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'action_used');
});

test('duplicate attack commands do not reroll, double damage, or duplicate SSE', async () => {
  let rollCount = 0;
  const runtime = new InMemoryGameRuntime(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => {
      rollCount += 1;
      return 20;
    },
  );
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { secondCharacterId, sessionId } =
    setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const command = {
    commandId: 'idempotent-attack-1',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      targetParticipantId: 'player-002',
    },
  };
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const combatEventsBefore = getCombatEvents(updates).length;
  const first = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
  );
  const second = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
  );
  const target = runtime.characters.getCharacter(secondCharacterId);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(rollCount, 1);
  assert.equal(target.character.hp.current, 33);
  assert.equal(getEncounterUpdates(updates).length - encounterUpdatesBefore, 1);
  assert.equal(getCombatEvents(updates).length - combatEventsBefore, 1);
});

test('command ID conflicts are rejected without runtime mutation or SSE', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const firstCommand = {
    commandId: 'conflicting-record-movement-1',
    type: 'record_movement_usage',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      amountFeet: 5,
    },
  };
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      sessionId,
      amountFeet: 10,
    },
  };
  const first = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    firstCommand,
  );
  const encounterUpdatesBeforeConflict = getEncounterUpdates(updates).length;
  const conflict = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    conflictingCommand,
  );
  const encounter = runtime.getEncounterState({
    commandId: 'read-after-conflict',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  if (conflict.body.ok) {
    return;
  }
  assert.equal(conflict.body.error.code, 'command_id_conflict');
  assert.equal(encounter.currentTurnUsage.movementUsed, 5);
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdatesBeforeConflict,
  );
});

test('read commands are not cached as idempotent mutations', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);

  const readCommand = {
    commandId: 'repeat-read-encounter-1',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  };
  const firstRead = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    readCommand,
  );

  await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    {
      commandId: 'mutate-between-repeat-reads',
      type: 'use_action',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
      },
    },
  );

  const secondRead = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    readCommand,
  );

  assert.equal(firstRead.status, 200);
  assert.equal(secondRead.status, 200);
  assert.equal(firstRead.body.ok, true);
  assert.equal(secondRead.body.ok, true);
  if (!firstRead.body.ok || !secondRead.body.ok) {
    return;
  }
  assert.equal(
    firstRead.body.data.encounter.currentTurnUsage.actionUsed,
    false,
  );
  assert.equal(
    secondRead.body.data.encounter.currentTurnUsage.actionUsed,
    true,
  );
});

test('reconnect returns the current session snapshot with active scene and character assignments', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { firstCharacterId, secondCharacterId, sessionId } =
    setupEncounterForIdempotency(runtime);

  const reconnect = await postJson<SessionCommandResponse>(
    runtime,
    idempotency,
    '/api/session/command',
    {
      commandId: 'reconnect-snapshot-consistency-1',
      type: 'reconnect_session',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
      },
    },
  );

  assert.equal(reconnect.status, 200);
  assert.equal(reconnect.body.ok, true);

  if (!reconnect.body.ok) {
    return;
  }

  const playerOne = reconnect.body.data.state.participants.find(
    (participant) => participant.id === 'player-001',
  );
  const playerTwo = reconnect.body.data.state.participants.find(
    (participant) => participant.id === 'player-002',
  );

  assert.equal(reconnect.body.data.sessionId, sessionId);
  assert.equal(reconnect.body.data.participantId, 'player-001');
  assert.ok(reconnect.body.data.streamPath.includes(sessionId));
  assert.ok(reconnect.body.data.streamPath.includes('player-001'));
  assert.notEqual(reconnect.body.data.state.session.activeSceneId, null);
  assert.equal(playerOne?.characterId, firstCharacterId);
  assert.equal(playerTwo?.characterId, secondCharacterId);
});

test('reconnecting participants can recover movement, encounter, and character HP through read models', async () => {
  const runtime = new InMemoryGameRuntime(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => 20,
  );
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { secondCharacterId, sessionId } =
    setupEncounterForIdempotency(runtime);

  runtime.moveCharacterInActiveScene({
    commandId: 'reconnect-move-before-read',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      position: {
        x: 1,
        y: 1,
      },
    },
  });
  runtime.attack({
    commandId: 'reconnect-attack-before-read',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      targetParticipantId: 'player-002',
    },
  });

  await postJson<SessionCommandResponse>(
    runtime,
    idempotency,
    '/api/session/command',
    {
      commandId: 'reconnect-before-read-models',
      type: 'reconnect_session',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
      },
    },
  );

  const activeSceneRead = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    {
      commandId: 'read-active-scene-after-reconnect',
      type: 'get_active_scene_state',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
      },
    },
  );
  const encounterRead = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    {
      commandId: 'read-encounter-after-reconnect',
      type: 'get_encounter_state',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
      },
    },
  );
  const characterRead = await postJson<CharacterCommandResponse>(
    runtime,
    idempotency,
    '/api/characters/command',
    {
      commandId: 'read-character-hp-after-reconnect',
      type: 'get_character',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
        characterId: secondCharacterId,
      },
    },
  );

  assert.equal(activeSceneRead.status, 200);
  assert.equal(activeSceneRead.body.ok, true);
  assert.equal(encounterRead.status, 200);
  assert.equal(encounterRead.body.ok, true);
  assert.equal(characterRead.status, 200);
  assert.equal(characterRead.body.ok, true);

  if (
    !activeSceneRead.body.ok ||
    !encounterRead.body.ok ||
    !characterRead.body.ok
  ) {
    return;
  }

  assert.ok('placedCharacters' in activeSceneRead.body.data);
  assert.ok('character' in characterRead.body.data);

  const playerOnePlacement = activeSceneRead.body.data.placedCharacters.find(
    (placement) => placement.participantId === 'player-001',
  );
  const playerTwoPlacement = activeSceneRead.body.data.placedCharacters.find(
    (placement) => placement.participantId === 'player-002',
  );

  assert.deepEqual(playerOnePlacement?.position, {
    x: 1,
    y: 1,
  });
  assert.deepEqual(playerTwoPlacement?.position, {
    x: 1,
    y: 0,
  });
  assert.equal(encounterRead.body.data.encounter.currentTurnIndex, 0);
  assert.equal(encounterRead.body.data.encounter.roundNumber, 1);
  assert.equal(encounterRead.body.data.encounter.participants.length, 2);
  assert.equal(
    encounterRead.body.data.encounter.currentTurnUsage.actionUsed,
    true,
  );
  assert.equal(
    encounterRead.body.data.encounter.currentTurnUsage.movementUsed,
    10,
  );
  assert.equal(characterRead.body.data.character.hp.current, 33);
});

test('reconnected SSE subscribers receive current session state without combat event replay', () => {
  const runtime = new InMemoryGameRuntime(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => 20,
  );
  const { firstCharacterId, sessionId } = setupEncounterForIdempotency(runtime);
  const liveUpdates: SessionStreamEvent[] = [];
  const reconnectUpdates: SessionStreamEvent[] = [];

  runtime.connectParticipant(sessionId, 'player-001', {
    connectionId: 'player-001-live-stream',
    close: () => undefined,
    send: (update) => {
      liveUpdates.push(update);
    },
  });
  runtime.attack({
    commandId: 'attack-before-sse-reconnect',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      targetParticipantId: 'player-002',
    },
  });

  assert.equal(
    liveUpdates.some((update) => update.type === 'combat_event'),
    true,
  );

  runtime.reconnectSession({
    commandId: 'reconnect-before-sse-resubscribe',
    type: 'reconnect_session',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });
  runtime.connectParticipant(sessionId, 'player-001', {
    connectionId: 'player-001-reconnected-stream',
    close: () => undefined,
    send: (update) => {
      reconnectUpdates.push(update);
    },
  });

  assert.equal(reconnectUpdates.length, 1);
  assert.equal(reconnectUpdates[0]?.type, 'session_state');
  assert.equal(reconnectUpdates[0]?.reason, 'initial_sync');

  if (reconnectUpdates[0]?.type !== 'session_state') {
    return;
  }

  const playerOne = reconnectUpdates[0].state.participants.find(
    (participant) => participant.id === 'player-001',
  );

  assert.equal(reconnectUpdates[0].state.session.id, sessionId);
  assert.notEqual(reconnectUpdates[0].state.session.activeSceneId, null);
  assert.equal(playerOne?.characterId, firstCharacterId);
  assert.equal(
    reconnectUpdates.some((update) => update.type === 'combat_event'),
    false,
  );
});

test('connected subscribers receive synchronized session state updates', () => {
  const store = new InMemorySessionStore();
  const created = store.createSession({
    commandId: 'create-1',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'dnd5e-2024-core',
    },
  });
  const receivedUpdates: SessionStreamEvent[] = [];

  store.connectParticipant(created.sessionId, 'dm-001', {
    connectionId: 'dm-connection-1',
    close: () => undefined,
    send: (update) => {
      receivedUpdates.push(update);
    },
  });

  store.joinSession({
    commandId: 'join-1',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId: created.sessionId,
    },
  });

  const latestUpdate = receivedUpdates.at(-1);

  assert.ok(latestUpdate);
  assert.equal(latestUpdate?.type, 'session_state');

  if (!latestUpdate || latestUpdate.type !== 'session_state') {
    return;
  }

  assert.equal(latestUpdate.reason, 'participant_joined');
  assert.equal(latestUpdate.state.participants.length, 2);
  assert.equal(
    latestUpdate.state.participants.find(
      (participant) => participant.id === 'player-001',
    )?.connectionStatus,
    'disconnected',
  );
  assert.equal(latestUpdate.revision, 3);
});

test('movement session-stream updates are validated as a narrow realtime payload', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'movement_state',
    reason: 'character_moved',
    sessionId: 'ABC123',
    activeSceneId: 'scene_11111111-1111-4111-8111-111111111111',
    participantId: 'player-001',
    characterId: 'char_11111111-1111-4111-8111-111111111111',
    position: {
      x: 2,
      y: 3,
    },
    footprint: {
      width: 1,
      height: 1,
    },
  });

  assert.equal(result.success, true);
});

test('encounter session-stream updates are validated as authoritative realtime payloads', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'encounter_state',
    reason: 'turn_advanced',
    sessionId: 'ABC123',
    encounter: {
      id: 'encounter_11111111-1111-4111-8111-111111111111',
      sessionId: 'ABC123',
      sceneId: 'scene_11111111-1111-4111-8111-111111111111',
      status: 'active',
      participants: [
        {
          characterId: 'char_11111111-1111-4111-8111-111111111111',
          participantId: 'player-001',
          initiative: 2,
        },
      ],
      currentTurnIndex: 0,
      roundNumber: 2,
      currentTurnUsage: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: 0,
      },
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:01:00.000Z',
    },
  });

  assert.equal(result.success, true);
});

test('combat session-stream updates are validated as authoritative attack payloads', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'combat_event',
    reason: 'attack_resolved',
    sessionId: 'ABC123',
    encounterId: 'encounter_11111111-1111-4111-8111-111111111111',
    attackerParticipantId: 'player-001',
    attackerCharacterId: 'char_11111111-1111-4111-8111-111111111111',
    targetParticipantId: 'player-002',
    targetCharacterId: 'char_22222222-2222-4222-8222-222222222222',
    roll: {
      d20: 14,
      modifier: 2,
      total: 16,
    },
    targetArmorClass: 16,
    hit: true,
    damage: 1,
    targetHp: {
      previous: 10,
      current: 9,
    },
  });

  assert.equal(result.success, true);
});

test('active-scene state success payloads are validated as a narrow read model', () => {
  const result = activeSceneStateCommandSuccessSchema.safeParse({
    ok: true,
    data: {
      sessionId: 'ABC123',
      activeSceneId: 'scene_11111111-1111-4111-8111-111111111111',
      placedCharacters: [
        {
          characterId: 'char_11111111-1111-4111-8111-111111111111',
          participantId: 'player-001',
          position: {
            x: 2,
            y: 3,
          },
          footprint: {
            width: 1,
            height: 1,
          },
        },
      ],
    },
  });

  assert.equal(result.success, true);
});
