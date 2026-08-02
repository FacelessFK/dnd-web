/**
 * The live scene stream, and what it is allowed to say to whom.
 *
 * M1 shipped with a hole: the GM could place, move, reveal or remove something
 * and the players' map stayed stale until somebody pressed Recover. Closing it
 * means the server now pushes the scene, which makes every one of these tests a
 * security test rather than a rendering test - a projection bug here does not
 * look like a broken map, it looks like a working one that shows too much.
 *
 * So the assertions are deliberately paranoid. It is not enough that a hidden
 * entity fails to draw; its ID, its position and its HP must not appear
 * anywhere in the bytes a player's socket received, which is why several tests
 * search the raw SSE transcript rather than the parsed object. A test that only
 * inspected `scene.entities` would pass just as happily against a server that
 * shipped the whole map and asked the browser to be discreet about it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import type { IncomingHttpHeaders } from 'node:http';

import type {
  CommandEventOutboxDatabase,
  CommandEventOutboxBacklog,
  CommandEventOutboxRecordWrite,
  CommandEventOutboxRow,
} from '@dnd/db';
import type { SceneStateUpdate, SessionStreamEvent } from '@dnd/protocol';
import type { Scene, SceneView } from '@dnd/shared';

import { InMemoryCharacterStore } from './character-store.js';
import { CommandEventOutboxDispatcher } from './command-event-outbox-dispatcher.js';
import {
  InMemoryCommandIdempotencyStore,
  type CommandIdempotencyStore,
} from './command-idempotency-store.js';
import { createConnectionId, InMemoryGameRuntime } from './game-runtime.js';
import { ParticipantCredentialStore } from './participant-credential-store.js';
import { handleRequest } from './session-server.js';
import { InMemorySessionStore } from './session-store.js';

type Seat = 'dm-001' | 'player-001' | 'player-002';

type Table = {
  runtime: InMemoryGameRuntime<InMemoryCharacterStore>;
  idempotency: CommandIdempotencyStore;
  credentials: ParticipantCredentialStore;
  sessionId: string;
  sceneId: string;
  tokens: Record<Seat, string>;
};

/** Every scene frame a subscriber received, newest last. */
function sceneFrames(events: SessionStreamEvent[]): SceneStateUpdate[] {
  return events.filter(
    (event): event is SceneStateUpdate => event.type === 'scene_state',
  );
}

/**
 * The newest scene frame a DM socket received, asserted to be authoritative.
 *
 * The assertion is load-bearing rather than decorative: if the fan-out ever
 * started projecting the GM, every entity assertion below would still pass and
 * only this would notice.
 */
function latestAuthoritativeScene(events: SessionStreamEvent[]): Scene {
  const frame = sceneFrames(events).at(-1);

  assert.ok(frame, 'expected at least one scene frame');
  assert.equal(frame.view, 'authoritative');

  return frame.scene as Scene;
}

/** The newest scene frame a player socket received, asserted to be projected. */
function latestProjectedScene(events: SessionStreamEvent[]): SceneView {
  const frame = sceneFrames(events).at(-1);

  assert.ok(frame, 'expected at least one scene frame');
  assert.equal(
    frame.view,
    'player_projection',
    'a player must never receive the authoritative scene',
  );

  return frame.scene as SceneView;
}

function entityNamed(scene: Scene | SceneView, name: string) {
  return scene.entities.find((entity) => entity.name === name);
}

/**
 * A table with an active scene and two seated players.
 *
 * The scene is activated during setup because an inactive scene is deliberately
 * not announced - the room is looking at a different map - and every test here
 * is about the map the room is actually looking at.
 */
