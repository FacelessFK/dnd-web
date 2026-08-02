/**
 * Concealment and conditions where they stop being labels and start being
 * mechanics.
 *
 * Two properties are under test. Hiding a combatant must change what leaves the
 * server - the scene a player reads, the encounter they are projected, and the
 * combat events they receive - while leaving the authoritative encounter, its
 * participant count and its `currentTurnIndex` exactly as they were. And a
 * `poisoned` attacker must roll two dice and keep the lower one, which is the
 * difference between a condition that is drawn and a condition that is applied.
 *
 * Dice are pinned in every test here. An attack that "usually" rolls low proves
 * nothing about which die the server selected.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import type { IncomingHttpHeaders } from 'node:http';

import type {
  CombatEvent,
  DmCommandSuccess,
  EncounterStateUpdate,
  SessionStreamEvent,
} from '@dnd/protocol';
import type { Encounter } from '@dnd/shared';

import { InMemoryCharacterStore } from './character-store.js';
import {
  InMemoryCommandIdempotencyStore,
  type CommandIdempotencyStore,
} from './command-idempotency-store.js';
import { createConnectionId, InMemoryGameRuntime } from './game-runtime.js';
import {
  PARTICIPANT_TOKEN_HEADER,
  ParticipantCredentialStore,
} from './participant-credential-store.js';
import { handleRequest } from './session-server.js';

const DM_PATH = '/api/dm/command';
const TEST_DAMAGE_DIE = 3;
const TEST_INITIATIVE = 10;

type Seat = 'dm-001' | 'player-001' | 'player-002';

type Table = {
  runtime: InMemoryGameRuntime<InMemoryCharacterStore>;
  idempotency: CommandIdempotencyStore;
  credentials: ParticipantCredentialStore;
  sessionId: string;
  sceneId: string;
  combatantId: string;
  tokens: Record<Seat, string>;
  characterIds: Record<'player-001' | 'player-002', string>;
  events: SessionStreamEvent[];
};

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

/**
 * A table with an active scene, two placed characters, one combatant, and a
 * running encounter whose turn is pinned to `player-001`.
 *
 * The turn is set explicitly rather than left to initiative: two characters
 * with the same dexterity tie, and a test that depends on how that tie breaks
 * is testing the sort, not the thing it claims to test.
 */
function createTable(d20Roller: () => number = () => 10): Table {
  const runtime = new InMemoryGameRuntime<InMemoryCharacterStore>(
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
          className: 'Fighter',
          speciesOrRace: 'Human',
          background: 'Soldier',
          abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
          hp: { max: 40, current: 40, temp: 0 },
          armorClass: 14,
          speed: 30,
          notes: null,
          meta: {},
        },
      },
    });

    characterIds[participantId] = created.character.id;

    runtime.assignCharacterToParticipant({
      commandId: `assign-${participantId}`,
      type: 'assign_character_to_participant',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, participantId, characterId: created.character.id },
    });
  }

  const scene = runtime.createScene({
    commandId: 'create-scene-1',
    type: 'create_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      scene: {
        name: 'Collapsed Gallery',
        grid: { width: 10, height: 8, cellSizeFeet: 5 },
      },
    },
  });

  runtime.activateSceneForSession({
    commandId: 'activate-scene-1',
    type: 'activate_scene_for_session',
    actor: { participantId: 'dm-001' },
    payload: { sessionId, sceneId: scene.id },
  });

  for (const [participantId, position] of [
    ['player-001', { x: 0, y: 0 }],
    ['player-002', { x: 0, y: 1 }],
  ] as const) {
    runtime.placeCharacterInActiveScene({
      commandId: `place-${participantId}`,
      type: 'place_character_in_active_scene',
      actor: { participantId },
      payload: { sessionId, participantId, position },
    });
  }

  const sceneWithCombatant = runtime.dmCreateCombatantInActiveScene({
    commandId: 'dm-create-combatant-1',
    type: 'dm_create_combatant_in_active_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      combatant: {
        kind: 'monster',
        name: 'Ash Goblin',
        position: { x: 1, y: 0 },
        footprint: { width: 1, height: 1 },
        hp: { max: 40, current: 40, temp: 0 },
        armorClass: 10,
        speed: 30,
        abilities: { str: 14, dex: 12, con: 12, int: 8, wis: 10, cha: 8 },
      },
    },
  });
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;

  runtime.startEncounter({
    commandId: 'start-encounter-1',
    type: 'start_encounter',
    actor: { participantId: 'dm-001' },
    payload: { sessionId },
  });

  runtime.dmSetCurrentTurnParticipant({
    commandId: 'dm-set-turn-1',
    type: 'dm_set_current_turn_participant',
    actor: { participantId: 'dm-001' },
    payload: { sessionId, participantId: 'player-001' },
  });

  return {
    characterIds,
    combatantId,
    credentials,
    events: [],
    idempotency: new InMemoryCommandIdempotencyStore(),
    runtime,
    sceneId: scene.id,
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

async function openStream(
  table: Table,
  participantId: Seat,
): Promise<StreamHandle> {
  const request = Readable.from([]) as Readable & {
    headers: IncomingHttpHeaders;
    method?: string;
    url?: string;
    on: (event: string, listener: () => void) => unknown;
  };
  const response = createMockResponse();
  const query = new URLSearchParams({
    participantId,
    participantToken: table.tokens[participantId],
  });

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
    frames: () =>
      response.body
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
        }),
    raw: () => response.body,
  };
}

