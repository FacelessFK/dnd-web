/**
 * The M1 table commands as a client actually reaches them: over HTTP, holding a
 * server-issued credential, and watching a named SSE stream.
 *
 * `session-table-state.test.ts` already proves the transitions and the
 * projection without a transport. This file proves the transports use those
 * same rules - that the route enforces the role, that the idempotency layer
 * caches the *projected* answer, and that what a third player's stream receives
 * is not merely undrawn but absent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import type { IncomingHttpHeaders } from 'node:http';

import type {
  PlayerIntentCommandSuccess,
  ResolutionCommandSuccess,
} from '@dnd/protocol';

import { InMemoryCharacterStore } from './character-store.js';
import {
  InMemoryCommandIdempotencyStore,
  type CommandIdempotencyStore,
} from './command-idempotency-store.js';
import { InMemoryGameRuntime } from './game-runtime.js';
import {
  PARTICIPANT_TOKEN_HEADER,
  ParticipantCredentialStore,
} from './participant-credential-store.js';
import { handleRequest } from './session-server.js';

const RESOLUTION_PATH = '/api/resolutions/command';
const INTENT_PATH = '/api/intents/command';
const TEST_DAMAGE_DIE = 3;
const TEST_INITIATIVE = 10;

type Seat = 'dm-001' | 'player-001' | 'player-002';

type Table = {
  runtime: InMemoryGameRuntime<InMemoryCharacterStore>;
  idempotency: CommandIdempotencyStore;
  credentials: ParticipantCredentialStore;
  sessionId: string;
  tokens: Record<Seat, string>;
  characterIds: Record<'player-001' | 'player-002', string>;
};

/**
 * Rolls the faces given, in order, and refuses a draw the test did not pin.
 *
 * Running out is an assertion, not a fallback: a path that rolled more dice
 * than expected is exactly the bug an advantage/disadvantage change introduces,
 * and a silent default would hide it.
 */
function fixedRoller(...faces: number[]): (() => number) & { drawn: number } {
  const remaining = [...faces];
  const roller = (): number => {
    const next = remaining.shift();

    if (next === undefined) {
      throw new Error(
        'The roller was asked for more dice than the test pinned.',
      );
    }

    roller.drawn += 1;

    return next;
  };

  roller.drawn = 0;

  return roller;
}

function createRuntime(d20Roller: () => number) {
  return new InMemoryGameRuntime<InMemoryCharacterStore>(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    d20Roller,
    undefined,
    undefined,
    undefined,
    undefined,
    () => TEST_DAMAGE_DIE,
    () => TEST_INITIATIVE,
  );
}

function createTable(d20Roller: () => number = () => 10): Table {
  const runtime = createRuntime(d20Roller);
  const credentials = new ParticipantCredentialStore();
  const session = runtime.createSession({
    commandId: 'create-session-1',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: { rulesProfileId: 'dnd5e-2024-core' },
  });
  const sessionId = session.sessionId;

  for (const [participantId, displayName] of [
    ['player-001', 'Player One'],
    ['player-002', 'Player Two'],
  ] as const) {
    runtime.joinSession({
      commandId: `join-${participantId}`,
      type: 'join_session',
      actor: { participantId, displayName, role: 'player' },
      payload: { sessionId },
    });
  }

  const characterIds = {} as Table['characterIds'];

  for (const participantId of ['player-001', 'player-002'] as const) {
    const created = runtime.createCharacter({
      commandId: `create-character-${participantId}`,
      type: 'create_character',
      actor: { participantId },
      payload: {
        sessionId,
        ownerParticipantId: participantId,
        character: {
          name: participantId === 'player-001' ? 'Aria' : 'Borin',
          level: 5,
          className: 'Wizard',
          speciesOrRace: 'Elf',
          background: 'Sage',
          // dex 14 is a +2 modifier, which every DC below is written against.
          abilities: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 },
          hp: { max: 26, current: 26, temp: 0 },
          armorClass: 13,
          speed: 30,
          notes: null,
          meta: {},
          // One proficient save and one proficient skill, so the audit has
          // something real to report rather than always reporting nothing.
          proficiencies: {
            savingThrows: ['con'],
            skills: ['acrobatics'],
          },
        },
      },
    });

    characterIds[participantId] = created.character.id;

    runtime.assignCharacterToParticipant({
      commandId: `assign-${participantId}`,
      type: 'assign_character_to_participant',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        participantId,
        characterId: created.character.id,
      },
    });
  }

  return {
    characterIds,
    credentials,
    idempotency: new InMemoryCommandIdempotencyStore(),
    runtime,
    sessionId,
    tokens: {
      'dm-001': credentials.issue(sessionId, 'dm-001'),
      'player-001': credentials.issue(sessionId, 'player-001'),
      'player-002': credentials.issue(sessionId, 'player-002'),
    },
  };
}