function createTable(): Table {
  const runtime = new InMemoryGameRuntime<InMemoryCharacterStore>();
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

  const scene = runtime.createScene({
    commandId: 'create-scene-1',
    type: 'create_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      scene: {
        name: 'Sunken Chapel',
        grid: { width: 12, height: 10, cellSizeFeet: 5 },
      },
    },
  });

  runtime.activateSceneForSession({
    commandId: 'activate-scene-1',
    type: 'activate_scene_for_session',
    actor: { participantId: 'dm-001' },
    payload: { sessionId, sceneId: scene.id },
  });

  // Both players get a placed character. Without one, fog of war leaves them
  // with an empty view and every concealment assertion in this file would pass
  // because the player can see nothing at all rather than because the entity
  // was concealed. The chapel is open and brightly lit, so their line of sight
  // covers the whole map and `hidden` remains the only thing withholding
  // anything. Done before any subscription, so no placement frame lands in a
  // recorded event list.
  assignAndPlacePlayer(runtime, sessionId, 'player-001', { x: 0, y: 0 });
  assignAndPlacePlayer(runtime, sessionId, 'player-002', { x: 0, y: 9 });

  return {
    credentials,
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

function assignAndPlacePlayer(
  runtime: InMemoryGameRuntime<InMemoryCharacterStore>,
  sessionId: string,
  participantId: Seat,
  position: { x: number; y: number },
) {
  const character = runtime.createCharacter({
    commandId: `create-character-${participantId}`,
    type: 'create_character',
    actor: { participantId },
    payload: {
      sessionId,
      ownerParticipantId: participantId,
      character: {
        name: `Scout ${participantId}`,
        level: 1,
        className: 'Fighter',
        speciesOrRace: 'Human',
        background: 'Soldier',
        abilities: { str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 9 },
        hp: { max: 12, current: 12, temp: 0 },
        armorClass: 15,
        speed: 30,
        notes: null,
        meta: {},
      },
    },
  });

  runtime.finalizeCharacter({
    commandId: `finalize-character-${participantId}`,
    type: 'finalize_character',
    actor: { participantId },
    payload: { sessionId, characterId: character.character.id },
  });

  runtime.assignCharacterToParticipant({
    commandId: `assign-character-${participantId}`,
    type: 'assign_character_to_participant',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      participantId,
      characterId: character.character.id,
    },
  });

  runtime.placeCharacterInActiveScene({
    commandId: `place-character-${participantId}`,
    type: 'place_character_in_active_scene',
    actor: { participantId },
    payload: { sessionId, participantId, position },
  });

  return character;
}

function subscribe(table: Table, participantId: Seat): SessionStreamEvent[] {
  const received: SessionStreamEvent[] = [];

  table.runtime.connectParticipant(table.sessionId, participantId, {
    connectionId: createConnectionId(),
    close: () => undefined,
    send: (update) => received.push(update),
  });

  return received;
}

function placeEntity(
  table: Table,
  params: { name: string; hidden: boolean; x: number; y: number },
): Scene {
  return table.runtime.placeEntityInScene({
    commandId: `place-${params.name}-${params.x}-${params.y}`,
    type: 'place_entity_in_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      sceneId: table.sceneId,
      entity: {
        type: 'object',
        name: params.name,
        position: { x: params.x, y: params.y },
        footprint: { width: 1, height: 1 },
        blocksMovement: true,
        blocksVision: true,
        hidden: params.hidden,
      },
    },
  });
}

function placeCombatant(
  table: Table,
  params: { name: string; hidden: boolean; x: number; y: number },
): Scene {
  return table.runtime.dmCreateCombatantInActiveScene({
    commandId: `combatant-${params.name}`,
    type: 'dm_create_combatant_in_active_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      combatant: {
        kind: 'monster',
        name: params.name,
        position: { x: params.x, y: params.y },
        footprint: { width: 1, height: 1 },
        hidden: params.hidden,
        hp: { max: 33, current: 27, temp: 0 },
        armorClass: 15,
        speed: 30,
        abilities: { str: 14, dex: 12, con: 12, int: 8, wis: 10, cha: 8 },
      },
    },
  });
}

function setCombatantHidden(
  table: Table,
  combatantId: string,
  hidden: boolean,
  commandId: string,
): Scene {
  return table.runtime.dmSetCombatantHidden({
    commandId,
    type: 'dm_set_combatant_hidden',
    actor: { participantId: 'dm-001' },
    payload: { sessionId: table.sessionId, combatantId, hidden },
  });
}