function framesNamed(handle: StreamHandle, name: string) {
  return handle
    .frames()
    .filter((frame) => frame.event === name)
    .map((frame) => frame.data);
}

/** Collects authoritative runtime events without going through a transport. */
function subscribe(table: Table, participantId: Seat): SessionStreamEvent[] {
  const received: SessionStreamEvent[] = [];

  table.runtime.connectParticipant(table.sessionId, participantId, {
    connectionId: createConnectionId(),
    close: () => undefined,
    send: (update) => received.push(update),
  });

  return received;
}

function combatEvents(events: SessionStreamEvent[]): CombatEvent[] {
  return events.filter(
    (event): event is CombatEvent => event.type === 'combat_event',
  );
}

function encounterUpdates(
  events: SessionStreamEvent[],
): EncounterStateUpdate[] {
  return events.filter(
    (event): event is EncounterStateUpdate => event.type === 'encounter_state',
  );
}

function setHiddenCommand(
  table: Table,
  hidden: boolean,
  overrides: { commandId?: string; actorParticipantId?: string } = {},
) {
  return {
    commandId: overrides.commandId ?? `dm-hide-${String(hidden)}`,
    type: 'dm_set_combatant_hidden',
    actor: { participantId: overrides.actorParticipantId ?? 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      combatantId: table.combatantId,
      hidden,
    },
  };
}

function getSceneAs(table: Table, participantId: Seat) {
  return table.runtime.getScene({
    commandId: `get-scene-${participantId}`,
    type: 'get_scene',
    actor: { participantId },
    payload: { sessionId: table.sessionId, sceneId: table.sceneId },
  });
}

function getEncounterAs(table: Table, participantId: Seat): Encounter {
  return table.runtime.getEncounterState({
    commandId: `get-encounter-${participantId}`,
    type: 'get_encounter_state',
    actor: { participantId },
    payload: { sessionId: table.sessionId },
  });
}

function poison(table: Table, conditions: string[], commandId = 'dm-poison-1') {
  table.runtime.dmSetCharacterActiveConditions({
    commandId,
    type: 'dm_set_character_active_conditions',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      participantId: 'player-001',
      characterId: table.characterIds['player-001'],
      activeConditions: conditions,
    },
  });
}

function attackCombatant(table: Table, commandId = 'attack-1') {
  return table.runtime.attack({
    commandId,
    type: 'attack',
    actor: { participantId: 'player-001' },
    payload: {
      sessionId: table.sessionId,
      targetCombatantId: table.combatantId,
    },
  });
}

function errorCode(body: unknown): string | undefined {
  return (body as { error?: { code?: string } }).error?.code;
}

// ------------------------------------------------------- conceal and reveal