function createMockResponse() {
  return {
    body: '',
    headers: new Map<string, string | number | readonly string[]>(),
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    closeListeners: [] as Array<() => void>,
    on(event: string, listener: () => void) {
      if (event === 'close') {
        this.closeListeners.push(listener);
      }

      return this;
    },
    emitClose() {
      for (const listener of this.closeListeners) {
        listener();
      }
    },
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

async function post<TResponse>(
  table: Table,
  path: string,
  body: unknown,
  token: string | null,
): Promise<{ status: number; body: TResponse }> {
  const request = Readable.from([JSON.stringify(body)]) as Readable & {
    headers: IncomingHttpHeaders;
    method?: string;
    url?: string;
  };
  const response = createMockResponse();

  request.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1',
    ...(token ? { [PARTICIPANT_TOKEN_HEADER]: token } : {}),
  };
  request.method = 'POST';
  request.url = path;

  await handleRequest(
    request as never,
    response as never,
    table.runtime,
    table.idempotency,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    table.credentials,
  );

  return {
    status: response.statusCode,
    body: JSON.parse(response.body) as TResponse,
  };
}

type StreamHandle = {
  frames: () => Array<{ event: string; data: Record<string, unknown> }>;
  raw: () => string;
  close: () => void;
};

/**
 * Subscribes over the real SSE route and parses **named** frames.
 *
 * The event name is the contract - a client listens for `resolution_state`, not
 * for "whatever arrived" - so the parser refuses to report a frame that has no
 * `event:` line. Reading the payload without the name would let a regression
 * that dropped every name still pass.
 */
async function openStream(
  table: Table,
  participantId: Seat,
  token: string | null = table.tokens[participantId],
): Promise<StreamHandle> {
  const request = Readable.from([]) as Readable & {
    headers: IncomingHttpHeaders;
    method?: string;
    url?: string;
    on: (event: string, listener: () => void) => unknown;
  };
  const response = createMockResponse();
  const query = new URLSearchParams({ participantId });

  if (token) {
    query.set('participantToken', token);
  }

  request.headers = { host: '127.0.0.1' };
  request.method = 'GET';
  request.url = `/api/sessions/${table.sessionId}/stream?${query.toString()}`;

  await handleRequest(
    request as never,
    response as never,
    table.runtime,
    table.idempotency,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    table.credentials,
  );

  return {
    close: () => response.emitClose(),
    frames: () => parseSseFrames(response.body),
    raw: () => response.body,
  };
}

function parseSseFrames(
  body: string,
): Array<{ event: string; data: Record<string, unknown> }> {
  return body
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('event: '))
    .map((block) => {
      const lines = block.split('\n');
      const event = lines[0]!.slice('event: '.length);
      const dataLine = lines.find((line) => line.startsWith('data: '));

      assert.ok(dataLine, `SSE frame "${event}" carried no data line`);

      return {
        event,
        data: JSON.parse(dataLine.slice('data: '.length)) as Record<
          string,
          unknown
        >,
      };
    });
}

function framesNamed(
  handle: StreamHandle,
  name: string,
): Array<Record<string, unknown>> {
  return handle
    .frames()
    .filter((frame) => frame.event === name)
    .map((frame) => frame.data);
}

function requestCommand(
  table: Table,
  overrides: {
    commandId?: string;
    actorParticipantId?: string;
    targetParticipantId?: string;
    kind?: 'ability_check' | 'saving_throw';
    ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    dc?: number;
    stance?: 'normal' | 'advantage' | 'disadvantage';
    reason?: string;
    skill?: string;
  } = {},
) {
  return {
    commandId: overrides.commandId ?? 'cmd-request-1',
    type: 'request_resolution',
    actor: { participantId: overrides.actorParticipantId ?? 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      kind: overrides.kind ?? 'ability_check',
      targetParticipantId: overrides.targetParticipantId ?? 'player-001',
      ability: overrides.ability ?? 'dex',
      dc: overrides.dc ?? 15,
      ...(overrides.skill ? { skill: overrides.skill } : {}),
      ...(overrides.stance ? { stance: overrides.stance } : {}),
      ...(overrides.reason ? { reason: overrides.reason } : {}),
    },
  };
}

async function createPendingRequest(
  table: Table,
  overrides: Parameters<typeof requestCommand>[1] = {},
): Promise<string> {
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    requestCommand(table, overrides),
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 200);

  const requestId = response.body.data.state.requests.at(-1)?.id;

  assert.ok(requestId);

  return requestId;
}

function submitCommand(
  table: Table,
  requestId: string,
  overrides: { commandId?: string; actorParticipantId?: string } = {},
) {
  return {
    commandId: overrides.commandId ?? 'cmd-submit-1',
    type: 'submit_resolution',
    actor: { participantId: overrides.actorParticipantId ?? 'player-001' },
    payload: { sessionId: table.sessionId, requestId },
  };
}

function cancelCommand(
  table: Table,
  requestId: string,
  overrides: { commandId?: string; actorParticipantId?: string } = {},
) {
  return {
    commandId: overrides.commandId ?? 'cmd-cancel-1',
    type: 'cancel_resolution_request',
    actor: { participantId: overrides.actorParticipantId ?? 'dm-001' },
    payload: { sessionId: table.sessionId, requestId },
  };
}

function intentCommand(
  table: Table,
  text: string,
  overrides: { commandId?: string; actorParticipantId?: string } = {},
) {
  return {
    commandId: overrides.commandId ?? 'cmd-intent-1',
    type: 'submit_player_intent',
    actor: { participantId: overrides.actorParticipantId ?? 'player-001' },
    payload: { sessionId: table.sessionId, text },
  };
}

async function createIntent(
  table: Table,
  text = 'I wedge the door with my spear.',
  overrides: { commandId?: string; actorParticipantId?: string } = {},
): Promise<string> {
  const response = await post<PlayerIntentCommandSuccess>(
    table,
    INTENT_PATH,
    intentCommand(table, text, overrides),
    table.tokens[(overrides.actorParticipantId ?? 'player-001') as Seat],
  );

  assert.equal(response.status, 200);

  const intentId = response.body.data.state.intents.at(-1)?.id;

  assert.ok(intentId);

  return intentId;
}

function errorCode(body: unknown): string | undefined {
  return (body as { error?: { code?: string } }).error?.code;
}