test('the GM receives the whole map and a player receives only what is visible', () => {
  const table = createTable();
  const dmEvents = subscribe(table, 'dm-001');
  const playerEvents = subscribe(table, 'player-001');

  placeEntity(table, { name: 'Altar', hidden: false, x: 2, y: 2 });
  placeEntity(table, { name: 'Trapdoor', hidden: true, x: 5, y: 5 });

  const dmScene = latestAuthoritativeScene(dmEvents);
  const playerScene = latestProjectedScene(playerEvents);

  assert.ok(entityNamed(dmScene, 'Altar'));
  assert.ok(entityNamed(dmScene, 'Trapdoor'));
  assert.ok(entityNamed(playerScene, 'Altar'));
  assert.equal(
    entityNamed(playerScene, 'Trapdoor'),
    undefined,
    'the hidden trapdoor never reached the player',
  );
});

test('a hidden entity is dropped whole, leaving no blocking footprint behind', () => {
  const table = createTable();
  const playerEvents = subscribe(table, 'player-001');
  const scene = placeEntity(table, {
    name: 'Trapdoor',
    hidden: true,
    x: 5,
    y: 5,
  });
  const hiddenId = entityNamed(scene, 'Trapdoor')!.id;
  const playerScene = latestProjectedScene(playerEvents);

  // Blanking the fields instead of removing the entity would leave a
  // `blocksMovement` hole that outlines the secret on the movement overlay.
  assert.equal(
    playerScene.entities.some((entity) => entity.id === hiddenId),
    false,
  );
  assert.equal(
    JSON.stringify(playerScene).includes(hiddenId),
    false,
    'the hidden entity ID is nowhere in the player scene',
  );
  assert.equal(
    JSON.stringify(playerScene).includes('Trapdoor'),
    false,
    'the hidden entity name is nowhere in the player scene',
  );
});

test('placing, moving and removing a visible entity each reach a player live', () => {
  const table = createTable();
  const playerEvents = subscribe(table, 'player-001');
  const placed = placeEntity(table, {
    name: 'Brazier',
    hidden: false,
    x: 1,
    y: 1,
  });
  const entityId = entityNamed(placed, 'Brazier')!.id;

  assert.equal(sceneFrames(playerEvents).at(-1)?.reason, 'entity_placed');
  assert.deepEqual(
    entityNamed(latestProjectedScene(playerEvents), 'Brazier')?.position,
    { x: 1, y: 1 },
  );

  table.runtime.repositionSceneEntity({
    commandId: 'reposition-brazier',
    type: 'reposition_scene_entity',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      sceneId: table.sceneId,
      entityId,
      position: { x: 4, y: 3 },
    },
  });

  assert.equal(sceneFrames(playerEvents).at(-1)?.reason, 'entity_moved');
  assert.deepEqual(
    entityNamed(latestProjectedScene(playerEvents), 'Brazier')?.position,
    { x: 4, y: 3 },
  );

  table.runtime.deleteSceneEntity({
    commandId: 'delete-brazier',
    type: 'delete_scene_entity',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      sceneId: table.sceneId,
      entityId,
    },
  });

  assert.equal(sceneFrames(playerEvents).at(-1)?.reason, 'entity_removed');
  assert.equal(
    entityNamed(latestProjectedScene(playerEvents), 'Brazier'),
    undefined,
  );
});

test('revealing a concealed combatant is the first a player hears of it', () => {
  const table = createTable();
  const scene = placeCombatant(table, {
    name: 'Bog Lurker',
    hidden: true,
    x: 6,
    y: 6,
  });
  const combatantId = entityNamed(scene, 'Bog Lurker')!.id;
  const playerEvents = subscribe(table, 'player-001');

  assert.equal(
    entityNamed(latestProjectedScene(playerEvents), 'Bog Lurker'),
    undefined,
    'the lurker was not in the initial sync',
  );

  setCombatantHidden(table, combatantId, false, 'reveal-lurker');

  const revealed = sceneFrames(playerEvents).at(-1)!;

  assert.equal(revealed.reason, 'combatant_visibility_changed');
  assert.equal(entityNamed(revealed.scene, 'Bog Lurker')?.id, combatantId);
});