test('the GM conceals a combatant and the player scene loses it', async () => {
  const table = createTable();

  assert.equal(getSceneAs(table, 'player-001').entities.length, 1);

  const response = await post<DmCommandSuccess>(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 200);

  const dmScene = getSceneAs(table, 'dm-001');
  const playerScene = getSceneAs(table, 'player-001');

  assert.equal(dmScene.entities.length, 1, 'the DM still sees the creature');
  assert.equal(dmScene.entities[0]?.hidden, true);
  assert.equal(playerScene.entities.length, 0);
});

test('revealing puts the combatant back in the player scene', async () => {
  const table = createTable();

  await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );
  await post(
    table,
    DM_PATH,
    setHiddenCommand(table, false),
    table.tokens['dm-001'],
  );

  const playerScene = getSceneAs(table, 'player-001');

  assert.equal(playerScene.entities.length, 1);
  assert.equal(playerScene.entities[0]?.id, table.combatantId);
});

test('conceal and reveal survive repetition', async () => {
  const table = createTable();

  for (const round of [1, 2, 3]) {
    await post(
      table,
      DM_PATH,
      setHiddenCommand(table, true, { commandId: `dm-hide-on-${round}` }),
      table.tokens['dm-001'],
    );
    assert.equal(
      getSceneAs(table, 'player-001').entities.length,
      0,
      `round ${round} concealed`,
    );

    await post(
      table,
      DM_PATH,
      setHiddenCommand(table, false, { commandId: `dm-hide-off-${round}` }),
      table.tokens['dm-001'],
    );
    assert.equal(
      getSceneAs(table, 'player-001').entities.length,
      1,
      `round ${round} revealed`,
    );
  }
});

test('setting the value it already has publishes nothing new', async () => {
  const table = createTable();

  await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );

  const events = subscribe(table, 'dm-001');

  await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true, { commandId: 'dm-hide-again' }),
    table.tokens['dm-001'],
  );

  assert.deepEqual(encounterUpdates(events), []);
  assert.equal(getSceneAs(table, 'dm-001').entities[0]?.hidden, true);
});

test('replaying the conceal command returns the cached scene', async () => {
  const table = createTable();
  const first = await post<DmCommandSuccess>(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );
  const replay = await post<DmCommandSuccess>(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );

  assert.deepEqual(replay.body, first.body);
});

test('a player cannot conceal a combatant', async () => {
  const table = createTable();
  const response = await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true, { actorParticipantId: 'player-001' }),
    table.tokens['player-001'],
  );

  assert.equal(response.status, 403);
  assert.equal(errorCode(response.body), 'invalid_role_assumption');
  assert.equal(getSceneAs(table, 'player-001').entities.length, 1);
});

test('a conceal command without a credential is refused', async () => {
  const table = createTable();
  const response = await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    null,
  );

  assert.equal(response.status, 401);
  assert.equal(getSceneAs(table, 'player-001').entities.length, 1);
});

test('concealing a combatant that does not exist is refused', async () => {
  const table = createTable();
  const response = await post(
    table,
    DM_PATH,
    {
      ...setHiddenCommand(table, true),
      payload: {
        sessionId: table.sessionId,
        combatantId: 'scene_entity_00000000-0000-4000-8000-0000000000aa',
        hidden: true,
      },
    },
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 404);
  assert.equal(errorCode(response.body), 'scene_not_found');
});

// `dm_set_combatant_hidden` is not a general entity toggle. A pillar has its own
// command; routing it through here would let concealment bypass the checks
// `update_scene_entity` makes.
test('concealing a passive entity through the combatant command is refused', async () => {
  const table = createTable();
  const scene = table.runtime.placeEntityInScene({
    commandId: 'place-pillar-1',
    type: 'place_entity_in_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      sceneId: table.sceneId,
      entity: {
        type: 'object',
        name: 'Stone Pillar',
        position: { x: 4, y: 4 },
        footprint: { width: 1, height: 1 },
        blocksMovement: true,
        blocksVision: true,
        hidden: false,
      },
    },
  });
  const pillarId = scene.entities.find((entity) => !entity.combatant)!.id;
  const response = await post(
    table,
    DM_PATH,
    {
      ...setHiddenCommand(table, true),
      payload: {
        sessionId: table.sessionId,
        combatantId: pillarId,
        hidden: true,
      },
    },
    table.tokens['dm-001'],
  );

  assert.equal(response.status, 409);
  assert.equal(errorCode(response.body), 'invalid_character_state');
});