// ------------------------------------------------------------ proficiency

// The character is level 5, so the proficiency bonus is +3, and dex 14 is +2.
// Those two numbers are what every assertion below is written against.
test('a proficient skill check adds the proficiency bonus and names it', async () => {
  const roller = fixedRoller(10);
  const table = createTable(roller);
  const requestId = await createPendingRequest(table, { skill: 'acrobatics' });
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );
  const resolution = response.body.data.state.resolutions.at(-1)!;

  assert.equal(resolution.skill, 'acrobatics');
  assert.deepEqual(resolution.modifiers, [
    { kind: 'ability', detail: 'dex', value: 2 },
    { kind: 'proficiency', detail: 'acrobatics', value: 3 },
  ]);
  assert.equal(resolution.modifierTotal, 5);
  assert.equal(resolution.total, 15);
});

test('a skill the character is not trained in adds nothing', async () => {
  const table = createTable(fixedRoller(10));
  const requestId = await createPendingRequest(table, { skill: 'stealth' });
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );
  const resolution = response.body.data.state.resolutions.at(-1)!;

  assert.deepEqual(resolution.modifiers, [
    { kind: 'ability', detail: 'dex', value: 2 },
  ]);
  assert.equal(resolution.total, 12);
});

test('a proficient saving throw adds the proficiency bonus', async () => {
  const table = createTable(fixedRoller(10));
  const requestId = await createPendingRequest(table, {
    kind: 'saving_throw',
    ability: 'con',
  });
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );
  const resolution = response.body.data.state.resolutions.at(-1)!;

  // con 13 is a +1 modifier, plus the +3 proficiency bonus.
  assert.deepEqual(resolution.modifiers, [
    { kind: 'ability', detail: 'con', value: 1 },
    { kind: 'proficiency', value: 3 },
  ]);
  assert.equal(resolution.total, 14);
});

test('a saving throw the character is not proficient in adds nothing', async () => {
  const table = createTable(fixedRoller(10));
  const requestId = await createPendingRequest(table, {
    kind: 'saving_throw',
    ability: 'wis',
  });
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );
  const resolution = response.body.data.state.resolutions.at(-1)!;

  assert.deepEqual(resolution.modifiers, [
    { kind: 'ability', detail: 'wis', value: 1 },
  ]);
});

test('a skill outside the canonical list is refused by the schema', async () => {
  const table = createTable();
  const response = await post(
    table,
    RESOLUTION_PATH,
    {
      ...requestCommand(table),
      payload: {
        sessionId: table.sessionId,
        kind: 'ability_check',
        targetParticipantId: 'player-001',
        ability: 'dex',
        dc: 15,
        skill: 'Acrobatics',
      },
    },
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 400);
  assert.equal(errorCode(response.body), 'invalid_command');
});

// --------------------------------------------------------- request_resolution

test('a GM request creates one pending row with no dice result', async () => {
  const table = createTable();
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    requestCommand(table, { reason: 'The rope is fraying.' }),
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.sessionId, table.sessionId);
  assert.equal(response.body.data.state.requests.length, 1);

  const request = response.body.data.state.requests[0]!;

  assert.equal(request.status, 'pending');
  assert.equal(request.requestedByParticipantId, 'dm-001');
  assert.equal(request.targetParticipantId, 'player-001');
  assert.equal(request.targetCharacterId, table.characterIds['player-001']);
  assert.equal(request.dc, 15);
  assert.equal(request.reason, 'The rope is fraying.');
  assert.equal(request.resolutionId, undefined);
  assert.ok(Date.parse(request.createdAt) > 0, 'server stamped a real time');
  // Nothing resolved yet, so the audit is empty. A request that arrived with a
  // dice result would be a client deciding its own roll.
  assert.deepEqual(response.body.data.state.resolutions, []);
});

test('a saving throw request keeps its kind through the transport', async () => {
  const table = createTable();
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    requestCommand(table, { kind: 'saving_throw', ability: 'con' }),
    table.tokens['dm-001'],
  );

  assert.equal(response.body.data.state.requests[0]?.kind, 'saving_throw');
});

test('a player cannot request a resolution', async () => {
  const table = createTable();
  const response = await post(
    table,
    RESOLUTION_PATH,
    requestCommand(table, {
      actorParticipantId: 'player-001',
      targetParticipantId: 'player-002',
    }),
    table.tokens['player-001'],
  );

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.body), 'invalid_role_assumption');
  assert.deepEqual(table.runtime.tableStates.get(table.sessionId).requests, []);
});

test('a request without a credential is refused', async () => {
  const table = createTable();
  const response = await post(
    table,
    RESOLUTION_PATH,
    requestCommand(table),
    null,
  );

  assert.equal(response.status, 401);
  assert.equal(errorCode(response.body), 'unauthenticated');
  assert.deepEqual(table.runtime.tableStates.get(table.sessionId).requests, []);
});

// The claimed participantId is the attack. Presenting a real credential for one
// seat while naming another proves nothing about the seat named.
test('a valid credential for another seat cannot act as the GM', async () => {
  const table = createTable();
  const response = await post(
    table,
    RESOLUTION_PATH,
    requestCommand(table),
    table.tokens['player-001'],
  );

  assert.equal(response.status, 401);
  assert.equal(errorCode(response.body), 'unauthenticated');
});

test('a malformed request body never reaches the runtime', async () => {
  const table = createTable();
  const response = await post(
    table,
    RESOLUTION_PATH,
    {
      commandId: 'cmd-request-bad',
      type: 'request_resolution',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId: table.sessionId,
        kind: 'vibes_check',
        targetParticipantId: 'player-001',
        ability: 'dex',
        dc: 15,
      },
    },
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 400);
  assert.equal(errorCode(response.body), 'invalid_command');
});