test('re-concealing a revealed combatant takes it back off the player map', () => {
  const table = createTable();
  const scene = placeCombatant(table, {
    name: 'Bog Lurker',
    hidden: true,
    x: 6,
    y: 6,
  });
  const combatantId = entityNamed(scene, 'Bog Lurker')!.id;
  const playerEvents = subscribe(table, 'player-001');

  setCombatantHidden(table, combatantId, false, 'reveal-lurker');
  assert.ok(entityNamed(latestProjectedScene(playerEvents), 'Bog Lurker'));

  setCombatantHidden(table, combatantId, true, 'reconceal-lurker');

  const reconcealed = sceneFrames(playerEvents).at(-1)!;

  assert.equal(reconcealed.reason, 'combatant_visibility_changed');
  assert.equal(entityNamed(reconcealed.scene, 'Bog Lurker'), undefined);
  // The GM's own view is unaffected by concealing something from someone else.
  const dmEvents = subscribe(table, 'dm-001');

  assert.ok(entityNamed(latestAuthoritativeScene(dmEvents), 'Bog Lurker'));
});

test('a concealed combatant leaks neither its identity nor its health to a player', () => {
  const table = createTable();
  const scene = placeCombatant(table, {
    name: 'Bog Lurker',
    hidden: true,
    x: 6,
    y: 6,
  });
  const combatant = entityNamed(scene, 'Bog Lurker')!;
  const playerEvents = subscribe(table, 'player-001');

  placeEntity(table, { name: 'Altar', hidden: false, x: 2, y: 2 });

  const playerBytes = JSON.stringify(playerEvents);

  assert.equal(playerBytes.includes(combatant.id), false, 'no combatant ID');
  assert.equal(playerBytes.includes('Bog Lurker'), false, 'no combatant name');
  // 27 of 33 is this creature's current health. A player who could count it
  // would know exactly how much more the party has to do.
  assert.equal(
    playerBytes.includes('"current":27'),
    false,
    'no concealed HP reached the player',
  );
});

// Concealment applies to every player, not only the one whose action caused the
// frame. Fog, by contrast, is per viewer: the two players stand in different
// corners, so their payloads legitimately differ, and asserting they are
// identical would now be asserting that fog is not being computed.
test('every player at the table is projected, not just the one being acted on', () => {
  const table = createTable();
  const firstPlayerEvents = subscribe(table, 'player-001');
  const secondPlayerEvents = subscribe(table, 'player-002');

  placeEntity(table, { name: 'Altar', hidden: false, x: 2, y: 2 });
  placeEntity(table, { name: 'Trapdoor', hidden: true, x: 5, y: 5 });

  const firstScene = latestProjectedScene(firstPlayerEvents);
  const secondScene = latestProjectedScene(secondPlayerEvents);

  for (const scene of [firstScene, secondScene]) {
    assert.ok(entityNamed(scene, 'Altar'), 'both see the revealed altar');
    assert.equal(entityNamed(scene, 'Trapdoor'), undefined);
  }

  assert.equal(
    JSON.stringify([firstPlayerEvents, secondPlayerEvents]).includes(
      'Trapdoor',
    ),
    false,
  );

  // Both stand at x=0 and the altar blocks vision, so the corner each is
  // standing in decides which cells behind it they lose. Different payloads
  // here are the projection working, not a defect.
  assert.notDeepEqual(firstScene.cells, secondScene.cells);
});

test('connecting hands a subscriber the current map, projected, as initial_sync', () => {
  const table = createTable();

  placeEntity(table, { name: 'Altar', hidden: false, x: 2, y: 2 });
  placeEntity(table, { name: 'Trapdoor', hidden: true, x: 5, y: 5 });

  // Subscribing only now: everything above happened while nobody was listening.
  const playerEvents = subscribe(table, 'player-001');
  const dmEvents = subscribe(table, 'dm-001');
  const playerSync = sceneFrames(playerEvents).at(0)!;
  const dmSync = sceneFrames(dmEvents).at(0)!;

  assert.equal(playerSync.reason, 'initial_sync');
  assert.equal(dmSync.reason, 'initial_sync');
  assert.ok(entityNamed(playerSync.scene, 'Altar'));
  assert.equal(entityNamed(playerSync.scene, 'Trapdoor'), undefined);
  assert.ok(entityNamed(dmSync.scene, 'Trapdoor'));
});

test('a session with no active scene syncs no map rather than an empty one', () => {
  const runtime = new InMemoryGameRuntime<InMemoryCharacterStore>();
  const session = runtime.createSession({
    commandId: 'create-session-no-scene',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: { rulesProfileId: 'dnd5e-2024-core' },
  });
  const received: SessionStreamEvent[] = [];

  runtime.connectParticipant(session.sessionId, 'dm-001', {
    connectionId: createConnectionId(),
    close: () => undefined,
    send: (update) => received.push(update),
  });

  // "No map yet" and "a map with nothing on it" are different states, and the
  // session snapshot already says which one this is.
  assert.deepEqual(sceneFrames(received), []);
});