// The turn rail is a positional index into `participants`. Dropping a concealed
// entry would silently point a player's rail at the wrong actor.
test('concealment keeps the encounter slot count and the turn index aligned', async () => {
  const table = createTable();
  const before = getEncounterAs(table, 'player-001');

  await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );

  const dmEncounter = getEncounterAs(table, 'dm-001');
  const playerEncounter = getEncounterAs(table, 'player-001');

  assert.equal(playerEncounter.participants.length, before.participants.length);
  assert.equal(
    playerEncounter.participants.length,
    dmEncounter.participants.length,
  );
  assert.equal(playerEncounter.currentTurnIndex, dmEncounter.currentTurnIndex);
  assert.equal(playerEncounter.roundNumber, dmEncounter.roundNumber);
});

test('a player encounter shows a concealed slot with no combatant ID', async () => {
  const table = createTable();

  await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );

  const dmEncounter = getEncounterAs(table, 'dm-001');
  const playerEncounter = getEncounterAs(table, 'player-001');

  const dmSlot = dmEncounter.participants.find(
    (participant) => participant.kind === 'combatant',
  );
  const playerSlot = playerEncounter.participants.find(
    (participant) => participant.kind === 'concealed_combatant',
  );

  assert.ok(dmSlot);
  assert.ok(playerSlot);
  assert.equal(
    JSON.stringify(playerEncounter).includes(table.combatantId),
    false,
    'the scene entity ID never appears in a player encounter',
  );
  assert.equal(
    playerEncounter.participants.some(
      (participant) => participant.kind === 'combatant',
    ),
    false,
  );
});

test('concealment republishes the encounter so a player rail updates at once', async () => {
  const table = createTable();
  const dmStream = await openStream(table, 'dm-001');
  const playerStream = await openStream(table, 'player-001');

  try {
    // The goblin is on the map in plain sight until the command below, so the
    // player's initial sync is entitled to name it. What must not survive the
    // concealment is every byte sent afterwards.
    const playerBytesBeforeConcealment = playerStream.raw().length;

    assert.equal(
      playerStream.raw().includes(table.combatantId),
      true,
      'the player could see the creature before it was concealed',
    );

    await post(
      table,
      DM_PATH,
      setHiddenCommand(table, true),
      table.tokens['dm-001'],
    );

    const dmFrame = framesNamed(dmStream, 'encounter_state').at(-1)!;
    const playerFrame = framesNamed(playerStream, 'encounter_state').at(-1)!;
    const playerBytesAfterConcealment = playerStream
      .raw()
      .slice(playerBytesBeforeConcealment);

    assert.equal(dmFrame.reason, 'dm_combatant_visibility_changed');
    assert.equal(playerFrame.reason, 'dm_combatant_visibility_changed');
    assert.equal(
      JSON.stringify(dmFrame).includes(table.combatantId),
      true,
      'the DM stream keeps the identity',
    );
    assert.equal(
      playerBytesAfterConcealment.includes(table.combatantId),
      false,
      'no player frame carried the concealed ID after concealment',
    );

    // The scene the player is now holding has the creature removed outright,
    // not blanked - a blanked entity would still outline itself on the map.
    const playerScene = framesNamed(playerStream, 'scene_state').at(-1)!;
    const dmScene = framesNamed(dmStream, 'scene_state').at(-1)!;

    assert.equal(playerScene.reason, 'combatant_visibility_changed');
    assert.equal(
      (playerScene.scene as { entities: { id: string }[] }).entities.some(
        (entity) => entity.id === table.combatantId,
      ),
      false,
      'the concealed creature left the player scene entirely',
    );
    assert.equal(
      (dmScene.scene as { entities: { id: string }[] }).entities.some(
        (entity) => entity.id === table.combatantId,
      ),
      true,
      'the GM still sees the creature they concealed',
    );
  } finally {
    dmStream.close();
    playerStream.close();
  }
});