test('a DC outside the schema range is refused before authorization', async () => {
  const table = createTable();
  const response = await post(
    table,
    RESOLUTION_PATH,
    requestCommand(table, { dc: 500 }),
    null,
  );

  assert.equal(response.status, 400);
  assert.equal(errorCode(response.body), 'invalid_command');
});

test('a request addressed to a seat with no runtime character is refused', async () => {
  const table = createTable();

  table.runtime.joinSession({
    commandId: 'join-player-003',
    type: 'join_session',
    actor: {
      participantId: 'player-003',
      displayName: 'Player Three',
      role: 'player',
    },
    payload: { sessionId: table.sessionId },
  });

  const response = await post(
    table,
    RESOLUTION_PATH,
    requestCommand(table, { targetParticipantId: 'player-003' }),
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 409);
  assert.equal(errorCode(response.body), 'no_assigned_character');
  assert.deepEqual(table.runtime.tableStates.get(table.sessionId).requests, []);
});

test('replaying a request command returns the cached answer and adds no row', async () => {
  const table = createTable();
  const first = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    requestCommand(table),
    table.tokens['dm-001'],
  );
  const second = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    requestCommand(table),
    table.tokens['dm-001'],
  );

  assert.deepEqual(second.body, first.body);
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).requests.length,
    1,
  );
});

test('reusing a request command ID with a different payload conflicts', async () => {
  const table = createTable();

  await post(
    table,
    RESOLUTION_PATH,
    requestCommand(table),
    table.tokens['dm-001'],
  );

  const conflicting = await post(
    table,
    RESOLUTION_PATH,
    requestCommand(table, { dc: 9 }),
    table.tokens['dm-001'],
  );

  assert.equal(conflicting.status, 409);
  assert.equal(errorCode(conflicting.body), 'command_id_conflict');
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).requests.length,
    1,
  );
});

// ---------------------------------------------------------- submit_resolution

test('the addressed player resolves their own request on the server', async () => {
  const roller = fixedRoller(13);
  const table = createTable(roller);
  const requestId = await createPendingRequest(table);
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );

  assert.equal(response.status, 200);
  assert.equal(roller.drawn, 1, 'a normal check draws exactly one die');

  const resolution = response.body.data.state.resolutions.at(-1)!;

  assert.equal(resolution.kind, 'ability_check');
  assert.equal(resolution.actorParticipantId, 'player-001');
  assert.equal(resolution.actorCharacterId, table.characterIds['player-001']);
  assert.deepEqual(resolution.dice, [13]);
  assert.equal(resolution.selectedDie, 13);
  assert.deepEqual(resolution.modifiers, [
    { kind: 'ability', detail: 'dex', value: 2 },
  ]);
  assert.equal(resolution.modifierTotal, 2);
  assert.equal(resolution.total, 15);
  assert.equal(resolution.dc, 15);
  assert.equal(resolution.success, true);
  assert.equal(resolution.rulesProfileId, 'dnd5e-2024-core');
  assert.equal(resolution.requestId, requestId);
  assert.equal(resolution.commandId, 'cmd-submit-1');
  assert.ok(Date.parse(resolution.resolvedAt) > 0);

  const stored = table.runtime.tableStates.get(table.sessionId);

  assert.equal(stored.requests[0]?.status, 'resolved');
  assert.equal(stored.requests[0]?.resolutionId, resolution.id);
  assert.equal(stored.resolutions.length, 1);
});

test('another player cannot answer a request addressed elsewhere', async () => {
  const roller = fixedRoller();
  const table = createTable(roller);
  const requestId = await createPendingRequest(table);
  const response = await post(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId, { actorParticipantId: 'player-002' }),
    table.tokens['player-002'],
  );

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.body), 'invalid_resolution_target');
  assert.equal(roller.drawn, 0, 'a refused attempt rolls nothing');

  const stored = table.runtime.tableStates.get(table.sessionId);

  assert.equal(stored.requests[0]?.status, 'pending');
  assert.deepEqual(stored.resolutions, []);
});

// The GM is not an exception. The protocol defines no override, so a GM
// answering on a player's behalf would be an undocumented one.
test('the GM cannot resolve a request on the player behalf', async () => {
  const table = createTable(fixedRoller());
  const requestId = await createPendingRequest(table);
  const response = await post(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId, { actorParticipantId: 'dm-001' }),
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.body), 'invalid_resolution_target');
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).requests[0]?.status,
    'pending',
  );
});

test('an unknown request is reported rather than silently created', async () => {
  const table = createTable(fixedRoller());
  const response = await post(
    table,
    RESOLUTION_PATH,
    submitCommand(table, 'resolution_99999999-9999-4999-8999-999999999999'),
    table.tokens['player-001'],
  );

  assert.equal(response.status, 404);
  assert.equal(errorCode(response.body), 'resolution_request_not_found');
});

// Re-rolling a bad result under a fresh command ID is the whole reason the
// server rolls. A new ID must not buy a second roll.
test('a resolved request cannot be answered again under a new command ID', async () => {
  const roller = fixedRoller(4);
  const table = createTable(roller);
  const requestId = await createPendingRequest(table);

  await post(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );

  const retry = await post(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId, { commandId: 'cmd-submit-2' }),
    table.tokens['player-001'],
  );

  assert.equal(retry.status, 409);
  assert.equal(errorCode(retry.body), 'resolution_request_already_resolved');
  assert.equal(roller.drawn, 1, 'the second attempt rolled nothing');
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).resolutions.length,
    1,
  );
});