test('a write to a scene the room is not looking at is saved but not announced', () => {
  const table = createTable();
  const otherScene = table.runtime.createScene({
    commandId: 'create-scene-2',
    type: 'create_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      scene: {
        name: 'Prepared Ambush',
        grid: { width: 8, height: 8, cellSizeFeet: 5 },
      },
    },
  });
  const playerEvents = subscribe(table, 'player-001');
  const frameCountBefore = sceneFrames(playerEvents).length;

  const updated = table.runtime.placeEntityInScene({
    commandId: 'place-in-inactive-scene',
    type: 'place_entity_in_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: table.sessionId,
      sceneId: otherScene.id,
      entity: {
        type: 'object',
        name: 'Ambush Marker',
        position: { x: 1, y: 1 },
        footprint: { width: 1, height: 1 },
        blocksMovement: false,
        blocksVision: false,
        hidden: false,
      },
    },
  });

  assert.ok(entityNamed(updated, 'Ambush Marker'), 'the write still landed');
  assert.equal(
    sceneFrames(playerEvents).length,
    frameCountBefore,
    'prep work on another map does not replace the one on screen',
  );
});

test('no hidden entity ID ever enters the bytes a player socket received', async () => {
  const table = createTable();
  const scene = placeEntity(table, {
    name: 'Trapdoor',
    hidden: true,
    x: 5,
    y: 5,
  });
  const hiddenId = entityNamed(scene, 'Trapdoor')!.id;
  const dmStream = await openStream(table, 'dm-001');
  const playerStream = await openStream(table, 'player-001');

  try {
    placeEntity(table, { name: 'Altar', hidden: false, x: 2, y: 2 });

    assert.equal(
      dmStream.raw().includes(hiddenId),
      true,
      'the GM transcript names the entity they hid',
    );
    // The whole point: the search is over the serialized transport, not over a
    // parsed object a client-side filter could have produced.
    assert.equal(
      playerStream.raw().includes(hiddenId),
      false,
      'the hidden ID is absent from every byte the player received',
    );
    assert.equal(playerStream.raw().includes('Trapdoor'), false);
    assert.equal(
      playerStream.raw().includes(table.tokens['player-001']),
      false,
      'no participant credential travels on the stream',
    );
  } finally {
    dmStream.close();
    playerStream.close();
  }
});