test('a hidden attacker reaches the player as an unnamed attacker', async () => {
  const table = createTable(() => 18);

  await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );

  table.runtime.dmSetCurrentTurnParticipant({
    commandId: 'dm-set-turn-combatant',
    type: 'dm_set_current_turn_participant',
    actor: { participantId: 'dm-001' },
    payload: { sessionId: table.sessionId, combatantId: table.combatantId },
  });

  const dmEvents = subscribe(table, 'dm-001');
  const playerEvents = subscribe(table, 'player-001');

  table.runtime.dmCombatantAttack({
    commandId: 'dm-combatant-attack-1',
    type: 'dm_combatant_attack',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      combatantId: table.combatantId,
      targetParticipantId: 'player-001',
    },
  });

  const dmEvent = combatEvents(dmEvents).at(-1)!;
  const playerEvent = combatEvents(playerEvents).at(-1)!;

  assert.equal(dmEvent.attackerCombatantId, table.combatantId);
  assert.equal(dmEvent.attackerConcealed, undefined);
  assert.equal(playerEvent.attackerCombatantId, undefined);
  assert.equal(playerEvent.attackerConcealed, true);
  // The attack still lands and the player still learns what it did to them.
  assert.equal(playerEvent.hit, dmEvent.hit);
  assert.deepEqual(playerEvent.roll, dmEvent.roll);
});

test('a hidden target keeps its identity and its health from the player', async () => {
  const table = createTable(() => 18);

  await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );

  const dmEvents = subscribe(table, 'dm-001');
  const playerEvents = subscribe(table, 'player-002');

  attackCombatant(table);

  const dmEvent = combatEvents(dmEvents).at(-1)!;
  const playerEvent = combatEvents(playerEvents).at(-1)!;

  assert.equal(dmEvent.targetCombatantId, table.combatantId);
  assert.ok(dmEvent.targetHp);
  assert.equal(playerEvent.targetCombatantId, undefined);
  assert.equal(playerEvent.targetConcealed, true);
  assert.equal(
    playerEvent.targetHp,
    undefined,
    'the health of a creature a player cannot see is itself concealed',
  );
});

test('a hidden combatant ID never appears on a player stream during combat', async () => {
  const table = createTable(() => 18);

  await post(
    table,
    DM_PATH,
    setHiddenCommand(table, true),
    table.tokens['dm-001'],
  );

  const playerStream = await openStream(table, 'player-002');

  try {
    attackCombatant(table);

    assert.ok(
      framesNamed(playerStream, 'combat_event').length >= 1,
      'the player was told an attack happened',
    );
    assert.equal(playerStream.raw().includes(table.combatantId), false);
  } finally {
    playerStream.close();
  }
});

// ------------------------------------------------------- poisoned attacks

test('an unafflicted attack draws one die and reports a normal stance', () => {
  const roller = fixedRoller(15);
  const table = createTable(roller);
  const events = subscribe(table, 'dm-001');

  attackCombatant(table);

  const event = combatEvents(events).at(-1)!;

  assert.equal(roller.drawn, 1);
  assert.equal(event.roll.d20, 15);
  assert.equal(event.roll.stance, 'normal');
  assert.deepEqual(event.roll.dice, [15]);
  assert.equal(event.roll.stanceSources, undefined);
});

// The central claim of this milestone's condition work: `poisoned` changes the
// die that counts, not just the label beside it.
test('a poisoned attacker rolls two dice and keeps the lower one', () => {
  const roller = fixedRoller(19, 6);
  const table = createTable(roller);

  poison(table, ['poisoned']);

  const events = subscribe(table, 'dm-001');

  attackCombatant(table);

  const event = combatEvents(events).at(-1)!;

  assert.equal(roller.drawn, 2);
  assert.deepEqual(event.roll.dice, [19, 6]);
  assert.equal(event.roll.d20, 6, 'the kept die is the lower one');
  assert.equal(event.roll.stance, 'disadvantage');
});