test('replaying the original submit returns the same dice', async () => {
  const roller = fixedRoller(17);
  const table = createTable(roller);
  const requestId = await createPendingRequest(table);
  const first = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );
  const replay = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );

  assert.deepEqual(replay.body, first.body);
  assert.equal(roller.drawn, 1, 'a replay is served from cache, not re-rolled');
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).resolutions.length,
    1,
  );
});

test('an unauthorized submit is not cached as a success', async () => {
  const table = createTable(fixedRoller(11));
  const requestId = await createPendingRequest(table);

  const refused = await post(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId, {
      commandId: 'cmd-shared',
      actorParticipantId: 'player-002',
    }),
    table.tokens['player-002'],
  );

  assert.equal(refused.status, 403);

  // The rightful seat reuses the same command ID. A cached failure would have
  // turned their legitimate roll into a replay of someone else's rejection.
  const allowed = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId, { commandId: 'cmd-shared' }),
    table.tokens['player-001'],
  );

  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.data.state.resolutions.length, 1);
});

test('a GM asking for advantage on a poisoned character rolls once', async () => {
  const roller = fixedRoller(6);
  const table = createTable(roller);

  table.runtime.dmSetCharacterActiveConditions({
    commandId: 'dm-poison-1',
    type: 'dm_set_character_active_conditions',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      participantId: 'player-001',
      characterId: table.characterIds['player-001'],
      activeConditions: ['poisoned'],
    },
  });

  const requestId = await createPendingRequest(table, { stance: 'advantage' });
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );

  const resolution = response.body.data.state.resolutions.at(-1)!;

  assert.equal(resolution.stance, 'normal');
  assert.deepEqual(resolution.dice, [6]);
  assert.equal(roller.drawn, 1);
  assert.deepEqual(resolution.stanceSources, [
    { kind: 'gm_request', stance: 'advantage' },
    { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
  ]);
});

test('a poisoned saving throw is unaffected while a poisoned check is not', async () => {
  const roller = fixedRoller(19, 3, 12);
  const table = createTable(roller);

  // A second tag the engine does not model. It rides along in the audit-visible
  // condition list and must contribute no stance of its own.
  table.runtime.dmSetCharacterActiveConditions({
    commandId: 'dm-poison-2',
    type: 'dm_set_character_active_conditions',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      participantId: 'player-001',
      characterId: table.characterIds['player-001'],
      activeConditions: ['poisoned', 'rattled-by-the-drums'],
    },
  });

  const checkId = await createPendingRequest(table, {
    commandId: 'cmd-request-check',
  });
  const check = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, checkId, { commandId: 'cmd-submit-check' }),
    table.tokens['player-001'],
  );

  const checkResolution = check.body.data.state.resolutions.at(-1)!;

  assert.equal(checkResolution.stance, 'disadvantage');
  assert.deepEqual(checkResolution.dice, [19, 3]);
  assert.equal(checkResolution.selectedDie, 3);
  assert.equal(
    checkResolution.stanceSources?.length,
    1,
    'a condition the engine does not model contributes no stance',
  );

  const saveId = await createPendingRequest(table, {
    commandId: 'cmd-request-save',
    kind: 'saving_throw',
    ability: 'con',
    dc: 12,
  });
  const save = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, saveId, { commandId: 'cmd-submit-save' }),
    table.tokens['player-001'],
  );
  const saveResolution = save.body.data.state.resolutions.at(-1)!;

  assert.equal(saveResolution.stance, 'normal');
  assert.deepEqual(saveResolution.dice, [12]);
  assert.equal(roller.drawn, 3);
});

// The runtime refuses a duplicated tag outright, so the overlay can never hold
// one. That is where "poisoned twice" is prevented in the live path; the
// collapse rule underneath it is proved in `runtime-condition-stance.test.ts`.
test('the runtime refuses a duplicated condition tag at the boundary', async () => {
  const table = createTable();

  assert.throws(
    () =>
      table.runtime.dmSetCharacterActiveConditions({
        commandId: 'dm-poison-dup',
        type: 'dm_set_character_active_conditions',
        actor: { participantId: 'dm-001' },
        payload: {
          sessionId: table.sessionId,
          participantId: 'player-001',
          characterId: table.characterIds['player-001'],
          activeConditions: ['poisoned', 'poisoned'],
        },
      }),
    (error: { code?: string }) => error.code === 'invalid_condition_list',
  );
});

// -------------------------------------------------- cancel_resolution_request

test('the GM cancels a pending request and it survives as cancelled', async () => {
  const table = createTable(fixedRoller());
  const requestId = await createPendingRequest(table);
  const response = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    cancelCommand(table, requestId),
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.state.requests.length, 1);
  assert.equal(response.body.data.state.requests[0]?.status, 'cancelled');
});

test('a cancelled request can no longer be resolved', async () => {
  const roller = fixedRoller();
  const table = createTable(roller);
  const requestId = await createPendingRequest(table);

  await post(
    table,
    RESOLUTION_PATH,
    cancelCommand(table, requestId),
    table.tokens['dm-001'],
  );

  const submit = await post(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );

  assert.equal(submit.status, 409);
  assert.equal(errorCode(submit.body), 'resolution_request_already_resolved');
  assert.equal(roller.drawn, 0);
});

