/**
 * Leak tests for concealed combatants in encounter state and combat events.
 *
 * The sibling of `scene-visibility-runtime.test.ts`. That file closed the scene
 * payload; this one closes the encounter read model, the `encounter_state`
 * stream, and the `combat_event` stream, which kept carrying a hidden
 * combatant's scene entity ID - and its health - to every player.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { CombatEvent, SessionStreamEvent } from '@dnd/protocol';

import { InMemoryCharacterStore } from './character-store.js';
import { InMemoryGameRuntime } from './game-runtime.js';

const TEST_D20 = 10;
const TEST_DAMAGE_DIE = 3;

const HIDDEN_COMBATANT_NAME = 'Lurking Ambusher';
const VISIBLE_COMBATANT_NAME = 'Ash Goblin';

function createTestRuntime() {
  return new InMemoryGameRuntime<InMemoryCharacterStore>(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => TEST_D20,
    undefined,
    undefined,
    undefined,
    undefined,
    () => TEST_DAMAGE_DIE,
    () => TEST_D20,
  );
}

/**
 * A live table with one player character placed and two DM combatants: one the
 * players can see, one the DM concealed.
 */
function createEncounterTable() {
  const runtime = createTestRuntime();
  const session = runtime.createSession({
    commandId: 'create-session-encounter-visibility',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: { rulesProfileId: 'dnd5e-2024-core' },
  });
  const sessionId = session.sessionId;

  runtime.joinSession({
    commandId: 'join-session-encounter-visibility',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: { sessionId },
  });

  const character = runtime.createCharacter({
    commandId: 'create-character-encounter-visibility',
    type: 'create_character',
    actor: { participantId: 'player-001' },
    payload: {
      sessionId,
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 5,
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 },
        hp: { max: 26, current: 26, temp: 0 },
        armorClass: 13,
        speed: 30,
        notes: 'A careful scholar.',
      },
    },
  });

  runtime.assignCharacterToParticipant({
    commandId: 'assign-character-encounter-visibility',
    type: 'assign_character_to_participant',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId: character.character.id,
    },
  });

  const scene = runtime.createScene({
    commandId: 'create-scene-encounter-visibility',
    type: 'create_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      scene: {
        name: 'Ambush Corridor',
        grid: { width: 10, height: 8, cellSizeFeet: 5 },
      },
    },
  });

  runtime.activateSceneForSession({
    commandId: 'activate-scene-encounter-visibility',
    type: 'activate_scene_for_session',
    actor: { participantId: 'dm-001' },
    payload: { sessionId, sceneId: scene.id },
  });

  runtime.placeCharacterInActiveScene({
    commandId: 'place-character-encounter-visibility',
    type: 'place_character_in_active_scene',
    actor: { participantId: 'player-001' },
    payload: {
      sessionId,
      participantId: 'player-001',
      position: { x: 0, y: 0 },
    },
  });

  const visibleCombatant = createCombatant(runtime, sessionId, {
    hidden: false,
    name: VISIBLE_COMBATANT_NAME,
    position: { x: 1, y: 0 },
  });
  // Both combatants sit adjacent to the character at (0,0) so either can make
  // a baseline melee attack against it.
  const hiddenCombatant = createCombatant(runtime, sessionId, {
    hidden: true,
    name: HIDDEN_COMBATANT_NAME,
    position: { x: 0, y: 1 },
  });

  return {
    hiddenCombatantId: hiddenCombatant.id,
    runtime,
    scene,
    sessionId,
    visibleCombatantId: visibleCombatant.id,
  };
}

function createCombatant(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  options: {
    hidden: boolean;
    name: string;
    position: { x: number; y: number };
  },
) {
  // The command returns the updated scene, so the new entity is looked up by
  // name to recover its generated scene entity ID.
  const scene = runtime.dmCreateCombatantInActiveScene({
    commandId: `dm-create-combatant-${options.name}`,
    type: 'dm_create_combatant_in_active_scene',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      combatant: {
        kind: 'monster',
        name: options.name,
        position: options.position,
        footprint: { width: 1, height: 1 },
        hidden: options.hidden,
        hp: { max: 8, current: 8, temp: 0 },
        armorClass: 12,
        speed: 30,
        abilities: { str: 14, dex: 12, con: 12, int: 8, wis: 10, cha: 8 },
      },
    },
  });
  const created = scene.entities.find((entity) => entity.name === options.name);

  assert.ok(created, `combatant "${options.name}" was not added to the scene`);

  return created;
}