test('the resolved attack event explains why the stance was imposed', () => {
  const table = createTable(fixedRoller(19, 6));

  poison(table, ['poisoned']);

  const events = subscribe(table, 'dm-001');

  attackCombatant(table);

  assert.deepEqual(combatEvents(events).at(-1)!.roll.stanceSources, [
    { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
  ]);
});

test('the lower die is what the hit decision and the total are built from', () => {
  const clean = createTable(fixedRoller(19));
  const cleanEvents = subscribe(clean, 'dm-001');

  attackCombatant(clean);

  const cleanRoll = combatEvents(cleanEvents).at(-1)!.roll;

  const afflicted = createTable(fixedRoller(19, 2));

  poison(afflicted, ['poisoned']);

  const afflictedEvents = subscribe(afflicted, 'dm-001');

  attackCombatant(afflicted);

  const afflictedRoll = combatEvents(afflictedEvents).at(-1)!.roll;

  assert.equal(cleanRoll.modifier, afflictedRoll.modifier);
  assert.equal(cleanRoll.total, 19 + cleanRoll.modifier);
  assert.equal(afflictedRoll.total, 2 + afflictedRoll.modifier);
});

test('a non-mechanical condition tag changes no dice', () => {
  const roller = fixedRoller(12);
  const table = createTable(roller);

  poison(table, ['inspired', 'muddy']);

  const events = subscribe(table, 'dm-001');

  attackCombatant(table);

  assert.equal(roller.drawn, 1);
  assert.equal(combatEvents(events).at(-1)!.roll.stance, 'normal');
});

test('removing poisoned restores a single-die attack', () => {
  const roller = fixedRoller(19, 4, 13);
  const table = createTable(roller);

  poison(table, ['poisoned'], 'dm-poison-on');

  const events = subscribe(table, 'dm-001');

  attackCombatant(table, 'attack-poisoned');

  assert.equal(combatEvents(events).at(-1)!.roll.stance, 'disadvantage');

  poison(table, [], 'dm-poison-off');

  // The attack consumed the action, so hand the turn back before the second one.
  table.runtime.dmSetCurrentTurnUsage({
    commandId: 'dm-reset-usage',
    type: 'dm_set_current_turn_usage',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      turnUsage: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: 0,
      },
    },
  });

  attackCombatant(table, 'attack-cured');

  const cured = combatEvents(events).at(-1)!.roll;

  assert.equal(roller.drawn, 3);
  assert.equal(cured.stance, 'normal');
  assert.deepEqual(cured.dice, [13]);
  assert.equal(cured.stanceSources, undefined);
});

test('the poisoned attack path never reaches for Math.random', () => {
  const table = createTable(fixedRoller(11, 8));

  poison(table, ['poisoned']);

  const original = Math.random;
  Math.random = () => {
    throw new Error('Math.random must not be reachable from an attack roll.');
  };

  try {
    assert.doesNotThrow(() => attackCombatant(table));
  } finally {
    Math.random = original;
  }
});

test('a player receives the same stance explanation the GM does', async () => {
  const table = createTable(fixedRoller(19, 5));

  poison(table, ['poisoned']);

  const dmStream = await openStream(table, 'dm-001');
  const playerStream = await openStream(table, 'player-002');

  try {
    attackCombatant(table);

    const dmRoll = (framesNamed(dmStream, 'combat_event').at(-1)!.roll ??
      {}) as {
      stance?: string;
      dice?: number[];
    };
    const playerRoll = (framesNamed(playerStream, 'combat_event').at(-1)!
      .roll ?? {}) as { stance?: string; dice?: number[] };

    assert.equal(dmRoll.stance, 'disadvantage');
    // The dice are not concealed information: the attacker is a visible player
    // character and the roll is the shared table audit.
    assert.deepEqual(playerRoll.dice, dmRoll.dice);
    assert.equal(playerRoll.stance, 'disadvantage');
  } finally {
    dmStream.close();
    playerStream.close();
  }
});