test('a resolved request cannot be cancelled after the fact', async () => {
  const table = createTable(fixedRoller(8));
  const requestId = await createPendingRequest(table);

  await post(
    table,
    RESOLUTION_PATH,
    submitCommand(table, requestId),
    table.tokens['player-001'],
  );

  const cancel = await post(
    table,
    RESOLUTION_PATH,
    cancelCommand(table, requestId),
    table.tokens['dm-001'],
  );

  assert.equal(cancel.status, 409);
  assert.equal(errorCode(cancel.body), 'resolution_request_already_resolved');
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).resolutions.length,
    1,
    'the audit is not rewound by a failed cancel',
  );
});

test('a player cannot cancel the GM request', async () => {
  const table = createTable(fixedRoller());
  const requestId = await createPendingRequest(table);
  const response = await post(
    table,
    RESOLUTION_PATH,
    cancelCommand(table, requestId, { actorParticipantId: 'player-001' }),
    table.tokens['player-001'],
  );

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.body), 'invalid_role_assumption');
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).requests[0]?.status,
    'pending',
  );
});

test('replaying a cancel returns the cached answer', async () => {
  const table = createTable(fixedRoller());
  const requestId = await createPendingRequest(table);
  const first = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    cancelCommand(table, requestId),
    table.tokens['dm-001'],
  );
  const replay = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    cancelCommand(table, requestId),
    table.tokens['dm-001'],
  );

  assert.deepEqual(replay.body, first.body);
});

// ------------------------------------------------------------------- intents

test('a player intent is stored with its author and its text intact', async () => {
  const table = createTable();
  const text = 'من طناب را به ستون گره می‌زنم.';
  const response = await post<PlayerIntentCommandSuccess>(
    table,
    INTENT_PATH,
    intentCommand(table, text),
    table.tokens['player-001'],
  );

  assert.equal(response.status, 200);

  const intent = response.body.data.state.intents[0]!;

  assert.equal(intent.text, text, 'player prose is never translated');
  assert.equal(intent.authorParticipantId, 'player-001');
  assert.equal(intent.authorCharacterId, table.characterIds['player-001']);
  assert.equal(intent.status, 'pending');
});

test('an intent mutates nothing else about the table', async () => {
  const table = createTable();
  const before = table.runtime.getCharacter({
    commandId: 'read-before',
    type: 'get_character',
    actor: { participantId: 'player-001' },
    payload: {
      sessionId: table.sessionId,
      characterId: table.characterIds['player-001'],
    },
  });

  await createIntent(table, 'I heal myself for 40 and gain flight.');

  const after = table.runtime.getCharacter({
    commandId: 'read-after',
    type: 'get_character',
    actor: { participantId: 'player-001' },
    payload: {
      sessionId: table.sessionId,
      characterId: table.characterIds['player-001'],
    },
  });

  assert.deepEqual(after.character.hp, before.character.hp);
  assert.deepEqual(after.character, before.character);
});

test('intent text is bounded by the schema at the transport', async () => {
  const table = createTable();
  const response = await post(
    table,
    INTENT_PATH,
    intentCommand(table, 'x'.repeat(281)),
    table.tokens['player-001'],
  );

  assert.equal(response.status, 400);
  assert.equal(errorCode(response.body), 'invalid_command');
  assert.deepEqual(table.runtime.tableStates.get(table.sessionId).intents, []);
});

test('an intent without a credential is refused', async () => {
  const table = createTable();
  const response = await post(
    table,
    INTENT_PATH,
    intentCommand(table, 'Anything at all.'),
    null,
  );

  assert.equal(response.status, 401);
  assert.deepEqual(table.runtime.tableStates.get(table.sessionId).intents, []);
});

test('replaying an intent submission adds no second intent', async () => {
  const table = createTable();
  const first = await post<PlayerIntentCommandSuccess>(
    table,
    INTENT_PATH,
    intentCommand(table, 'I listen at the door.'),
    table.tokens['player-001'],
  );
  const replay = await post<PlayerIntentCommandSuccess>(
    table,
    INTENT_PATH,
    intentCommand(table, 'I listen at the door.'),
    table.tokens['player-001'],
  );

  assert.deepEqual(replay.body, first.body);
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).intents.length,
    1,
  );
});

test('reusing an intent command ID with different text conflicts', async () => {
  const table = createTable();

  await createIntent(table, 'I listen at the door.');

  const conflicting = await post(
    table,
    INTENT_PATH,
    intentCommand(table, 'I kick the door.'),
    table.tokens['player-001'],
  );

  assert.equal(conflicting.status, 409);
  assert.equal(errorCode(conflicting.body), 'command_id_conflict');
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).intents.length,
    1,
  );
});

test('the GM moves an intent to a decision and the author text survives', async () => {
  const table = createTable();
  const intentId = await createIntent(table, 'I search the sarcophagus.');
  const response = await post<PlayerIntentCommandSuccess>(
    table,
    INTENT_PATH,
    {
      commandId: 'cmd-intent-status-1',
      type: 'update_player_intent_status',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId: table.sessionId,
        intentId,
        status: 'resolved',
        gmNote: 'You find a false bottom.',
      },
    },
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 200);

  const intent = response.body.data.state.intents[0]!;

  assert.equal(intent.status, 'resolved');
  assert.equal(intent.gmNote, 'You find a false bottom.');
  assert.equal(intent.text, 'I search the sarcophagus.');
  assert.equal(intent.authorParticipantId, 'player-001');
});