function startEncounter(runtime: InMemoryGameRuntime, sessionId: string) {
  return runtime.startEncounter({
    commandId: 'start-encounter-visibility',
    type: 'start_encounter',
    actor: { participantId: 'dm-001' },
    payload: { sessionId },
  });
}

function getEncounterStateAs(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
) {
  return runtime.getEncounterState({
    commandId: `get-encounter-state-${participantId}`,
    type: 'get_encounter_state',
    actor: { participantId },
    payload: { sessionId },
  });
}

function subscribeAs(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
): SessionStreamEvent[] {
  const received: SessionStreamEvent[] = [];

  runtime.connectParticipant(sessionId, participantId, {
    connectionId: `connection-${participantId}`,
    close: () => undefined,
    send: (update) => {
      received.push(update);
    },
  });

  return received;
}

test('a player never receives a concealed combatant ID in encounter state', () => {
  const { hiddenCombatantId, runtime, sessionId, visibleCombatantId } =
    createEncounterTable();

  startEncounter(runtime, sessionId);

  const dmEncounter = getEncounterStateAs(runtime, sessionId, 'dm-001');
  const playerEncounter = getEncounterStateAs(runtime, sessionId, 'player-001');

  // The DM stays omniscient.
  assert.ok(JSON.stringify(dmEncounter).includes(hiddenCombatantId));

  // The player must not be able to correlate the hidden creature's entity ID
  // against map data or later combat events.
  assert.ok(!JSON.stringify(playerEncounter).includes(hiddenCombatantId));
  assert.ok(JSON.stringify(playerEncounter).includes(visibleCombatantId));
});

test('a concealed combatant keeps its slot so turn indexes stay aligned', () => {
  const { runtime, sessionId } = createEncounterTable();

  startEncounter(runtime, sessionId);

  const dmEncounter = getEncounterStateAs(runtime, sessionId, 'dm-001');
  const playerEncounter = getEncounterStateAs(runtime, sessionId, 'player-001');

  // Same length and same current index: `currentTurnIndex` is a positional
  // index into this array, so dropping entries for players would silently point
  // the turn rail at a different actor than the DM sees.
  assert.equal(
    playerEncounter.participants.length,
    dmEncounter.participants.length,
  );
  assert.equal(playerEncounter.currentTurnIndex, dmEncounter.currentTurnIndex);
  assert.deepEqual(
    playerEncounter.participants.map((participant) => participant.initiative),
    dmEncounter.participants.map((participant) => participant.initiative),
  );

  const concealed = playerEncounter.participants.filter(
    (participant) => participant.kind === 'concealed_combatant',
  );

  assert.equal(concealed.length, 1);
});

test('the authoritative encounter is never rewritten with a projected view', () => {
  const { hiddenCombatantId, runtime, sessionId } = createEncounterTable();

  startEncounter(runtime, sessionId);

  // Read as a player first: if projection leaked into stored state, this read
  // would strip the combatant permanently and the DM would lose it too.
  getEncounterStateAs(runtime, sessionId, 'player-001');

  const dmEncounter = getEncounterStateAs(runtime, sessionId, 'dm-001');

  assert.ok(JSON.stringify(dmEncounter).includes(hiddenCombatantId));
  assert.equal(
    dmEncounter.participants.some(
      (participant) => participant.kind === 'concealed_combatant',
    ),
    false,
  );
});