test('a scene row replayed from the outbox is projected per role, not broadcast raw', async () => {
  const sessions = new InMemorySessionStore();
  const session = sessions.createSession({
    commandId: 'outbox-create-session',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: { rulesProfileId: 'dnd5e-2024-core' },
  });

  sessions.joinSession({
    commandId: 'outbox-join-player',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: { sessionId: session.sessionId },
  });

  const dmEvents: SessionStreamEvent[] = [];
  const playerEvents: SessionStreamEvent[] = [];

  for (const [participantId, sink] of [
    ['dm-001', dmEvents],
    ['player-001', playerEvents],
  ] as const) {
    sessions.connectParticipant(session.sessionId, participantId, {
      connectionId: createConnectionId(),
      close: () => undefined,
      send: (update) => sink.push(update),
    });
  }

  const outbox = new RecordingOutboxDatabase();
  // The dispatcher has no character access of its own, so the observers each
  // seat sees through are injected exactly as they are in the real server.
  const dispatcher = new CommandEventOutboxDispatcher(
    outbox,
    sessions,
    undefined,
    (_sessionId, projectedAt) => ({
      projectedAt,
      observersByParticipant: new Map([
        [
          'player-001',
          [{ position: { x: 0, y: 0 }, footprint: { width: 1, height: 1 } }],
        ],
      ]),
    }),
  );
  const now = new Date().toISOString();
  // The stored payload is the authoritative scene, which is right for a durable
  // record. Concealment is a delivery-time decision, so the row keeps the
  // secret and the store is what withholds it.
  const authoritative: SceneStateUpdate = {
    type: 'scene_state',
    view: 'authoritative',
    reason: 'entity_placed',
    sessionId: session.sessionId,
    scene: {
      id: 'scene_outbox_1',
      sessionId: session.sessionId,
      name: 'Sunken Chapel',
      grid: { width: 8, height: 8, cellSizeFeet: 5 },
      terrain: null,
      entities: [
        {
          id: 'scene_entity_visible',
          type: 'object',
          name: 'Altar',
          position: { x: 1, y: 1 },
          footprint: { width: 1, height: 1 },
          blocksMovement: true,
          blocksVision: false,
          hidden: false,
          combatant: null,
          meta: {},
        },
        {
          id: 'scene_entity_secret',
          type: 'object',
          name: 'Trapdoor',
          position: { x: 4, y: 4 },
          footprint: { width: 1, height: 1 },
          blocksMovement: true,
          blocksVision: false,
          hidden: true,
          combatant: null,
          meta: {},
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  };

  await outbox.insertCommandEventOutboxRecord({
    eventOrder: 0,
    eventType: 'scene_state',
    idempotencyKey: 'outbox-scene-key',
    outboxId: 'outbox-scene-key:0',
    payload: authoritative as never,
    sessionId: session.sessionId,
  });

  await dispatcher.drainAllUnpublished();

  const dmScene = latestAuthoritativeScene(dmEvents);
  const playerScene = latestProjectedScene(playerEvents);

  assert.equal(dmScene.entities.length, 2);
  assert.equal(playerScene.entities.length, 1);
  assert.equal(playerScene.entities[0]?.id, 'scene_entity_visible');
  assert.equal(
    JSON.stringify(playerEvents).includes('scene_entity_secret'),
    false,
  );
  assert.equal(
    (await outbox.listUnpublishedCommandEventOutboxRecords()).length,
    0,
    'the row was marked published',
  );
});

/** The smallest outbox that can hold a row and hand it back once. */
class RecordingOutboxDatabase implements CommandEventOutboxDatabase {
  private readonly rows = new Map<string, CommandEventOutboxRow>();

  async insertCommandEventOutboxRecord(
    write: CommandEventOutboxRecordWrite,
  ): Promise<CommandEventOutboxRow | null> {
    if (this.rows.has(write.outboxId)) {
      return null;
    }

    const row: CommandEventOutboxRow = {
      createdAt: new Date(),
      eventOrder: write.eventOrder,
      eventType: write.eventType,
      idempotencyKey: write.idempotencyKey,
      outboxId: write.outboxId,
      payload: structuredClone(write.payload),
      publishedAt: null,
      sessionId: write.sessionId,
    };

    this.rows.set(row.outboxId, row);

    return structuredClone(row);
  }

  async getUnpublishedCommandEventOutboxBacklog(): Promise<CommandEventOutboxBacklog> {
    const rows = await this.listUnpublishedCommandEventOutboxRecords();

    return {
      countsByEventType: {},
      oldestCreatedAt: rows[0]?.createdAt ?? null,
      totalCount: rows.length,
    };
  }

  async listUnpublishedCommandEventOutboxRecords(
    limit?: number,
  ): Promise<CommandEventOutboxRow[]> {
    const rows = [...this.rows.values()]
      .filter((row) => row.publishedAt === null)
      .sort((left, right) => left.eventOrder - right.eventOrder)
      .map((row) => structuredClone(row));

    return limit === undefined ? rows : rows.slice(0, limit);
  }

  async listUnpublishedCommandEventOutboxRecordsByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CommandEventOutboxRow[]> {
    return (await this.listUnpublishedCommandEventOutboxRecords()).filter(
      (row) => row.idempotencyKey === idempotencyKey,
    );
  }

  async markCommandEventOutboxRecordPublished(
    outboxId: string,
  ): Promise<CommandEventOutboxRow | null> {
    const row = this.rows.get(outboxId);

    if (!row || row.publishedAt) {
      return null;
    }

    row.publishedAt = new Date();

    return structuredClone(row);
  }
}

type StreamHandle = {
  close: () => void;
  raw: () => string;
};

/**
 * A real SSE subscription over the HTTP handler.
 *
 * Used where the assertion has to be about bytes rather than objects: the
 * in-process subscriber helper above hands back parsed events, which is exactly
 * the representation a client-side filter would also produce.
 */
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
    raw: () => response.body,
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