test('a player cannot change an intent status', async () => {
  const table = createTable();
  const intentId = await createIntent(table);
  const response = await post(
    table,
    INTENT_PATH,
    {
      commandId: 'cmd-intent-status-2',
      type: 'update_player_intent_status',
      actor: { participantId: 'player-001' },
      payload: {
        sessionId: table.sessionId,
        intentId,
        status: 'resolved',
      },
    },
    table.tokens['player-001'],
  );

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.body), 'invalid_role_assumption');
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).intents[0]?.status,
    'pending',
  );
});

test('the protocol refuses returning an intent to pending', async () => {
  const table = createTable();
  const intentId = await createIntent(table);
  const response = await post(
    table,
    INTENT_PATH,
    {
      commandId: 'cmd-intent-status-3',
      type: 'update_player_intent_status',
      actor: { participantId: 'dm-001' },
      payload: { sessionId: table.sessionId, intentId, status: 'pending' },
    },
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 400);
  assert.equal(errorCode(response.body), 'invalid_command');
});

test('a terminal intent does not transition twice', async () => {
  const table = createTable();
  const intentId = await createIntent(table);

  await post(
    table,
    INTENT_PATH,
    {
      commandId: 'cmd-intent-status-4',
      type: 'update_player_intent_status',
      actor: { participantId: 'dm-001' },
      payload: { sessionId: table.sessionId, intentId, status: 'dismissed' },
    },
    table.tokens['dm-001'],
  );

  const second = await post(
    table,
    INTENT_PATH,
    {
      commandId: 'cmd-intent-status-5',
      type: 'update_player_intent_status',
      actor: { participantId: 'dm-001' },
      payload: { sessionId: table.sessionId, intentId, status: 'resolved' },
    },
    table.tokens['dm-001'],
  );

  assert.equal(second.status, 409);
  assert.equal(errorCode(second.body), 'invalid_intent_status_transition');
  assert.equal(
    table.runtime.tableStates.get(table.sessionId).intents[0]?.status,
    'dismissed',
  );
});

// ------------------------------------------------------ HTTP role projection

test('the HTTP answer is projected for whoever asked', async () => {
  const table = createTable(fixedRoller(9));

  await createPendingRequest(table, {
    commandId: 'cmd-request-p1',
    targetParticipantId: 'player-001',
  });
  await createPendingRequest(table, {
    commandId: 'cmd-request-p2',
    targetParticipantId: 'player-002',
  });

  const dmView = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    requestCommand(table, {
      commandId: 'cmd-request-p2-again',
      targetParticipantId: 'player-002',
      dc: 12,
    }),
    table.tokens['dm-001'],
  );

  assert.equal(dmView.body.data.state.requests.length, 3);

  const playerRequestId = table.runtime.tableStates
    .get(table.sessionId)
    .requests.find(
      (request) => request.targetParticipantId === 'player-001',
    )!.id;
  const playerView = await post<ResolutionCommandSuccess>(
    table,
    RESOLUTION_PATH,
    submitCommand(table, playerRequestId),
    table.tokens['player-001'],
  );

  assert.equal(
    playerView.body.data.state.requests.length,
    1,
    'a player is answered with their own request only',
  );
  assert.equal(
    playerView.body.data.state.requests[0]?.targetParticipantId,
    'player-001',
  );
});

// ------------------------------------------------------------- SSE fan-out

test('a pending request reaches the GM and the addressed player only', async () => {
  const table = createTable(fixedRoller());
  const dmStream = await openStream(table, 'dm-001');
  const addressed = await openStream(table, 'player-001');
  const bystander = await openStream(table, 'player-002');

  try {
    await createPendingRequest(table, { reason: 'The ledge is crumbling.' });

    const dmFrames = framesNamed(dmStream, 'resolution_state');
    const addressedFrames = framesNamed(addressed, 'resolution_state');
    const bystanderFrames = framesNamed(bystander, 'resolution_state');

    // Each stream opens with an `initial_sync` frame and then receives the
    // request itself, so the interesting one is always the last.
    assert.equal(dmFrames.length, 2);
    assert.equal(addressedFrames.length, 2);
    assert.equal(
      bystanderFrames.length,
      2,
      'every seat is told the table changed',
    );

    const dmState = dmFrames.at(-1)!.state as { requests: unknown[] };
    const addressedState = addressedFrames.at(-1)!.state as {
      requests: Array<{ dc: number; reason?: string }>;
    };
    const bystanderState = bystanderFrames.at(-1)!.state as {
      requests: unknown[];
    };

    assert.equal(dmFrames.at(-1)!.reason, 'resolution_requested');
    assert.equal(dmState.requests.length, 1);
    assert.equal(addressedState.requests.length, 1);
    assert.equal(addressedState.requests[0]?.dc, 15);
    assert.equal(
      bystanderState.requests.length,
      0,
      'an unrelated seat receives neither the DC nor the GM reason',
    );
    assert.equal(
      bystander.raw().includes('The ledge is crumbling.'),
      false,
      'the GM reason never crossed the wire to an unrelated player',
    );
  } finally {
    dmStream.close();
    addressed.close();
    bystander.close();
  }
});

test('a resolved roll is shared table audit for every seat', async () => {
  const table = createTable(fixedRoller(16));
  const requestId = await createPendingRequest(table);
  const dmStream = await openStream(table, 'dm-001');
  const addressed = await openStream(table, 'player-001');
  const bystander = await openStream(table, 'player-002');

  try {
    await post(
      table,
      RESOLUTION_PATH,
      submitCommand(table, requestId),
      table.tokens['player-001'],
    );

    for (const [seat, handle] of [
      ['dm', dmStream],
      ['addressed', addressed],
      ['bystander', bystander],
    ] as const) {
      const frames = framesNamed(handle, 'resolution_state');
      const latest = frames.at(-1)!;
      const state = latest.state as {
        resolutions: Array<{ selectedDie: number; total: number }>;
      };

      assert.equal(latest.reason, 'resolution_submitted', seat);
      assert.equal(state.resolutions.length, 1, seat);
      assert.equal(state.resolutions[0]?.selectedDie, 16, seat);
      assert.equal(state.resolutions[0]?.total, 18, seat);
    }
  } finally {
    dmStream.close();
    addressed.close();
    bystander.close();
  }
});