test('encounter_state stream events are projected per subscriber role', () => {
  const { hiddenCombatantId, runtime, sessionId } = createEncounterTable();
  const dmUpdates = subscribeAs(runtime, sessionId, 'dm-001');
  const playerUpdates = subscribeAs(runtime, sessionId, 'player-001');

  startEncounter(runtime, sessionId);

  const dmEncounterEvents = dmUpdates.filter(
    (update) => update.type === 'encounter_state',
  );
  const playerEncounterEvents = playerUpdates.filter(
    (update) => update.type === 'encounter_state',
  );

  assert.ok(dmEncounterEvents.length > 0);
  // Both roles still receive the event - only its contents differ.
  assert.equal(playerEncounterEvents.length, dmEncounterEvents.length);
  assert.ok(JSON.stringify(dmEncounterEvents).includes(hiddenCombatantId));
  assert.ok(!JSON.stringify(playerEncounterEvents).includes(hiddenCombatantId));
});

test('a concealed attacker does not reveal its ID or HP over combat events', () => {
  const { hiddenCombatantId, runtime, sessionId } = createEncounterTable();
  const dmUpdates = subscribeAs(runtime, sessionId, 'dm-001');
  const playerUpdates = subscribeAs(runtime, sessionId, 'player-001');

  startEncounter(runtime, sessionId);

  // Drive turns until the hidden combatant is the actor, then have it attack
  // the player character.
  advanceToCombatant(runtime, sessionId, hiddenCombatantId);

  runtime.dmCombatantAttack({
    commandId: 'dm-combatant-attack-visibility',
    type: 'dm_combatant_attack',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      combatantId: hiddenCombatantId,
      targetParticipantId: 'player-001',
    },
  });

  const dmCombat = combatEvents(dmUpdates);
  const playerCombat = combatEvents(playerUpdates);

  assert.equal(dmCombat.length, 1);
  // The player must still learn they were attacked and what it did to them.
  assert.equal(playerCombat.length, 1);

  const [dmEvent] = dmCombat;
  const [playerEvent] = playerCombat;

  assert.ok(dmEvent);
  assert.ok(playerEvent);
  assert.equal(dmEvent.attackerCombatantId, hiddenCombatantId);
  assert.equal(playerEvent.attackerCombatantId, undefined);
  assert.equal(playerEvent.attackerConcealed, true);
  // The player is the target here, so their own HP is still reported.
  assert.ok(playerEvent.targetHp);
  assert.equal(playerEvent.roll.total, dmEvent.roll.total);
  assert.ok(!JSON.stringify(playerEvent).includes(hiddenCombatantId));
});

test('a visible combatant is unaffected by the projection', () => {
  const { runtime, sessionId, visibleCombatantId } = createEncounterTable();
  const playerUpdates = subscribeAs(runtime, sessionId, 'player-001');

  startEncounter(runtime, sessionId);
  advanceToCombatant(runtime, sessionId, visibleCombatantId);

  runtime.dmCombatantAttack({
    commandId: 'dm-combatant-attack-visible',
    type: 'dm_combatant_attack',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      combatantId: visibleCombatantId,
      targetParticipantId: 'player-001',
    },
  });

  const [playerEvent] = combatEvents(playerUpdates);

  assert.ok(playerEvent);
  assert.equal(playerEvent.attackerCombatantId, visibleCombatantId);
  assert.equal(playerEvent.attackerConcealed, undefined);
});

function combatEvents(updates: SessionStreamEvent[]): CombatEvent[] {
  return updates.filter(
    (update): update is CombatEvent => update.type === 'combat_event',
  );
}

/** Advances turns until `combatantId` holds the current turn. */
function advanceToCombatant(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  combatantId: string,
): void {
  const encounter = getEncounterStateAs(runtime, sessionId, 'dm-001');

  for (let attempt = 0; attempt < encounter.participants.length; attempt += 1) {
    const current = getEncounterStateAs(runtime, sessionId, 'dm-001');
    const actor = current.participants[current.currentTurnIndex];

    if (actor?.kind === 'combatant' && actor.combatantId === combatantId) {
      return;
    }

    runtime.advanceTurn({
      commandId: `advance-turn-visibility-${attempt}`,
      type: 'advance_turn',
      actor: { participantId: 'dm-001' },
      payload: { sessionId },
    });
  }

  throw new Error(`Combatant "${combatantId}" never became the turn actor.`);
}