test('a cancellation reaches the addressed player as a cancelled request', async () => {
  const table = createTable(fixedRoller());
  const requestId = await createPendingRequest(table);
  const addressed = await openStream(table, 'player-001');

  try {
    await post(
      table,
      RESOLUTION_PATH,
      cancelCommand(table, requestId),
      table.tokens['dm-001'],
    );

    const latest = framesNamed(addressed, 'resolution_state').at(-1)!;
    const state = latest.state as { requests: Array<{ status: string }> };

    assert.equal(latest.reason, 'resolution_request_cancelled');
    assert.equal(state.requests[0]?.status, 'cancelled');
  } finally {
    addressed.close();
  }
});

test('an intent reaches its author and the GM but no other seat', async () => {
  const table = createTable();
  const dmStream = await openStream(table, 'dm-001');
  const author = await openStream(table, 'player-001');
  const bystander = await openStream(table, 'player-002');

  try {
    await createIntent(table, 'I climb onto the rafters.');

    const dmState = framesNamed(dmStream, 'player_intent_state').at(-1)!
      .state as { intents: unknown[] };
    const authorState = framesNamed(author, 'player_intent_state').at(-1)!
      .state as { intents: unknown[] };
    const bystanderState = framesNamed(bystander, 'player_intent_state').at(-1)!
      .state as { intents: unknown[] };

    assert.equal(dmState.intents.length, 1);
    assert.equal(authorState.intents.length, 1);
    assert.equal(bystanderState.intents.length, 0);
    assert.equal(
      bystander.raw().includes('I climb onto the rafters.'),
      false,
      'another player never received the text',
    );
  } finally {
    dmStream.close();
    author.close();
    bystander.close();
  }
});

test('an intent status change reaches the author and the GM only', async () => {
  const table = createTable();
  const intentId = await createIntent(table, 'I pick the lock.');
  const dmStream = await openStream(table, 'dm-001');
  const author = await openStream(table, 'player-001');
  const bystander = await openStream(table, 'player-002');

  try {
    await post(
      table,
      INTENT_PATH,
      {
        commandId: 'cmd-intent-status-sse',
        type: 'update_player_intent_status',
        actor: { participantId: 'dm-001' },
        payload: {
          sessionId: table.sessionId,
          intentId,
          status: 'acknowledged',
        },
      },
      table.tokens['dm-001'],
    );

    const dmFrame = framesNamed(dmStream, 'player_intent_state').at(-1)!;
    const authorFrame = framesNamed(author, 'player_intent_state').at(-1)!;
    const bystanderFrame = framesNamed(bystander, 'player_intent_state').at(
      -1,
    )!;

    assert.equal(dmFrame.reason, 'intent_status_changed');
    assert.equal(
      (dmFrame.state as { intents: Array<{ status: string }> }).intents[0]
        ?.status,
      'acknowledged',
    );
    assert.equal(
      (authorFrame.state as { intents: Array<{ status: string }> }).intents[0]
        ?.status,
      'acknowledged',
    );
    assert.equal(
      (bystanderFrame.state as { intents: unknown[] }).intents.length,
      0,
    );
  } finally {
    dmStream.close();
    author.close();
    bystander.close();
  }
});

test('no participant credential is ever written to a stream', async () => {
  const table = createTable(fixedRoller(5));
  const dmStream = await openStream(table, 'dm-001');
  const player = await openStream(table, 'player-001');

  try {
    const requestId = await createPendingRequest(table);

    await post(
      table,
      RESOLUTION_PATH,
      submitCommand(table, requestId),
      table.tokens['player-001'],
    );
    await createIntent(table, 'I hold the line.');

    for (const handle of [dmStream, player]) {
      for (const token of Object.values(table.tokens)) {
        assert.equal(handle.raw().includes(token), false);
      }

      assert.equal(handle.raw().includes('participantToken'), false);
    }
  } finally {
    dmStream.close();
    player.close();
  }
});

test('a stream without a valid credential receives nothing', async () => {
  const table = createTable();
  const stream = await openStream(table, 'player-001', null);

  try {
    await createPendingRequest(table);

    assert.equal(framesNamed(stream, 'resolution_state').length, 0);
  } finally {
    stream.close();
  }
});

test('a reconnecting subscriber resumes receiving table events', async () => {
  const table = createTable(fixedRoller(14));
  const first = await openStream(table, 'player-001');

  await createPendingRequest(table, { commandId: 'cmd-request-before' });
  first.close();

  const second = await openStream(table, 'player-001');

  try {
    const requestId = table.runtime.tableStates
      .get(table.sessionId)
      .requests.at(-1)!.id;

    await post(
      table,
      RESOLUTION_PATH,
      submitCommand(table, requestId),
      table.tokens['player-001'],
    );

    const frames = framesNamed(second, 'resolution_state');

    assert.ok(frames.length >= 1, 'the new connection receives live events');
    assert.equal(
      (
        frames.at(-1)!.state as {
          resolutions: Array<{ selectedDie: number }>;
        }
      ).resolutions[0]?.selectedDie,
      14,
    );
  } finally {
    second.close();
  }
});
