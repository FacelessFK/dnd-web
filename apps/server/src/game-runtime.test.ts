import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CharacterStateUpdate,
  CombatEvent,
  EncounterStateUpdate,
  MovementStateUpdate,
  SessionStreamEvent,
} from '@dnd/protocol';
import {
  calculateAbilityModifier,
  calculatePassivePerception,
  calculateProficiencyBonus,
} from '@dnd/rules';

import {
  CharacterStoreError,
  InMemoryCharacterStore,
} from './character-store.js';
import { EncounterRuntimeError } from './encounter-runtime.js';
import { EncounterStoreError } from './encounter-store.js';
import { InMemoryGameRuntime } from './game-runtime.js';
import { MovementRuntimeError } from './movement-runtime.js';
import { RulesProfileStoreError } from './rules-profile-store.js';
import { SceneStoreError } from './scene-store.js';
import { SessionStoreError } from './session-store.js';

function createRuntimeWithAttackRoll(d20: number) {
  return new InMemoryGameRuntime<InMemoryCharacterStore>(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => d20,
  );
}

function createRuntimeWithAttackRoller(roller: () => number) {
  return new InMemoryGameRuntime<InMemoryCharacterStore>(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    roller,
  );
}

function createSession(runtime: InMemoryGameRuntime) {
  return runtime.createSession({
    commandId: 'create-session-1',
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
}

function joinPlayer(runtime: InMemoryGameRuntime, sessionId: string) {
  return runtime.joinSession({
    commandId: 'join-session-1',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId,
    },
  });
}

function joinSecondPlayer(runtime: InMemoryGameRuntime, sessionId: string) {
  return runtime.joinSession({
    commandId: 'join-session-2',
    type: 'join_session',
    actor: {
      participantId: 'player-002',
      displayName: 'Player Two',
      role: 'player',
    },
    payload: {
      sessionId,
    },
  });
}

function createPlayerCharacter(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  overrides: Partial<
    Parameters<
      InMemoryGameRuntime['createCharacter']
    >[0]['payload']['character']
  > = {},
) {
  return createCharacterForParticipant(
    runtime,
    sessionId,
    'player-001',
    overrides,
  );
}

function createSecondPlayerCharacter(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  overrides: Partial<
    Parameters<
      InMemoryGameRuntime['createCharacter']
    >[0]['payload']['character']
  > = {},
) {
  const defaultCharacter = {
    name: 'Borin',
    className: 'Fighter',
    speciesOrRace: 'Dwarf',
    background: 'Guard',
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
    armorClass: 16,
    notes: 'A shield-bearing frontline guard.',
    meta: {
      favoredWeapon: 'warhammer',
    },
  };

  return createCharacterForParticipant(runtime, sessionId, 'player-002', {
    ...defaultCharacter,
    ...overrides,
    abilities: overrides.abilities ?? defaultCharacter.abilities,
    hp: overrides.hp ?? defaultCharacter.hp,
    meta: overrides.meta ?? defaultCharacter.meta,
  });
}

function createCharacterForParticipant(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  overrides: Partial<
    Parameters<
      InMemoryGameRuntime['createCharacter']
    >[0]['payload']['character']
  > = {},
) {
  const defaultCharacter = {
    name: 'Aria',
    level: 5,
    className: 'Wizard',
    speciesOrRace: 'Elf',
    background: 'Sage',
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
    armorClass: 13,
    speed: 30,
    notes: 'A careful scholar.',
    meta: {
      spellcastingFocus: 'crystal',
    },
  };

  return runtime.createCharacter({
    commandId: `create-character-${participantId}`,
    type: 'create_character',
    actor: {
      participantId,
    },
    payload: {
      sessionId,
      ownerParticipantId: participantId,
      character: {
        ...defaultCharacter,
        ...overrides,
        abilities: overrides.abilities ?? defaultCharacter.abilities,
        hp: overrides.hp ?? defaultCharacter.hp,
        meta: overrides.meta ?? defaultCharacter.meta,
      },
    },
  });
}

function updateCharacterAs(
  runtime: InMemoryGameRuntime,
  actorParticipantId: string,
  sessionId: string,
  characterId: string,
) {
  return runtime.updateCharacter({
    commandId: `update-character-${actorParticipantId}`,
    type: 'update_character',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      characterId,
      character: {
        name: 'Aria Stormborn',
        className: 'Wizard',
        speciesOrRace: 'High Elf',
        background: 'Scholar',
        abilities: {
          str: 8,
          dex: 14,
          con: 14,
          int: 17,
          wis: 12,
          cha: 10,
        },
        hp: {
          max: 27,
          current: 27,
          temp: 0,
        },
        armorClass: 14,
        speed: 30,
        notes: 'Updated in the lifecycle slice.',
        meta: {
          focus: 'orb',
        },
      },
    },
  });
}

function createScene(runtime: InMemoryGameRuntime, sessionId: string) {
  return runtime.createScene({
    commandId: 'create-scene-1',
    type: 'create_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      scene: {
        name: 'Ruined Chapel',
        grid: {
          width: 10,
          height: 8,
          cellSizeFeet: 5,
        },
      },
    },
  });
}

function activateScene(runtime: InMemoryGameRuntime, sessionId: string) {
  const scene = createScene(runtime, sessionId);

  runtime.activateSceneForSession({
    commandId: 'activate-scene-helper',
    type: 'activate_scene_for_session',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      sceneId: scene.id,
    },
  });

  return scene;
}

function assignPlayerCharacter(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  overrides: Partial<
    Parameters<
      InMemoryGameRuntime['createCharacter']
    >[0]['payload']['character']
  > = {},
) {
  const character = createPlayerCharacter(runtime, sessionId, overrides);

  assignCharacter(runtime, sessionId, 'player-001', character.character.id);

  return character;
}

function assignSecondPlayerCharacter(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  overrides: Partial<
    Parameters<
      InMemoryGameRuntime['createCharacter']
    >[0]['payload']['character']
  > = {},
) {
  const character = createSecondPlayerCharacter(runtime, sessionId, overrides);

  assignCharacter(runtime, sessionId, 'player-002', character.character.id);

  return character;
}

function assignCharacter(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  characterId: string,
  actorParticipantId = 'dm-001',
) {
  return runtime.assignCharacterToParticipant({
    commandId: `assign-character-${participantId}`,
    type: 'assign_character_to_participant',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      participantId,
      characterId,
    },
  });
}

function placeAssignedCharacter(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  position = {
    x: 0,
    y: 0,
  },
) {
  return placeAssignedCharacterForParticipant(
    runtime,
    sessionId,
    'player-001',
    position,
  );
}

function placeAssignedCharacterForParticipant(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  position = {
    x: 0,
    y: 0,
  },
  actorParticipantId = participantId,
) {
  return runtime.placeCharacterInActiveScene({
    commandId: `place-character-${participantId}`,
    type: 'place_character_in_active_scene',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      participantId,
      position,
    },
  });
}

function placeEntity(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  sceneId: string,
  overrides: Partial<
    Parameters<
      InMemoryGameRuntime['placeEntityInScene']
    >[0]['payload']['entity']
  > = {},
) {
  return runtime.placeEntityInScene({
    commandId: 'place-entity-1',
    type: 'place_entity_in_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      sceneId,
      entity: {
        type: 'object',
        name: 'Stone Pillar',
        position: {
          x: 2,
          y: 2,
        },
        footprint: {
          width: 1,
          height: 1,
        },
        blocksMovement: true,
        blocksVision: true,
        hidden: false,
        ...overrides,
      },
    },
  });
}

function getMovementUpdates(
  updates: SessionStreamEvent[],
): MovementStateUpdate[] {
  return updates.filter(
    (update): update is MovementStateUpdate => update.type === 'movement_state',
  );
}

function getEncounterUpdates(
  updates: SessionStreamEvent[],
): EncounterStateUpdate[] {
  return updates.filter(
    (update): update is EncounterStateUpdate =>
      update.type === 'encounter_state',
  );
}

function getCombatEvents(updates: SessionStreamEvent[]): CombatEvent[] {
  return updates.filter(
    (update): update is CombatEvent => update.type === 'combat_event',
  );
}

function getCharacterStateUpdates(
  updates: SessionStreamEvent[],
): CharacterStateUpdate[] {
  return updates.filter(
    (update): update is CharacterStateUpdate =>
      update.type === 'character_state',
  );
}

function subscribeToSession(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId = 'dm-001',
) {
  const updates: SessionStreamEvent[] = [];

  runtime.connectParticipant(sessionId, participantId, {
    connectionId: `${participantId}-stream-connection`,
    close: () => undefined,
    send: (update) => {
      updates.push(update);
    },
  });

  return updates;
}

function getActiveSceneState(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  actorParticipantId = 'player-001',
) {
  return runtime.getActiveSceneState({
    commandId: `get-active-scene-state-${actorParticipantId}`,
    type: 'get_active_scene_state',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
    },
  });
}

function startEncounter(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  actorParticipantId = 'dm-001',
) {
  return runtime.startEncounter({
    commandId: `start-encounter-${actorParticipantId}`,
    type: 'start_encounter',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
    },
  });
}

function getEncounterState(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  actorParticipantId = 'dm-001',
) {
  return runtime.getEncounterState({
    commandId: `get-encounter-state-${actorParticipantId}`,
    type: 'get_encounter_state',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
    },
  });
}

function advanceTurn(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  actorParticipantId = 'dm-001',
) {
  return runtime.advanceTurn({
    commandId: `advance-turn-${actorParticipantId}`,
    type: 'advance_turn',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
    },
  });
}

function useAction(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  actorParticipantId = 'player-001',
) {
  return runtime.useAction({
    commandId: `use-action-${actorParticipantId}`,
    type: 'use_action',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
    },
  });
}

function useBonusAction(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  actorParticipantId = 'player-001',
) {
  return runtime.useBonusAction({
    commandId: `use-bonus-action-${actorParticipantId}`,
    type: 'use_bonus_action',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
    },
  });
}

function useReaction(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  actorParticipantId = 'player-001',
) {
  return runtime.useReaction({
    commandId: `use-reaction-${actorParticipantId}`,
    type: 'use_reaction',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
    },
  });
}

function recordMovementUsage(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  amountFeet: number,
  actorParticipantId = 'player-001',
) {
  return runtime.recordMovementUsage({
    commandId: `record-movement-usage-${actorParticipantId}`,
    type: 'record_movement_usage',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      amountFeet,
    },
  });
}

function attack(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  targetParticipantId: string,
  actorParticipantId = 'player-001',
) {
  return runtime.attack({
    commandId: `attack-${actorParticipantId}-${targetParticipantId}`,
    type: 'attack',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      targetParticipantId,
    },
  });
}

function attackCombatant(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  targetCombatantId: string,
  actorParticipantId = 'player-001',
) {
  return runtime.attack({
    commandId: `attack-${actorParticipantId}-${targetCombatantId}`,
    type: 'attack',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      targetCombatantId,
    },
  });
}

function dmSetCharacterCurrentHp(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  characterId: string,
  currentHp: number,
  actorParticipantId = 'dm-001',
) {
  return runtime.dmSetCharacterCurrentHp({
    commandId: `dm-set-hp-${participantId}-${currentHp}`,
    type: 'dm_set_character_current_hp',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      participantId,
      characterId,
      currentHp,
    },
  });
}

function dmSetCharacterActiveConditions(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  characterId: string,
  activeConditions: string[],
  actorParticipantId = 'dm-001',
) {
  return runtime.dmSetCharacterActiveConditions({
    commandId: `dm-set-conditions-${participantId}-${activeConditions.join('-')}`,
    type: 'dm_set_character_active_conditions',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      participantId,
      characterId,
      activeConditions,
    },
  });
}

function dmRepositionCharacterInActiveScene(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  characterId: string,
  position: {
    x: number;
    y: number;
  },
  actorParticipantId = 'dm-001',
) {
  return runtime.dmRepositionCharacterInActiveScene({
    commandId: `dm-reposition-${participantId}-${position.x}-${position.y}`,
    type: 'dm_reposition_character_in_active_scene',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      participantId,
      characterId,
      position,
    },
  });
}

function dmCreateCombatantInActiveScene(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  overrides: Partial<
    Parameters<
      InMemoryGameRuntime['dmCreateCombatantInActiveScene']
    >[0]['payload']['combatant']
  > = {},
  actorParticipantId = 'dm-001',
) {
  return runtime.dmCreateCombatantInActiveScene({
    commandId: `dm-create-combatant-${actorParticipantId}`,
    type: 'dm_create_combatant_in_active_scene',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      combatant: {
        kind: 'monster',
        name: 'Ash Goblin',
        position: {
          x: 2,
          y: 0,
        },
        footprint: {
          width: 1,
          height: 1,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
        abilities: {
          str: 14,
          dex: 12,
          con: 12,
          int: 8,
          wis: 10,
          cha: 8,
        },
        ...overrides,
      },
    },
  });
}

function dmRepositionCombatantInActiveScene(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  combatantId: string,
  position: {
    x: number;
    y: number;
  },
  actorParticipantId = 'dm-001',
) {
  return runtime.dmRepositionCombatantInActiveScene({
    commandId: `dm-reposition-combatant-${combatantId}-${position.x}-${position.y}`,
    type: 'dm_reposition_combatant_in_active_scene',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      combatantId,
      position,
    },
  });
}

function dmSetCombatantCurrentHp(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  combatantId: string,
  currentHp: number,
  actorParticipantId = 'dm-001',
) {
  return runtime.dmSetCombatantCurrentHp({
    commandId: `dm-set-combatant-hp-${combatantId}-${currentHp}`,
    type: 'dm_set_combatant_current_hp',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      combatantId,
      currentHp,
    },
  });
}

function dmCombatantAttack(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  combatantId: string,
  targetParticipantId = 'player-001',
  actorParticipantId = 'dm-001',
) {
  return runtime.dmCombatantAttack({
    commandId: `dm-combatant-attack-${combatantId}-${targetParticipantId}`,
    type: 'dm_combatant_attack',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      combatantId,
      targetParticipantId,
    },
  });
}

function dmSetCurrentTurnUsage(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  turnUsage: {
    actionUsed: boolean;
    bonusActionUsed: boolean;
    reactionUsed: boolean;
    movementUsed: number;
  },
  actorParticipantId = 'dm-001',
) {
  return runtime.dmSetCurrentTurnUsage({
    commandId: `dm-set-turn-usage-${actorParticipantId}-${turnUsage.movementUsed}`,
    type: 'dm_set_current_turn_usage',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      turnUsage,
    },
  });
}

function dmSetCurrentTurnParticipant(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  actorParticipantId = 'dm-001',
) {
  return runtime.dmSetCurrentTurnParticipant({
    commandId: `dm-set-current-turn-${actorParticipantId}-${participantId}`,
    type: 'dm_set_current_turn_participant',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
      participantId,
    },
  });
}

function dmEndActiveEncounter(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  actorParticipantId = 'dm-001',
) {
  return runtime.dmEndActiveEncounter({
    commandId: `dm-end-active-encounter-${actorParticipantId}`,
    type: 'dm_end_active_encounter',
    actor: {
      participantId: actorParticipantId,
    },
    payload: {
      sessionId,
    },
  });
}

function setupEncounterParticipants(
  runtime: InMemoryGameRuntime,
  options: {
    firstCharacterOverrides?: Partial<
      Parameters<
        InMemoryGameRuntime['createCharacter']
      >[0]['payload']['character']
    >;
    secondPosition?: {
      x: number;
      y: number;
    };
    secondCharacterOverrides?: Partial<
      Parameters<
        InMemoryGameRuntime['createCharacter']
      >[0]['payload']['character']
    >;
  } = {},
) {
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  joinSecondPlayer(runtime, session.sessionId);

  const firstCharacter = assignPlayerCharacter(
    runtime,
    session.sessionId,
    options.firstCharacterOverrides,
  );
  const secondCharacter = assignSecondPlayerCharacter(
    runtime,
    session.sessionId,
    options.secondCharacterOverrides,
  );
  const scene = activateScene(runtime, session.sessionId);

  placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });
  placeAssignedCharacterForParticipant(
    runtime,
    session.sessionId,
    'player-002',
    options.secondPosition ?? {
      x: 1,
      y: 0,
    },
  );

  return {
    session,
    scene,
    firstCharacter,
    secondCharacter,
  };
}

function setupDownedCurrentTurnActor(runtime: InMemoryGameRuntime) {
  return setupEncounterParticipants(runtime, {
    firstCharacterOverrides: {
      hp: {
        max: 26,
        current: 0,
        temp: 0,
      },
    },
  });
}

test('derived stat calculations follow the baseline 5e progression', () => {
  assert.equal(calculateAbilityModifier(8), -1);
  assert.equal(calculateAbilityModifier(14), 2);
  assert.equal(calculateProficiencyBonus(1), 2);
  assert.equal(calculateProficiencyBonus(5), 3);
  assert.equal(calculateProficiencyBonus(17), 6);
  assert.equal(
    calculatePassivePerception(
      {
        str: 8,
        dex: 14,
        con: 13,
        int: 16,
        wis: 12,
        cha: 10,
      },
      { perceptionProficient: true, proficiencyBonus: 3 },
    ),
    14,
  );
});

test('sessions reject unknown rules profile references', () => {
  const runtime = new InMemoryGameRuntime();

  assert.throws(
    () => {
      runtime.createSession({
        commandId: 'create-session-invalid-profile',
        type: 'create_session',
        actor: {
          participantId: 'dm-001',
          displayName: 'Dungeon Master',
          role: 'dm',
        },
        payload: {
          rulesProfileId: 'missing-profile',
        },
      });
    },
    (error: unknown) =>
      error instanceof RulesProfileStoreError &&
      error.code === 'rules_profile_not_found',
  );
});

test('create character starts as a draft resource with derived stats', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);

  const resource = createPlayerCharacter(runtime, session.sessionId);

  assert.match(resource.character.id, /^char_[a-f0-9-]{36}$/);
  assert.equal(resource.character.ownerParticipantId, 'player-001');
  assert.equal(resource.character.rulesProfileId, 'dnd5e-2024-core');
  assert.equal(resource.character.status, 'draft');
  assert.equal(resource.derived.proficiencyBonus, 3);
  assert.equal(resource.derived.initiativeModifier, 2);
  assert.equal(resource.derived.passivePerception, 11);
  assert.equal(resource.overlay.position, null);
  assert.equal(resource.rulesProfile.baseRuleset, 'dnd5e-2024');
});

test('get character returns the stored canonical character resource', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const createdCharacter = createPlayerCharacter(runtime, session.sessionId);

  const fetchedCharacter = runtime.getCharacter({
    commandId: 'get-character-1',
    type: 'get_character',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: createdCharacter.character.id,
    },
  });

  assert.equal(fetchedCharacter.character.id, createdCharacter.character.id);
  assert.equal(fetchedCharacter.character.name, 'Aria');
  assert.equal(fetchedCharacter.character.status, 'draft');
  assert.equal(fetchedCharacter.rulesProfile.id, 'dnd5e-2024-core');
});

test('player can edit their own character', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const createdCharacter = createPlayerCharacter(runtime, session.sessionId);

  const updatedCharacter = updateCharacterAs(
    runtime,
    'player-001',
    session.sessionId,
    createdCharacter.character.id,
  );

  assert.equal(updatedCharacter.character.name, 'Aria Stormborn');
  assert.equal(updatedCharacter.character.background, 'Scholar');
  assert.equal(updatedCharacter.character.status, 'draft');
  assert.equal(updatedCharacter.character.meta.focus, 'orb');
});

test('dm can edit a participant character in the same session', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const createdCharacter = createPlayerCharacter(runtime, session.sessionId);

  const updatedCharacter = updateCharacterAs(
    runtime,
    'dm-001',
    session.sessionId,
    createdCharacter.character.id,
  );

  assert.equal(updatedCharacter.character.name, 'Aria Stormborn');
  assert.equal(updatedCharacter.character.abilities.int, 17);
});

test('players cannot edit another participant character', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  joinSecondPlayer(runtime, session.sessionId);
  const createdCharacter = createPlayerCharacter(runtime, session.sessionId);

  assert.throws(
    () => {
      updateCharacterAs(
        runtime,
        'player-002',
        session.sessionId,
        createdCharacter.character.id,
      );
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_participant_session_association',
  );
});

test('finalizing a valid draft marks it ready', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const createdCharacter = createPlayerCharacter(runtime, session.sessionId);

  const finalizedCharacter = runtime.finalizeCharacter({
    commandId: 'finalize-character-1',
    type: 'finalize_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: createdCharacter.character.id,
    },
  });

  assert.equal(finalizedCharacter.character.status, 'ready');
});

test('finalizing an already-ready character is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const createdCharacter = createPlayerCharacter(runtime, session.sessionId);

  runtime.finalizeCharacter({
    commandId: 'finalize-character-1',
    type: 'finalize_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: createdCharacter.character.id,
    },
  });

  assert.throws(
    () => {
      runtime.finalizeCharacter({
        commandId: 'finalize-character-2',
        type: 'finalize_character',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          characterId: createdCharacter.character.id,
        },
      });
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_character_state',
  );
});

test('editing a ready character reopens it as a draft', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const createdCharacter = createPlayerCharacter(runtime, session.sessionId);

  runtime.finalizeCharacter({
    commandId: 'finalize-character-1',
    type: 'finalize_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: createdCharacter.character.id,
    },
  });

  const updatedCharacter = updateCharacterAs(
    runtime,
    'player-001',
    session.sessionId,
    createdCharacter.character.id,
  );

  assert.equal(updatedCharacter.character.status, 'draft');
});

test('assigning a character links it to the participant and broadcasts session state', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const updates: string[] = [];

  joinPlayer(runtime, session.sessionId);

  runtime.connectParticipant(session.sessionId, 'dm-001', {
    connectionId: 'dm-connection-1',
    close: () => undefined,
    send: (update) => {
      updates.push(update.reason);
    },
  });

  const character = createPlayerCharacter(runtime, session.sessionId);
  const assignment = runtime.assignCharacterToParticipant({
    commandId: 'assign-character-1',
    type: 'assign_character_to_participant',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-001',
      characterId: character.character.id,
    },
  });

  assert.equal(assignment.characterId, character.character.id);
  assert.equal(
    assignment.state.participants.find(
      (participant) => participant.id === 'player-001',
    )?.characterId,
    character.character.id,
  );
  assert.equal(updates.at(-1), 'participant_character_assigned');
});

test('player can submit own finalized character for DM assignment', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const updates: string[] = [];

  joinPlayer(runtime, session.sessionId);

  runtime.connectParticipant(session.sessionId, 'dm-001', {
    connectionId: 'dm-connection-1',
    close: () => undefined,
    send: (update) => {
      updates.push(update.reason);
    },
  });

  const character = createPlayerCharacter(runtime, session.sessionId);

  runtime.finalizeCharacter({
    commandId: 'finalize-character-for-submit',
    type: 'finalize_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: character.character.id,
    },
  });

  const submitted = runtime.submitCharacterForAssignment({
    commandId: 'submit-character-1',
    type: 'submit_character_for_assignment',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: character.character.id,
    },
  });
  const participant = submitted.state.participants.find(
    (candidate) => candidate.id === 'player-001',
  );

  assert.equal(submitted.characterId, character.character.id);
  assert.equal(participant?.pendingCharacterId, character.character.id);
  assert.equal(participant?.characterId, null);
  assert.equal(updates.at(-1), 'participant_character_submitted');
});

test('submitting another participant character is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  joinSecondPlayer(runtime, session.sessionId);

  const character = createPlayerCharacter(runtime, session.sessionId);

  runtime.finalizeCharacter({
    commandId: 'finalize-character-for-non-owner-submit',
    type: 'finalize_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: character.character.id,
    },
  });

  assert.throws(
    () => {
      runtime.submitCharacterForAssignment({
        commandId: 'submit-character-non-owner',
        type: 'submit_character_for_assignment',
        actor: {
          participantId: 'player-002',
        },
        payload: {
          sessionId: session.sessionId,
          characterId: character.character.id,
        },
      });
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_participant_session_association',
  );
});

test('draft character submission is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);

  const character = createPlayerCharacter(runtime, session.sessionId);

  assert.throws(
    () => {
      runtime.submitCharacterForAssignment({
        commandId: 'submit-character-draft',
        type: 'submit_character_for_assignment',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          characterId: character.character.id,
        },
      });
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_character_state',
  );
});

test('dm participants cannot submit characters for assignment', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const character = runtime.createCharacter({
    commandId: 'create-dm-character-for-submit',
    type: 'create_character',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      ownerParticipantId: 'dm-001',
      character: {
        name: 'Archivist',
        level: 3,
        className: 'Wizard',
        speciesOrRace: 'Human',
        background: 'Sage',
        abilities: {
          str: 8,
          dex: 12,
          con: 12,
          int: 16,
          wis: 14,
          cha: 10,
        },
        hp: {
          max: 18,
          current: 18,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  runtime.finalizeCharacter({
    commandId: 'finalize-dm-character-for-submit',
    type: 'finalize_character',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: character.character.id,
    },
  });

  assert.throws(
    () => {
      runtime.submitCharacterForAssignment({
        commandId: 'submit-character-dm',
        type: 'submit_character_for_assignment',
        actor: {
          participantId: 'dm-001',
        },
        payload: {
          sessionId: session.sessionId,
          characterId: character.character.id,
        },
      });
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('assignment clears a pending character request', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);

  const character = createPlayerCharacter(runtime, session.sessionId);

  runtime.finalizeCharacter({
    commandId: 'finalize-character-for-pending-clear',
    type: 'finalize_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: character.character.id,
    },
  });
  runtime.submitCharacterForAssignment({
    commandId: 'submit-character-pending-clear',
    type: 'submit_character_for_assignment',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: character.character.id,
    },
  });

  const assigned = assignCharacter(
    runtime,
    session.sessionId,
    'player-001',
    character.character.id,
  );
  const participant = assigned.state.participants.find(
    (candidate) => candidate.id === 'player-001',
  );

  assert.equal(participant?.characterId, character.character.id);
  assert.equal(participant?.pendingCharacterId, null);
});

test('assigning a character to the wrong participant is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  joinSecondPlayer(runtime, session.sessionId);

  const character = createPlayerCharacter(runtime, session.sessionId);

  assert.throws(
    () => {
      runtime.assignCharacterToParticipant({
        commandId: 'assign-character-invalid-target',
        type: 'assign_character_to_participant',
        actor: {
          participantId: 'dm-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-002',
          characterId: character.character.id,
        },
      });
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_participant_session_association',
  );
});

test('dm can set assigned character current HP and broadcast character state', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);
  const characterUpdateCountBefore = getCharacterStateUpdates(updates).length;

  const updatedResource = dmSetCharacterCurrentHp(
    runtime,
    session.sessionId,
    'player-001',
    firstCharacter.character.id,
    12,
  );
  const rereadResource = runtime.getCharacter({
    commandId: 'get-character-after-dm-hp',
    type: 'get_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: firstCharacter.character.id,
    },
  });
  const characterUpdates = getCharacterStateUpdates(updates).slice(
    characterUpdateCountBefore,
  );

  assert.equal(updatedResource.character.hp.current, 12);
  assert.equal(
    updatedResource.character.hp.max,
    firstCharacter.character.hp.max,
  );
  assert.equal(
    updatedResource.character.hp.temp,
    firstCharacter.character.hp.temp,
  );
  assert.equal(rereadResource.character.hp.current, 12);
  assert.equal(characterUpdates.length, 1);
  assert.deepEqual(characterUpdates[0], {
    type: 'character_state',
    reason: 'dm_hp_changed',
    sessionId: session.sessionId,
    participantId: 'player-001',
    characterId: firstCharacter.character.id,
    hp: updatedResource.character.hp,
  });
});

test('players cannot set character HP through the DM control surface', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmSetCharacterCurrentHp(
        runtime,
        session.sessionId,
        'player-001',
        firstCharacter.character.id,
        12,
        'player-001',
      );
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('dm HP override validates target participant assignment', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmSetCharacterCurrentHp(
        runtime,
        session.sessionId,
        'player-002',
        firstCharacter.character.id,
        12,
      );
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_participant_session_association',
  );
});

test('dm HP override rejects values outside the character HP range', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmSetCharacterCurrentHp(
        runtime,
        session.sessionId,
        'player-001',
        firstCharacter.character.id,
        -1,
      );
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_character_hp',
  );

  assert.throws(
    () => {
      dmSetCharacterCurrentHp(
        runtime,
        session.sessionId,
        'player-001',
        firstCharacter.character.id,
        firstCharacter.character.hp.max + 1,
      );
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_character_hp',
  );
});

test('dm setting current turn actor HP to zero feeds existing downed gating', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const encounterUpdateCountBeforeFailure = getEncounterUpdates(updates).length;

  dmSetCharacterCurrentHp(
    runtime,
    session.sessionId,
    'player-001',
    firstCharacter.character.id,
    0,
  );

  assert.throws(
    () => {
      useAction(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'turn_actor_downed',
  );
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdateCountBeforeFailure,
  );
});

test('dm can set assigned character active condition tags and broadcast character state', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);
  const encounter = startEncounter(runtime, session.sessionId);
  const characterUpdateCountBefore = getCharacterStateUpdates(updates).length;
  const movementUpdateCountBefore = getMovementUpdates(updates).length;
  const encounterUpdateCountBefore = getEncounterUpdates(updates).length;
  const combatEventCountBefore = getCombatEvents(updates).length;
  const recordBefore = runtime.characters.getCharacter(
    firstCharacter.character.id,
  );

  const updatedResource = dmSetCharacterActiveConditions(
    runtime,
    session.sessionId,
    'player-001',
    firstCharacter.character.id,
    ['prone', 'frightened'],
  );
  const rereadResource = runtime.getCharacter({
    commandId: 'get-character-after-dm-conditions',
    type: 'get_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: firstCharacter.character.id,
    },
  });
  const characterUpdates = getCharacterStateUpdates(updates).slice(
    characterUpdateCountBefore,
  );

  assert.deepEqual(updatedResource.overlay.activeConditions, [
    'prone',
    'frightened',
  ]);
  assert.deepEqual(rereadResource.overlay.activeConditions, [
    'prone',
    'frightened',
  ]);
  assert.deepEqual(updatedResource.character.hp, recordBefore.character.hp);
  assert.deepEqual(
    updatedResource.overlay.position,
    recordBefore.overlay.position,
  );
  assert.deepEqual(
    updatedResource.overlay.footprint,
    recordBefore.overlay.footprint,
  );
  assert.deepEqual(
    updatedResource.overlay.concentration,
    recordBefore.overlay.concentration,
  );
  assert.equal(
    updatedResource.overlay.currentVisibility,
    recordBefore.overlay.currentVisibility,
  );
  assert.deepEqual(updatedResource.character, recordBefore.character);
  assert.equal(characterUpdates.length, 1);
  assert.equal(characterUpdates[0]?.reason, 'dm_conditions_changed');
  assert.equal(characterUpdates[0]?.characterId, firstCharacter.character.id);
  assert.deepEqual(characterUpdates[0]?.activeConditions, [
    'prone',
    'frightened',
  ]);
  assert.deepEqual(characterUpdates[0]?.hp, recordBefore.character.hp);
  assert.equal(getMovementUpdates(updates).length, movementUpdateCountBefore);
  assert.equal(getEncounterUpdates(updates).length, encounterUpdateCountBefore);
  assert.equal(getCombatEvents(updates).length, combatEventCountBefore);
  assert.deepEqual(getEncounterState(runtime, session.sessionId), encounter);
});

test('players cannot set active condition tags through the DM control surface', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmSetCharacterActiveConditions(
        runtime,
        session.sessionId,
        'player-001',
        firstCharacter.character.id,
        ['prone'],
        'player-001',
      );
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('dm condition tag editing validates target participant assignment', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmSetCharacterActiveConditions(
        runtime,
        session.sessionId,
        'player-002',
        firstCharacter.character.id,
        ['prone'],
      );
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_participant_session_association',
  );
});

test('dm condition tag editing rejects invalid condition lists', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmSetCharacterActiveConditions(
        runtime,
        session.sessionId,
        'player-001',
        firstCharacter.character.id,
        ['prone', ' prone '],
      );
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_condition_list',
  );

  assert.throws(
    () => {
      dmSetCharacterActiveConditions(
        runtime,
        session.sessionId,
        'player-001',
        firstCharacter.character.id,
        [''],
      );
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_condition_list',
  );
});

test('dm can reposition an unplaced assigned character into the active scene', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const character = assignPlayerCharacter(runtime, session.sessionId);
  activateScene(runtime, session.sessionId);

  const updatedResource = dmRepositionCharacterInActiveScene(
    runtime,
    session.sessionId,
    'player-001',
    character.character.id,
    {
      x: 3,
      y: 2,
    },
  );
  const activeSceneState = getActiveSceneState(runtime, session.sessionId);
  const placement = activeSceneState.placedCharacters.find(
    (candidate) => candidate.participantId === 'player-001',
  );

  assert.deepEqual(updatedResource.overlay.position, {
    sceneId: activeSceneState.activeSceneId,
    x: 3,
    y: 2,
  });
  assert.deepEqual(placement?.position, {
    x: 3,
    y: 2,
  });
});

test('dm can reposition an already placed character and emit movement_state', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);
  const movementUpdateCountBefore = getMovementUpdates(updates).length;

  const updatedResource = dmRepositionCharacterInActiveScene(
    runtime,
    session.sessionId,
    'player-001',
    firstCharacter.character.id,
    {
      x: 3,
      y: 3,
    },
  );
  const movementUpdates = getMovementUpdates(updates).slice(
    movementUpdateCountBefore,
  );

  assert.deepEqual(updatedResource.overlay.position, {
    sceneId: movementUpdates[0]?.activeSceneId,
    x: 3,
    y: 3,
  });
  assert.equal(movementUpdates.length, 1);
  assert.equal(movementUpdates[0]?.reason, 'dm_character_repositioned');
  assert.equal(movementUpdates[0]?.characterId, firstCharacter.character.id);
  assert.deepEqual(movementUpdates[0]?.position, {
    x: 3,
    y: 3,
  });
});

test('dm can reposition a character from another scene into the active scene', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);
  const secondScene = runtime.createScene({
    commandId: 'create-second-scene-for-dm-reposition',
    type: 'create_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      scene: {
        name: 'Upper Gallery',
        grid: {
          width: 6,
          height: 6,
          cellSizeFeet: 5,
        },
      },
    },
  });

  runtime.activateSceneForSession({
    commandId: 'activate-second-scene-for-dm-reposition',
    type: 'activate_scene_for_session',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      sceneId: secondScene.id,
    },
  });

  const updatedResource = dmRepositionCharacterInActiveScene(
    runtime,
    session.sessionId,
    'player-001',
    firstCharacter.character.id,
    {
      x: 1,
      y: 1,
    },
  );

  assert.deepEqual(updatedResource.overlay.position, {
    sceneId: secondScene.id,
    x: 1,
    y: 1,
  });
});

test('players cannot reposition characters through the DM control surface', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, firstCharacter } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmRepositionCharacterInActiveScene(
        runtime,
        session.sessionId,
        'player-001',
        firstCharacter.character.id,
        {
          x: 3,
          y: 3,
        },
        'player-001',
      );
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('dm reposition validates active scene and target assignment', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  joinSecondPlayer(runtime, session.sessionId);
  const character = assignPlayerCharacter(runtime, session.sessionId);

  assert.throws(
    () => {
      dmRepositionCharacterInActiveScene(
        runtime,
        session.sessionId,
        'player-001',
        character.character.id,
        {
          x: 0,
          y: 0,
        },
      );
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError && error.code === 'no_active_scene',
  );

  activateScene(runtime, session.sessionId);

  assert.throws(
    () => {
      dmRepositionCharacterInActiveScene(
        runtime,
        session.sessionId,
        'player-999',
        character.character.id,
        {
          x: 0,
          y: 0,
        },
      );
    },
    (error: unknown) =>
      error instanceof SessionStoreError &&
      error.code === 'participant_not_found',
  );

  assert.throws(
    () => {
      dmRepositionCharacterInActiveScene(
        runtime,
        session.sessionId,
        'player-002',
        character.character.id,
        {
          x: 0,
          y: 0,
        },
      );
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'no_assigned_character',
  );
});

test('dm reposition rejects out-of-bounds and blocked destinations', () => {
  const runtime = new InMemoryGameRuntime();
  const { scene, session, firstCharacter } =
    setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmRepositionCharacterInActiveScene(
        runtime,
        session.sessionId,
        'player-001',
        firstCharacter.character.id,
        {
          x: 10,
          y: 0,
        },
      );
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'movement_out_of_bounds',
  );

  placeEntity(runtime, session.sessionId, scene.id, {
    position: {
      x: 2,
      y: 2,
    },
  });

  assert.throws(
    () => {
      dmRepositionCharacterInActiveScene(
        runtime,
        session.sessionId,
        'player-001',
        firstCharacter.character.id,
        {
          x: 2,
          y: 2,
        },
      );
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'movement_destination_blocked',
  );
});

test('dm reposition during an encounter does not spend movement or emit encounter_state', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, secondCharacter } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  dmSetCharacterCurrentHp(
    runtime,
    session.sessionId,
    'player-002',
    secondCharacter.character.id,
    0,
  );

  const movementUpdateCountBefore = getMovementUpdates(updates).length;
  const encounterUpdateCountBefore = getEncounterUpdates(updates).length;

  dmRepositionCharacterInActiveScene(
    runtime,
    session.sessionId,
    'player-002',
    secondCharacter.character.id,
    {
      x: 2,
      y: 0,
    },
  );

  const encounter = getEncounterState(runtime, session.sessionId);

  assert.equal(
    getMovementUpdates(updates).length,
    movementUpdateCountBefore + 1,
  );
  assert.equal(getEncounterUpdates(updates).length, encounterUpdateCountBefore);
  assert.equal(encounter.currentTurnUsage.movementUsed, 0);
});

test('dm can set current encounter turn usage without changing turn ownership', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const startedEncounter = startEncounter(runtime, session.sessionId);
  const updates = subscribeToSession(runtime, session.sessionId);
  const encounterUpdateCountBefore = getEncounterUpdates(updates).length;

  const updatedEncounter = dmSetCurrentTurnUsage(runtime, session.sessionId, {
    actionUsed: true,
    bonusActionUsed: true,
    reactionUsed: true,
    movementUsed: 42,
  });
  const rereadEncounter = getEncounterState(runtime, session.sessionId);
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdateCountBefore,
  );

  assert.deepEqual(updatedEncounter.currentTurnUsage, {
    actionUsed: true,
    bonusActionUsed: true,
    reactionUsed: true,
    movementUsed: 42,
  });
  assert.deepEqual(rereadEncounter.currentTurnUsage, {
    actionUsed: true,
    bonusActionUsed: true,
    reactionUsed: true,
    movementUsed: 42,
  });
  assert.equal(
    updatedEncounter.currentTurnIndex,
    startedEncounter.currentTurnIndex,
  );
  assert.equal(updatedEncounter.roundNumber, startedEncounter.roundNumber);
  assert.deepEqual(
    updatedEncounter.participants,
    startedEncounter.participants,
  );
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'dm_turn_usage_changed');
});

test('dm turn usage override does not mutate character movement or combat state', () => {
  const runtime = new InMemoryGameRuntime();
  const { firstCharacter, session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  const updates = subscribeToSession(runtime, session.sessionId);
  const movementUpdateCountBefore = getMovementUpdates(updates).length;
  const combatEventCountBefore = getCombatEvents(updates).length;
  const characterUpdateCountBefore = getCharacterStateUpdates(updates).length;
  const recordBefore = runtime.characters.getCharacter(
    firstCharacter.character.id,
  );

  dmSetCurrentTurnUsage(runtime, session.sessionId, {
    actionUsed: true,
    bonusActionUsed: false,
    reactionUsed: true,
    movementUsed: 999,
  });

  const recordAfter = runtime.characters.getCharacter(
    firstCharacter.character.id,
  );

  assert.deepEqual(recordAfter.character.hp, recordBefore.character.hp);
  assert.deepEqual(recordAfter.overlay.position, recordBefore.overlay.position);
  assert.equal(getMovementUpdates(updates).length, movementUpdateCountBefore);
  assert.equal(getCombatEvents(updates).length, combatEventCountBefore);
  assert.equal(
    getCharacterStateUpdates(updates).length,
    characterUpdateCountBefore,
  );
});

test('players cannot set current encounter turn usage', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      dmSetCurrentTurnUsage(
        runtime,
        session.sessionId,
        {
          actionUsed: true,
          bonusActionUsed: false,
          reactionUsed: false,
          movementUsed: 0,
        },
        'player-001',
      );
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('dm turn usage override requires an active encounter', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmSetCurrentTurnUsage(runtime, session.sessionId, {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: 0,
      });
    },
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );
});

test('dm can set the current turn participant without changing encounter order or round', () => {
  const runtime = new InMemoryGameRuntime();
  const { firstCharacter, secondCharacter, session } =
    setupEncounterParticipants(runtime);
  const startedEncounter = startEncounter(runtime, session.sessionId);
  const currentParticipant =
    startedEncounter.participants[startedEncounter.currentTurnIndex]!;
  const requestedParticipant = startedEncounter.participants.find(
    (participant) =>
      participant.participantId !== currentParticipant.participantId,
  )!;
  const updates = subscribeToSession(runtime, session.sessionId);

  dmSetCurrentTurnUsage(runtime, session.sessionId, {
    actionUsed: true,
    bonusActionUsed: true,
    reactionUsed: true,
    movementUsed: 15,
  });

  const encounterUpdateCountBefore = getEncounterUpdates(updates).length;
  const movementUpdateCountBefore = getMovementUpdates(updates).length;
  const combatEventCountBefore = getCombatEvents(updates).length;
  const characterUpdateCountBefore = getCharacterStateUpdates(updates).length;
  const firstRecordBefore = runtime.characters.getCharacter(
    firstCharacter.character.id,
  );
  const secondRecordBefore = runtime.characters.getCharacter(
    secondCharacter.character.id,
  );
  const updatedEncounter = dmSetCurrentTurnParticipant(
    runtime,
    session.sessionId,
    requestedParticipant.participantId,
  );
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdateCountBefore,
  );
  const firstRecordAfter = runtime.characters.getCharacter(
    firstCharacter.character.id,
  );
  const secondRecordAfter = runtime.characters.getCharacter(
    secondCharacter.character.id,
  );

  assert.equal(
    updatedEncounter.participants[updatedEncounter.currentTurnIndex]
      ?.participantId,
    requestedParticipant.participantId,
  );
  assert.deepEqual(
    updatedEncounter.participants,
    startedEncounter.participants,
  );
  assert.equal(updatedEncounter.roundNumber, startedEncounter.roundNumber);
  assert.deepEqual(updatedEncounter.currentTurnUsage, {
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    movementUsed: 0,
  });
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'dm_current_turn_changed');
  assert.deepEqual(
    firstRecordAfter.character.hp,
    firstRecordBefore.character.hp,
  );
  assert.deepEqual(
    secondRecordAfter.character.hp,
    secondRecordBefore.character.hp,
  );
  assert.deepEqual(
    firstRecordAfter.overlay.position,
    firstRecordBefore.overlay.position,
  );
  assert.deepEqual(
    secondRecordAfter.overlay.position,
    secondRecordBefore.overlay.position,
  );
  assert.equal(getMovementUpdates(updates).length, movementUpdateCountBefore);
  assert.equal(getCombatEvents(updates).length, combatEventCountBefore);
  assert.equal(
    getCharacterStateUpdates(updates).length,
    characterUpdateCountBefore,
  );
});

test('players cannot set the current turn participant', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const encounter = startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      dmSetCurrentTurnParticipant(
        runtime,
        session.sessionId,
        encounter.participants[0]!.participantId,
        'player-001',
      );
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('dm current turn participant override requires an active encounter', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmSetCurrentTurnParticipant(runtime, session.sessionId, 'player-001');
    },
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );
});

test('dm current turn participant override requires an encounter participant', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      dmSetCurrentTurnParticipant(runtime, session.sessionId, 'player-003');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'invalid_encounter_participant',
  );
});

test('dm can end an active encounter and start a new one later', () => {
  const runtime = new InMemoryGameRuntime();
  const { firstCharacter, session } = setupEncounterParticipants(runtime);
  const activeSceneId = runtime.getSessionSnapshotForParticipant(
    session.sessionId,
    'dm-001',
  ).session.activeSceneId;
  const startedEncounter = startEncounter(runtime, session.sessionId);
  const updates = subscribeToSession(runtime, session.sessionId);
  const encounterUpdateCountBefore = getEncounterUpdates(updates).length;
  const movementUpdateCountBefore = getMovementUpdates(updates).length;
  const combatEventCountBefore = getCombatEvents(updates).length;
  const characterUpdateCountBefore = getCharacterStateUpdates(updates).length;
  const recordBefore = runtime.characters.getCharacter(
    firstCharacter.character.id,
  );

  const endedEncounter = dmEndActiveEncounter(runtime, session.sessionId);
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdateCountBefore,
  );
  const recordAfter = runtime.characters.getCharacter(
    firstCharacter.character.id,
  );
  const snapshotAfterEnd = runtime.getSessionSnapshotForParticipant(
    session.sessionId,
    'dm-001',
  );

  assert.equal(endedEncounter.id, startedEncounter.id);
  assert.equal(endedEncounter.status, 'ended');
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'encounter_ended');
  assert.equal(encounterUpdates[0]?.encounter.status, 'ended');
  assert.equal(snapshotAfterEnd.session.activeSceneId, activeSceneId);
  assert.deepEqual(recordAfter.character.hp, recordBefore.character.hp);
  assert.deepEqual(recordAfter.overlay.position, recordBefore.overlay.position);
  assert.equal(getMovementUpdates(updates).length, movementUpdateCountBefore);
  assert.equal(getCombatEvents(updates).length, combatEventCountBefore);
  assert.equal(
    getCharacterStateUpdates(updates).length,
    characterUpdateCountBefore,
  );
  assert.throws(
    () => {
      getEncounterState(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );

  const nextEncounter = startEncounter(runtime, session.sessionId);

  assert.equal(nextEncounter.status, 'active');
  assert.notEqual(nextEncounter.id, startedEncounter.id);
});

test('players cannot end active encounters', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      dmEndActiveEncounter(runtime, session.sessionId, 'player-001');
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('dm encounter end requires an active encounter', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmEndActiveEncounter(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );
});

test('players cannot create characters for other participants', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  joinSecondPlayer(runtime, session.sessionId);

  assert.throws(
    () => {
      runtime.createCharacter({
        commandId: 'create-character-invalid-owner',
        type: 'create_character',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          ownerParticipantId: 'player-002',
          character: {
            name: 'Borrowed Sheet',
            level: 1,
            className: 'Fighter',
            speciesOrRace: 'Human',
            background: 'Soldier',
            abilities: {
              str: 15,
              dex: 12,
              con: 14,
              int: 10,
              wis: 10,
              cha: 8,
            },
            hp: {
              max: 12,
              current: 12,
              temp: 0,
            },
            armorClass: 16,
            speed: 30,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'invalid_participant_session_association',
  );
});

test('scene creation returns an empty scene that session participants can retrieve', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);

  const scene = createScene(runtime, session.sessionId);
  const fetchedScene = runtime.getScene({
    commandId: 'get-scene-1',
    type: 'get_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      sceneId: scene.id,
    },
  });

  assert.match(scene.id, /^scene_[a-f0-9-]{36}$/);
  assert.equal(scene.sessionId, session.sessionId);
  assert.equal(scene.entities.length, 0);
  assert.equal(fetchedScene.name, 'Ruined Chapel');
});

test('non-DM participants cannot create scenes', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);

  assert.throws(
    () => {
      runtime.createScene({
        commandId: 'player-create-scene-1',
        type: 'create_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          scene: {
            name: 'Player Map',
            grid: {
              cellSizeFeet: 5,
              height: 8,
              width: 8,
            },
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('activating a scene updates the authoritative session snapshot and broadcasts the revision', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const updates: string[] = [];

  runtime.connectParticipant(session.sessionId, 'dm-001', {
    connectionId: 'dm-scene-connection-1',
    close: () => undefined,
    send: (update) => {
      updates.push(update.reason);
    },
  });

  const scene = createScene(runtime, session.sessionId);
  const activation = runtime.activateSceneForSession({
    commandId: 'activate-scene-1',
    type: 'activate_scene_for_session',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      sceneId: scene.id,
    },
  });

  assert.equal(activation.sceneId, scene.id);
  assert.equal(activation.state.session.activeSceneId, scene.id);
  assert.equal(updates.at(-1), 'active_scene_changed');
});

test('placing an entity stores it on the authoritative scene', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const scene = createScene(runtime, session.sessionId);

  const updatedScene = placeEntity(runtime, session.sessionId, scene.id);
  const fetchedScene = runtime.getScene({
    commandId: 'get-scene-after-place-1',
    type: 'get_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      sceneId: scene.id,
    },
  });

  assert.equal(updatedScene.entities.length, 1);
  assert.match(updatedScene.entities[0]!.id, /^scene_entity_[a-f0-9-]{36}$/);
  assert.equal(fetchedScene.entities[0]?.name, 'Stone Pillar');
});

test('non-DM participants cannot place scene entities', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const scene = createScene(runtime, session.sessionId);

  assert.throws(
    () => {
      runtime.placeEntityInScene({
        commandId: 'player-place-entity-1',
        type: 'place_entity_in_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          sceneId: scene.id,
          entity: {
            type: 'object',
            name: 'Player Crate',
            position: {
              x: 2,
              y: 2,
            },
            footprint: {
              height: 1,
              width: 1,
            },
            blocksMovement: true,
            blocksVision: false,
            hidden: false,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('out-of-bounds entity placement is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const scene = createScene(runtime, session.sessionId);

  assert.throws(
    () => {
      placeEntity(runtime, session.sessionId, scene.id, {
        position: {
          x: 9,
          y: 7,
        },
        footprint: {
          width: 2,
          height: 2,
        },
      });
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'scene_entity_out_of_bounds',
  );
});

test('overlapping entity placement is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const scene = createScene(runtime, session.sessionId);

  placeEntity(runtime, session.sessionId, scene.id, {
    position: {
      x: 1,
      y: 1,
    },
    footprint: {
      width: 2,
      height: 2,
    },
  });

  assert.throws(
    () => {
      placeEntity(runtime, session.sessionId, scene.id, {
        position: {
          x: 2,
          y: 2,
        },
      });
    },
    (error: unknown) =>
      error instanceof SceneStoreError && error.code === 'scene_entity_overlap',
  );
});

test('dm can create a combatant in the active scene and players cannot', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  const updatedScene = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      position: {
        x: 2,
        y: 0,
      },
    },
  );
  const combatant = updatedScene.entities.find((entity) => entity.combatant);

  assert.ok(combatant);
  assert.equal(combatant.name, 'Ash Goblin');
  assert.equal(combatant.combatant?.kind, 'monster');
  assert.equal(combatant.blocksMovement, true);

  assert.throws(
    () => {
      dmCreateCombatantInActiveScene(
        runtime,
        session.sessionId,
        {
          position: {
            x: 3,
            y: 0,
          },
        },
        'player-001',
      );
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );
});

test('combatant creation validates grid bounds and occupancy', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      dmCreateCombatantInActiveScene(runtime, session.sessionId, {
        position: {
          x: 99,
          y: 0,
        },
      });
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'scene_entity_out_of_bounds',
  );

  assert.throws(
    () => {
      dmCreateCombatantInActiveScene(runtime, session.sessionId, {
        position: {
          x: 0,
          y: 0,
        },
      });
    },
    (error: unknown) =>
      error instanceof SceneStoreError && error.code === 'scene_entity_overlap',
  );
});

test('combatants block player movement and can be repositioned only by the DM', () => {
  const runtime = new InMemoryGameRuntime();
  const { firstCharacter, session } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      position: {
        x: 2,
        y: 0,
      },
    },
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-into-combatant',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 2,
            y: 0,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'movement_destination_blocked',
  );

  assert.throws(
    () => {
      dmRepositionCombatantInActiveScene(
        runtime,
        session.sessionId,
        combatantId,
        {
          x: 3,
          y: 0,
        },
        'player-001',
      );
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_role_assumption',
  );

  assert.throws(
    () => {
      dmRepositionCombatantInActiveScene(
        runtime,
        session.sessionId,
        combatantId,
        {
          x: 0,
          y: 0,
        },
      );
    },
    (error: unknown) =>
      error instanceof SceneStoreError && error.code === 'scene_entity_overlap',
  );

  const movedScene = dmRepositionCombatantInActiveScene(
    runtime,
    session.sessionId,
    combatantId,
    {
      x: 3,
      y: 0,
    },
  );

  assert.deepEqual(
    movedScene.entities.find((entity) => entity.id === combatantId)?.position,
    {
      x: 3,
      y: 0,
    },
  );
  assert.equal(
    runtime.characters.getCharacter(firstCharacter.character.id).overlay
      .position?.x,
    0,
  );
});

test('dm can set combatant HP and invalid HP is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;

  const updatedScene = dmSetCombatantCurrentHp(
    runtime,
    session.sessionId,
    combatantId,
    4,
  );

  assert.equal(
    updatedScene.entities.find((entity) => entity.id === combatantId)?.combatant
      ?.hp.current,
    4,
  );
  assert.throws(
    () => {
      dmSetCombatantCurrentHp(runtime, session.sessionId, combatantId, 99);
    },
    (error: unknown) =>
      error instanceof SceneStoreError && error.code === 'invalid_character_hp',
  );
});

test('activating a scene from another session is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const firstSession = createSession(runtime);
  const secondSession = runtime.createSession({
    commandId: 'create-session-2',
    type: 'create_session',
    actor: {
      participantId: 'dm-002',
      displayName: 'Second Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'dnd5e-2024-core',
    },
  });
  const secondScene = runtime.createScene({
    commandId: 'create-scene-foreign',
    type: 'create_scene',
    actor: {
      participantId: 'dm-002',
    },
    payload: {
      sessionId: secondSession.sessionId,
      scene: {
        name: 'Foreign Hall',
        grid: {
          width: 6,
          height: 6,
          cellSizeFeet: 5,
        },
      },
    },
  });

  assert.throws(
    () => {
      runtime.activateSceneForSession({
        commandId: 'activate-scene-invalid-session',
        type: 'activate_scene_for_session',
        actor: {
          participantId: 'dm-001',
        },
        payload: {
          sessionId: firstSession.sessionId,
          sceneId: secondScene.id,
        },
      });
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_scene_session_association',
  );
});

test('placing an assigned character into the active scene sets authoritative position', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);
  const scene = activateScene(runtime, session.sessionId);

  const placedCharacter = placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });

  assert.equal(placedCharacter.overlay.position?.sceneId, scene.id);
  assert.equal(placedCharacter.overlay.position?.x, 0);
  assert.equal(placedCharacter.overlay.position?.y, 0);
  assert.deepEqual(placedCharacter.overlay.footprint, {
    width: 1,
    height: 1,
  });
});

test('placing an assigned character broadcasts an authoritative movement update to connected participants', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const dmUpdates: SessionStreamEvent[] = [];
  const playerUpdates: SessionStreamEvent[] = [];

  joinPlayer(runtime, session.sessionId);
  const character = assignPlayerCharacter(runtime, session.sessionId);
  const scene = activateScene(runtime, session.sessionId);

  runtime.connectParticipant(session.sessionId, 'dm-001', {
    connectionId: 'dm-movement-connection-1',
    close: () => undefined,
    send: (update) => {
      dmUpdates.push(update);
    },
  });
  runtime.connectParticipant(session.sessionId, 'player-001', {
    connectionId: 'player-movement-connection-1',
    close: () => undefined,
    send: (update) => {
      playerUpdates.push(update);
    },
  });

  const placedCharacter = placeAssignedCharacter(runtime, session.sessionId, {
    x: 1,
    y: 2,
  });

  const dmMovementUpdate = getMovementUpdates(dmUpdates).at(-1);
  const playerMovementUpdate = getMovementUpdates(playerUpdates).at(-1);

  assert.deepEqual(dmMovementUpdate, playerMovementUpdate);
  assert.equal(dmMovementUpdate?.reason, 'character_placed');
  assert.equal(dmMovementUpdate?.activeSceneId, scene.id);
  assert.equal(dmMovementUpdate?.participantId, 'player-001');
  assert.equal(dmMovementUpdate?.characterId, character.character.id);
  assert.deepEqual(dmMovementUpdate?.position, {
    x: placedCharacter.overlay.position?.x,
    y: placedCharacter.overlay.position?.y,
  });
  assert.deepEqual(
    dmMovementUpdate?.footprint,
    placedCharacter.overlay.footprint,
  );
});

test('movement updates a placed character within the active scene when the destination is legal', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);
  activateScene(runtime, session.sessionId);
  placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });

  const movedCharacter = runtime.moveCharacterInActiveScene({
    commandId: 'move-character-valid',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-001',
      position: {
        x: 2,
        y: 0,
      },
    },
  });

  assert.equal(movedCharacter.overlay.position?.x, 2);
  assert.equal(movedCharacter.overlay.position?.y, 0);
});

test('movement broadcasts an authoritative update that matches stored overlay position', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const receivedUpdates: SessionStreamEvent[] = [];

  joinPlayer(runtime, session.sessionId);
  const assignedCharacter = assignPlayerCharacter(runtime, session.sessionId);
  const scene = activateScene(runtime, session.sessionId);

  runtime.connectParticipant(session.sessionId, 'dm-001', {
    connectionId: 'dm-move-connection-1',
    close: () => undefined,
    send: (update) => {
      receivedUpdates.push(update);
    },
  });

  placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });

  const movedCharacter = runtime.moveCharacterInActiveScene({
    commandId: 'move-character-broadcast',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-001',
      position: {
        x: 3,
        y: 0,
      },
    },
  });

  const movementUpdate = getMovementUpdates(receivedUpdates).at(-1);
  const storedCharacter = runtime.getCharacter({
    commandId: 'get-character-after-move',
    type: 'get_character',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      characterId: assignedCharacter.character.id,
    },
  });

  assert.equal(movementUpdate?.reason, 'character_moved');
  assert.equal(movementUpdate?.activeSceneId, scene.id);
  assert.equal(movementUpdate?.participantId, 'player-001');
  assert.equal(movementUpdate?.characterId, assignedCharacter.character.id);
  assert.deepEqual(movementUpdate?.position, {
    x: movedCharacter.overlay.position?.x,
    y: movedCharacter.overlay.position?.y,
  });
  assert.deepEqual(storedCharacter.overlay.position, {
    sceneId: scene.id,
    x: movementUpdate?.position.x,
    y: movementUpdate?.position.y,
  });
});

test('active-scene placement snapshot reads the authoritative placed characters for the active scene', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const assignedCharacter = assignPlayerCharacter(runtime, session.sessionId);
  const scene = activateScene(runtime, session.sessionId);

  placeAssignedCharacter(runtime, session.sessionId, {
    x: 1,
    y: 2,
  });

  const activeSceneState = getActiveSceneState(
    runtime,
    session.sessionId,
    'dm-001',
  );

  assert.equal(activeSceneState.sessionId, session.sessionId);
  assert.equal(activeSceneState.activeSceneId, scene.id);
  assert.deepEqual(activeSceneState.placedCharacters, [
    {
      characterId: assignedCharacter.character.id,
      participantId: 'player-001',
      position: {
        x: 1,
        y: 2,
      },
      footprint: {
        width: 1,
        height: 1,
      },
    },
  ]);
});

test('active-scene placement snapshot reflects authoritative overlay positions after movement', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const assignedCharacter = assignPlayerCharacter(runtime, session.sessionId);
  activateScene(runtime, session.sessionId);
  placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });

  const movedCharacter = runtime.moveCharacterInActiveScene({
    commandId: 'move-character-before-snapshot',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-001',
      position: {
        x: 2,
        y: 1,
      },
    },
  });
  const activeSceneState = getActiveSceneState(runtime, session.sessionId);

  assert.deepEqual(activeSceneState.placedCharacters, [
    {
      characterId: assignedCharacter.character.id,
      participantId: 'player-001',
      position: {
        x: movedCharacter.overlay.position!.x,
        y: movedCharacter.overlay.position!.y,
      },
      footprint: movedCharacter.overlay.footprint,
    },
  ]);
});

test('reconnected participants can recover the current active-scene placement snapshot with an explicit read', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const assignedCharacter = assignPlayerCharacter(runtime, session.sessionId);
  activateScene(runtime, session.sessionId);
  placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });

  runtime.connectParticipant(session.sessionId, 'player-001', {
    connectionId: 'player-read-connection-1',
    close: () => undefined,
    send: () => undefined,
  });
  runtime.disconnectParticipant(
    session.sessionId,
    'player-001',
    'player-read-connection-1',
  );
  runtime.reconnectSession({
    commandId: 'reconnect-before-active-scene-read',
    type: 'reconnect_session',
    actor: {
      participantId: 'player-001',
      role: 'player',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });

  runtime.moveCharacterInActiveScene({
    commandId: 'move-character-before-reconnect-read',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-001',
      position: {
        x: 3,
        y: 0,
      },
    },
  });

  const activeSceneState = getActiveSceneState(runtime, session.sessionId);

  assert.deepEqual(activeSceneState.placedCharacters, [
    {
      characterId: assignedCharacter.character.id,
      participantId: 'player-001',
      position: {
        x: 3,
        y: 0,
      },
      footprint: {
        width: 1,
        height: 1,
      },
    },
  ]);
});

test('movement out of bounds is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);
  activateScene(runtime, session.sessionId);
  placeAssignedCharacter(runtime, session.sessionId, {
    x: 9,
    y: 0,
  });

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-character-out-of-bounds',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 10,
            y: 0,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'movement_out_of_bounds',
  );
});

test('movement into blocking occupancy is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const scene = activateScene(runtime, session.sessionId);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);
  placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });
  placeEntity(runtime, session.sessionId, scene.id, {
    position: {
      x: 1,
      y: 0,
    },
    blocksMovement: true,
  });

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-character-blocked',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 1,
            y: 0,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'movement_destination_blocked',
  );
});

test('invalid movement does not emit movement updates', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);
  const receivedUpdates: SessionStreamEvent[] = [];
  const scene = activateScene(runtime, session.sessionId);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);

  runtime.connectParticipant(session.sessionId, 'dm-001', {
    connectionId: 'dm-invalid-move-connection-1',
    close: () => undefined,
    send: (update) => {
      receivedUpdates.push(update);
    },
  });

  placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });
  placeEntity(runtime, session.sessionId, scene.id, {
    position: {
      x: 1,
      y: 0,
    },
    blocksMovement: true,
  });

  const movementUpdateCount = getMovementUpdates(receivedUpdates).length;

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-character-no-broadcast-on-failure',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 1,
            y: 0,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'movement_destination_blocked',
  );

  assert.equal(getMovementUpdates(receivedUpdates).length, movementUpdateCount);
});

test('movement without an active scene is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-character-no-active-scene',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 1,
            y: 0,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError && error.code === 'no_active_scene',
  );
});

test('active-scene placement snapshot without an active scene is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);

  assert.throws(
    () => {
      getActiveSceneState(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError && error.code === 'no_active_scene',
  );
});

test('movement without an assigned character is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  activateScene(runtime, session.sessionId);

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-character-no-assigned',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 1,
            y: 0,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'no_assigned_character',
  );
});

test('movement when the character has not been placed is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);
  activateScene(runtime, session.sessionId);

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-character-not-placed',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 1,
            y: 0,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'character_not_placed',
  );
});

test('movement beyond the character speed allowance is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);
  activateScene(runtime, session.sessionId);
  placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-character-too-far',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 7,
            y: 0,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError &&
      error.code === 'movement_exceeds_allowance',
  );
});

test('active-scene placement snapshot fails explicitly when stored placement is impossible', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  const assignedCharacter = assignPlayerCharacter(runtime, session.sessionId);
  const scene = activateScene(runtime, session.sessionId);

  const brokenRecord = runtime.characters.getCharacter(
    assignedCharacter.character.id,
  );

  runtime.characters.saveCharacter({
    character: brokenRecord.character,
    overlay: {
      ...brokenRecord.overlay,
      position: {
        sceneId: scene.id,
        x: 99,
        y: 99,
      },
    },
  });

  assert.throws(
    () => {
      getActiveSceneState(runtime, session.sessionId, 'dm-001');
    },
    (error: unknown) =>
      error instanceof CharacterStoreError &&
      error.code === 'internal_server_error',
  );
});

test('active-scene placement snapshot rejects a broken cross-session active scene reference', () => {
  const runtime = new InMemoryGameRuntime();
  const firstSession = createSession(runtime);
  const secondSession = runtime.createSession({
    commandId: 'create-session-for-foreign-active-scene',
    type: 'create_session',
    actor: {
      participantId: 'dm-002',
      displayName: 'Second Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'dnd5e-2024-core',
    },
  });
  const foreignScene = runtime.createScene({
    commandId: 'create-foreign-scene-for-read-consistency',
    type: 'create_scene',
    actor: {
      participantId: 'dm-002',
    },
    payload: {
      sessionId: secondSession.sessionId,
      scene: {
        name: 'Foreign Snapshot Scene',
        grid: {
          width: 8,
          height: 8,
          cellSizeFeet: 5,
        },
      },
    },
  });

  runtime.sessions.activateScene(firstSession.sessionId, foreignScene.id);

  assert.throws(
    () => {
      getActiveSceneState(runtime, firstSession.sessionId, 'dm-001');
    },
    (error: unknown) =>
      error instanceof SceneStoreError &&
      error.code === 'invalid_scene_session_association',
  );
});

test('starting an encounter derives deterministic participants from placed characters in the active scene', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, scene, firstCharacter, secondCharacter } =
    setupEncounterParticipants(runtime);

  const encounter = startEncounter(runtime, session.sessionId);

  assert.match(encounter.id, /^encounter_[a-f0-9-]{36}$/);
  assert.equal(encounter.sessionId, session.sessionId);
  assert.equal(encounter.sceneId, scene.id);
  assert.equal(encounter.status, 'active');
  assert.equal(encounter.currentTurnIndex, 0);
  assert.equal(encounter.roundNumber, 1);
  assert.deepEqual(encounter.currentTurnUsage, {
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    movementUsed: 0,
  });
  assert.deepEqual(encounter.participants, [
    {
      characterId: firstCharacter.character.id,
      participantId: 'player-001',
      initiative: 2,
    },
    {
      characterId: secondCharacter.character.id,
      participantId: 'player-002',
      initiative: 1,
    },
  ]);
});

test('get encounter state returns the authoritative runtime encounter for session members', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const startedEncounter = startEncounter(runtime, session.sessionId);

  const fetchedEncounter = getEncounterState(
    runtime,
    session.sessionId,
    'player-001',
  );

  assert.deepEqual(fetchedEncounter, startedEncounter);
});

test('starting an encounter emits an authoritative encounter_state stream update', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  const encounter = startEncounter(runtime, session.sessionId);
  const streamUpdate = getEncounterUpdates(updates).at(-1);

  assert.ok(streamUpdate);
  assert.equal(streamUpdate?.reason, 'encounter_started');
  assert.deepEqual(streamUpdate?.encounter, encounter);
});

test('active turn participant can use their action exactly once per turn', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);

  const updatedEncounter = useAction(runtime, session.sessionId);
  const streamUpdate = getEncounterUpdates(updates).at(-1);

  assert.equal(updatedEncounter.currentTurnUsage.actionUsed, true);
  assert.equal(updatedEncounter.currentTurnUsage.bonusActionUsed, false);
  assert.ok(streamUpdate);
  assert.equal(streamUpdate?.reason, 'action_used');
  assert.deepEqual(streamUpdate?.encounter, updatedEncounter);
});

test('non-active participants cannot use current-turn actions', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      useAction(runtime, session.sessionId, 'player-002');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'invalid_turn_actor',
  );
});

test('actions cannot be used twice in the same turn', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);
  useAction(runtime, session.sessionId);

  assert.throws(
    () => {
      useAction(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'action_already_used',
  );
});

test('bonus actions cannot be used twice in the same turn', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);
  useBonusAction(runtime, session.sessionId);

  assert.throws(
    () => {
      useBonusAction(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'bonus_action_already_used',
  );
});

test('active turn participant emits encounter_state when using a bonus action', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);

  const updatedEncounter = useBonusAction(runtime, session.sessionId);
  const streamUpdate = getEncounterUpdates(updates).at(-1);

  assert.equal(updatedEncounter.currentTurnUsage.bonusActionUsed, true);
  assert.equal(updatedEncounter.currentTurnUsage.actionUsed, false);
  assert.ok(streamUpdate);
  assert.equal(streamUpdate?.reason, 'bonus_action_used');
  assert.deepEqual(streamUpdate?.encounter, updatedEncounter);
});

test('active turn participant can use their reaction exactly once per turn', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);

  const updatedEncounter = useReaction(runtime, session.sessionId);
  const streamUpdate = getEncounterUpdates(updates).at(-1);

  assert.equal(updatedEncounter.currentTurnUsage.reactionUsed, true);
  assert.equal(updatedEncounter.currentTurnUsage.actionUsed, false);
  assert.equal(updatedEncounter.currentTurnUsage.bonusActionUsed, false);
  assert.ok(streamUpdate);
  assert.equal(streamUpdate?.reason, 'reaction_used');
  assert.deepEqual(streamUpdate?.encounter, updatedEncounter);
});

test('reactions cannot be used twice in the same turn', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  useReaction(runtime, session.sessionId);
  const updateCountBeforeFailure = getEncounterUpdates(updates).length;

  assert.throws(
    () => {
      useReaction(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'reaction_already_used',
  );

  assert.equal(getEncounterUpdates(updates).length, updateCountBeforeFailure);
});

test('non-active participants cannot use current-turn reactions', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      useReaction(runtime, session.sessionId, 'player-002');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'invalid_turn_actor',
  );
});

test('movement usage can be recorded against the current turn allowance', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);

  const updatedEncounter = recordMovementUsage(runtime, session.sessionId, 10);
  const streamUpdate = getEncounterUpdates(updates).at(-1);

  assert.equal(updatedEncounter.currentTurnUsage.movementUsed, 10);
  assert.ok(streamUpdate);
  assert.equal(streamUpdate?.reason, 'movement_used');
  assert.deepEqual(streamUpdate?.encounter, updatedEncounter);
});

test('downed current-turn actors cannot use their action', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupDownedCurrentTurnActor(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const updateCountBeforeFailure = getEncounterUpdates(updates).length;

  assert.throws(
    () => {
      useAction(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'turn_actor_downed',
  );

  const encounter = getEncounterState(runtime, session.sessionId);

  assert.equal(encounter.currentTurnUsage.actionUsed, false);
  assert.equal(getEncounterUpdates(updates).length, updateCountBeforeFailure);
});

test('downed current-turn actors cannot use their bonus action', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupDownedCurrentTurnActor(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const updateCountBeforeFailure = getEncounterUpdates(updates).length;

  assert.throws(
    () => {
      useBonusAction(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'turn_actor_downed',
  );

  const encounter = getEncounterState(runtime, session.sessionId);

  assert.equal(encounter.currentTurnUsage.bonusActionUsed, false);
  assert.equal(getEncounterUpdates(updates).length, updateCountBeforeFailure);
});

test('downed current-turn actors cannot use their reaction', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupDownedCurrentTurnActor(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const updateCountBeforeFailure = getEncounterUpdates(updates).length;

  assert.throws(
    () => {
      useReaction(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'turn_actor_downed',
  );

  const encounter = getEncounterState(runtime, session.sessionId);

  assert.equal(encounter.currentTurnUsage.reactionUsed, false);
  assert.equal(getEncounterUpdates(updates).length, updateCountBeforeFailure);
});

test('downed current-turn actors cannot record movement usage', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupDownedCurrentTurnActor(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const updateCountBeforeFailure = getEncounterUpdates(updates).length;

  assert.throws(
    () => {
      recordMovementUsage(runtime, session.sessionId, 5);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'turn_actor_downed',
  );

  const encounter = getEncounterState(runtime, session.sessionId);

  assert.equal(encounter.currentTurnUsage.movementUsed, 0);
  assert.equal(getEncounterUpdates(updates).length, updateCountBeforeFailure);
});

test('start encounter includes placed player characters and active scene combatants', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      position: {
        x: 2,
        y: 0,
      },
    },
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;

  const encounter = startEncounter(runtime, session.sessionId);

  assert.equal(encounter.participants.length, 3);
  assert.ok(
    encounter.participants.some(
      (participant) =>
        'combatantId' in participant && participant.combatantId === combatantId,
    ),
  );
});

test('mixed turn order can advance to a combatant and DM can spend its action', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      abilities: {
        str: 14,
        dex: 20,
        con: 12,
        int: 8,
        wis: 10,
        cha: 8,
      },
      position: {
        x: 2,
        y: 0,
      },
    },
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;

  const encounter = startEncounter(runtime, session.sessionId);

  assert.deepEqual(encounter.participants[0], {
    kind: 'combatant',
    combatantId,
    participantId: 'dm-001',
    initiative: 5,
  });

  const updatedEncounter = useAction(runtime, session.sessionId, 'dm-001');

  assert.equal(updatedEncounter.currentTurnUsage.actionUsed, true);
});

test('DM-controlled combatant attacks a player character on its turn without rolling on legality failures', () => {
  let rollCount = 0;
  const runtime = createRuntimeWithAttackRoller(() => {
    rollCount += 1;
    return 20;
  });
  const { firstCharacter, session } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      abilities: {
        str: 16,
        dex: 20,
        con: 12,
        int: 8,
        wis: 10,
        cha: 8,
      },
      position: {
        x: 0,
        y: 1,
      },
    },
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const updatedEncounter = dmCombatantAttack(
    runtime,
    session.sessionId,
    combatantId,
    'player-001',
  );
  const targetRecord = runtime.characters.getCharacter(
    firstCharacter.character.id,
  );
  const combatEvent = getCombatEvents(updates).find(
    (event) => event.attackerCombatantId === combatantId,
  );

  assert.equal(updatedEncounter.currentTurnUsage.actionUsed, true);
  assert.equal(targetRecord.character.hp.current, 25);
  assert.equal(rollCount, 1);
  assert.equal(combatEvent?.attackerKind, 'combatant');
  assert.equal(combatEvent?.attackerCombatantId, combatantId);
  assert.equal(combatEvent?.targetCharacterId, firstCharacter.character.id);

  assert.throws(
    () => {
      dmCombatantAttack(runtime, session.sessionId, combatantId, 'player-001');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'action_already_used',
  );
  assert.equal(rollCount, 1);
});

test('defeated current-turn combatants cannot attack before rolling or emitting events', () => {
  let rollCount = 0;
  const runtime = createRuntimeWithAttackRoller(() => {
    rollCount += 1;
    return 20;
  });
  const { session } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      abilities: {
        str: 16,
        dex: 20,
        con: 12,
        int: 8,
        wis: 10,
        cha: 8,
      },
      hp: {
        max: 8,
        current: 1,
        temp: 0,
      },
      position: {
        x: 0,
        y: 1,
      },
    },
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  dmSetCombatantCurrentHp(runtime, session.sessionId, combatantId, 0);
  const encounterUpdateCountBeforeAttack = getEncounterUpdates(updates).length;
  const combatEventCountBeforeAttack = getCombatEvents(updates).length;

  assert.throws(
    () => {
      dmCombatantAttack(runtime, session.sessionId, combatantId, 'player-001');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'turn_actor_downed',
  );
  assert.equal(rollCount, 0);
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdateCountBeforeAttack,
  );
  assert.equal(getCombatEvents(updates).length, combatEventCountBeforeAttack);

  dmSetCombatantCurrentHp(runtime, session.sessionId, combatantId, 1);
  dmCombatantAttack(runtime, session.sessionId, combatantId, 'player-001');

  assert.equal(rollCount, 1);
});

test('current turn owner can resolve an attack that consumes action, applies fixed damage, and emits encounter and combat events', () => {
  const runtime = createRuntimeWithAttackRoll(20);
  const { session, secondCharacter } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const totalEventCountBeforeAttack = updates.length;
  const encounterUpdateCountBeforeAttack = getEncounterUpdates(updates).length;
  const combatEventCountBeforeAttack = getCombatEvents(updates).length;

  const updatedEncounter = attack(runtime, session.sessionId, 'player-002');
  const targetRecord = runtime.characters.getCharacter(
    secondCharacter.character.id,
  );
  const newEvents = updates.slice(totalEventCountBeforeAttack);
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdateCountBeforeAttack,
  );
  const combatEvents = getCombatEvents(updates).slice(
    combatEventCountBeforeAttack,
  );
  const encounterUpdate = encounterUpdates.find(
    (update) => update.reason === 'action_used',
  );
  const combatEvent = combatEvents.find(
    (event) => event.reason === 'attack_resolved',
  );

  assert.equal(updatedEncounter.currentTurnUsage.actionUsed, true);
  assert.equal(targetRecord.character.hp.current, 33);
  assert.deepEqual(
    newEvents.map((event) => event.type),
    ['encounter_state', 'combat_event'],
  );
  assert.equal(encounterUpdates.length, 1);
  assert.equal(combatEvents.length, 1);
  assert.ok(encounterUpdate);
  assert.ok(combatEvent);
  assert.deepEqual(encounterUpdate?.encounter, updatedEncounter);
  assert.equal(combatEvent?.attackerParticipantId, 'player-001');
  assert.equal(combatEvent?.targetParticipantId, 'player-002');
  assert.equal(combatEvent?.targetCharacterId, secondCharacter.character.id);
  assert.deepEqual(combatEvent?.roll, {
    d20: 20,
    modifier: 2,
    total: 22,
  });
  assert.equal(combatEvent?.targetArmorClass, 16);
  assert.equal(combatEvent?.hit, true);
  assert.equal(combatEvent?.damage, 1);
  assert.deepEqual(combatEvent?.targetHp, {
    previous: 34,
    current: 33,
  });
});

test('current turn player character can attack an active scene combatant and emits encounter before combat event', () => {
  const runtime = createRuntimeWithAttackRoll(20);
  const { session, scene } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      position: {
        x: 0,
        y: 1,
      },
    },
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const totalEventCountBeforeAttack = updates.length;
  const updatedEncounter = attackCombatant(
    runtime,
    session.sessionId,
    combatantId,
  );
  const updatedScene = runtime.scenes.getScene(scene.id);
  const targetCombatant = updatedScene.entities.find(
    (entity) => entity.id === combatantId,
  );
  const newEvents = updates.slice(totalEventCountBeforeAttack);
  const combatEvent = getCombatEvents(newEvents)[0];

  assert.equal(updatedEncounter.currentTurnUsage.actionUsed, true);
  assert.equal(targetCombatant?.combatant?.hp.current, 7);
  assert.deepEqual(
    newEvents.map((event) => event.type),
    ['encounter_state', 'combat_event'],
  );
  assert.equal(combatEvent?.attackerKind, 'character');
  assert.equal(combatEvent?.targetKind, 'combatant');
  assert.equal(combatEvent?.targetCombatantId, combatantId);
  assert.equal(combatEvent?.targetParticipantId, 'dm-001');
  assert.deepEqual(combatEvent?.targetHp, {
    previous: 8,
    current: 7,
  });
});

test('missed player attack against a combatant consumes action without changing combatant HP', () => {
  const runtime = createRuntimeWithAttackRoll(1);
  const { session, scene } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      armorClass: 99,
      position: {
        x: 0,
        y: 1,
      },
    },
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;

  startEncounter(runtime, session.sessionId);
  const updatedEncounter = attackCombatant(
    runtime,
    session.sessionId,
    combatantId,
  );
  const updatedScene = runtime.scenes.getScene(scene.id);
  const targetCombatant = updatedScene.entities.find(
    (entity) => entity.id === combatantId,
  );

  assert.equal(updatedEncounter.currentTurnUsage.actionUsed, true);
  assert.equal(targetCombatant?.combatant?.hp.current, 8);
});

test('a miss still consumes action and emits a combat event without changing target HP', () => {
  const runtime = createRuntimeWithAttackRoll(1);
  const { session, secondCharacter } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const encounterUpdateCountBeforeAttack = getEncounterUpdates(updates).length;
  const combatEventCountBeforeAttack = getCombatEvents(updates).length;

  const updatedEncounter = attack(runtime, session.sessionId, 'player-002');
  const targetRecord = runtime.characters.getCharacter(
    secondCharacter.character.id,
  );
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdateCountBeforeAttack,
  );
  const combatEvents = getCombatEvents(updates).slice(
    combatEventCountBeforeAttack,
  );
  const combatEvent = combatEvents.find(
    (event) => event.reason === 'attack_resolved',
  );

  assert.equal(updatedEncounter.currentTurnUsage.actionUsed, true);
  assert.equal(targetRecord.character.hp.current, 34);
  assert.equal(encounterUpdates.length, 1);
  assert.equal(combatEvents.length, 1);
  assert.ok(combatEvent);
  assert.deepEqual(combatEvent?.roll, {
    d20: 1,
    modifier: 2,
    total: 3,
  });
  assert.equal(combatEvent?.hit, false);
  assert.equal(combatEvent?.damage, 0);
  assert.deepEqual(combatEvent?.targetHp, {
    previous: 34,
    current: 34,
  });
});

test('attack damage never reduces target HP below zero', () => {
  const runtime = createRuntimeWithAttackRoll(20);
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  joinSecondPlayer(runtime, session.sessionId);

  assignPlayerCharacter(runtime, session.sessionId);
  const lowHpTarget = assignSecondPlayerCharacter(runtime, session.sessionId, {
    hp: {
      max: 34,
      current: 1,
      temp: 0,
    },
  });
  activateScene(runtime, session.sessionId);

  placeAssignedCharacter(runtime, session.sessionId, {
    x: 0,
    y: 0,
  });
  placeAssignedCharacterForParticipant(
    runtime,
    session.sessionId,
    'player-002',
    {
      x: 1,
      y: 0,
    },
  );

  startEncounter(runtime, session.sessionId);
  attack(runtime, session.sessionId, 'player-002');

  const targetRecord = runtime.characters.getCharacter(
    lowHpTarget.character.id,
  );

  assert.equal(targetRecord.character.hp.current, 0);
});

test('player attack damage defeats combatants without removing them from the scene', () => {
  const runtime = createRuntimeWithAttackRoll(20);
  const { session, scene } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      hp: {
        max: 1,
        current: 1,
        temp: 0,
      },
      position: {
        x: 0,
        y: 1,
      },
    },
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;

  startEncounter(runtime, session.sessionId);
  attackCombatant(runtime, session.sessionId, combatantId);

  const updatedScene = runtime.scenes.getScene(scene.id);
  const targetCombatant = updatedScene.entities.find(
    (entity) => entity.id === combatantId,
  );

  assert.ok(targetCombatant);
  assert.equal(targetCombatant.combatant?.hp.current, 0);
});

test('start encounter excludes combatants that are already defeated', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const sceneWithCombatant = dmCreateCombatantInActiveScene(
    runtime,
    session.sessionId,
    {
      hp: {
        max: 8,
        current: 0,
        temp: 0,
      },
      position: {
        x: 0,
        y: 1,
      },
    },
  );
  const combatantId = sceneWithCombatant.entities.find(
    (entity) => entity.combatant,
  )!.id;

  const encounter = startEncounter(runtime, session.sessionId);

  assert.ok(
    !encounter.participants.some(
      (participant) =>
        'combatantId' in participant && participant.combatantId === combatantId,
    ),
  );
});

test('non-current participants cannot attack and do not consume attack RNG', () => {
  let rollCount = 0;
  const runtime = createRuntimeWithAttackRoller(() => {
    rollCount += 1;
    return 20;
  });
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      attack(runtime, session.sessionId, 'player-001', 'player-002');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'invalid_turn_actor',
  );
  assert.equal(rollCount, 0);
});

test('self-targeted attacks are rejected', () => {
  const runtime = createRuntimeWithAttackRoll(20);
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      attack(runtime, session.sessionId, 'player-001');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'self_target_not_allowed',
  );
});

test('attack targets that are not encounter participants are rejected', () => {
  let rollCount = 0;
  const runtime = createRuntimeWithAttackRoller(() => {
    rollCount += 1;
    return 20;
  });
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);
  runtime.joinSession({
    commandId: 'join-session-3',
    type: 'join_session',
    actor: {
      participantId: 'player-003',
      displayName: 'Player Three',
      role: 'player',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });
  const thirdCharacter = createCharacterForParticipant(
    runtime,
    session.sessionId,
    'player-003',
    {
      name: 'Kara',
      className: 'Rogue',
      speciesOrRace: 'Human',
      background: 'Scout',
      abilities: {
        str: 10,
        dex: 16,
        con: 12,
        int: 12,
        wis: 12,
        cha: 10,
      },
      hp: {
        max: 24,
        current: 24,
        temp: 0,
      },
      armorClass: 14,
      notes: 'Late arrival to the encounter.',
      meta: {
        specialty: 'stealth',
      },
    },
  );

  assignCharacter(
    runtime,
    session.sessionId,
    'player-003',
    thirdCharacter.character.id,
  );

  assert.throws(
    () => {
      attack(runtime, session.sessionId, 'player-003');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'invalid_attack_target',
  );
  assert.equal(rollCount, 0);
});

test('attacks against downed targets are rejected before rolling or emitting stream updates', () => {
  let rollCount = 0;
  const runtime = createRuntimeWithAttackRoller(() => {
    rollCount += 1;
    return 20;
  });
  const { session } = setupEncounterParticipants(runtime, {
    secondCharacterOverrides: {
      hp: {
        max: 34,
        current: 0,
        temp: 0,
      },
    },
  });
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const encounterUpdateCountBeforeAttack = getEncounterUpdates(updates).length;
  const combatEventCountBeforeAttack = getCombatEvents(updates).length;

  assert.throws(
    () => {
      attack(runtime, session.sessionId, 'player-002');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'attack_target_downed',
  );

  assert.equal(rollCount, 0);
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdateCountBeforeAttack,
  );
  assert.equal(getCombatEvents(updates).length, combatEventCountBeforeAttack);
});

test('downed current-turn actors cannot attack before rolling or emitting stream updates', () => {
  let rollCount = 0;
  const runtime = createRuntimeWithAttackRoller(() => {
    rollCount += 1;
    return 20;
  });
  const { session, firstCharacter, secondCharacter } =
    setupDownedCurrentTurnActor(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const encounterUpdateCountBeforeAttack = getEncounterUpdates(updates).length;
  const combatEventCountBeforeAttack = getCombatEvents(updates).length;

  assert.throws(
    () => {
      attack(runtime, session.sessionId, 'player-002');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'turn_actor_downed',
  );

  const encounter = getEncounterState(runtime, session.sessionId);
  const attackerRecord = runtime.characters.getCharacter(
    firstCharacter.character.id,
  );
  const targetRecord = runtime.characters.getCharacter(
    secondCharacter.character.id,
  );

  assert.equal(rollCount, 0);
  assert.equal(attackerRecord.character.hp.current, 0);
  assert.equal(targetRecord.character.hp.current, 34);
  assert.equal(encounter.currentTurnUsage.actionUsed, false);
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdateCountBeforeAttack,
  );
  assert.equal(getCombatEvents(updates).length, combatEventCountBeforeAttack);
});

test('out-of-reach melee attack targets are rejected before rolling', () => {
  let rollCount = 0;
  const runtime = createRuntimeWithAttackRoller(() => {
    rollCount += 1;
    return 20;
  });
  const { session } = setupEncounterParticipants(runtime, {
    secondPosition: {
      x: 2,
      y: 0,
    },
  });
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const encounterUpdateCountBeforeAttack = getEncounterUpdates(updates).length;
  const combatEventCountBeforeAttack = getCombatEvents(updates).length;

  assert.throws(
    () => {
      attack(runtime, session.sessionId, 'player-002');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'attack_target_out_of_reach',
  );
  assert.equal(rollCount, 0);
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdateCountBeforeAttack,
  );
  assert.equal(getCombatEvents(updates).length, combatEventCountBeforeAttack);
});

test('illegal player attacks against combatant targets do not roll or emit events', () => {
  const cases: Array<{
    expectedCode: string;
    name: string;
    setup: (runtime: InMemoryGameRuntime) => {
      sessionId: string;
      targetCombatantId: string;
    };
  }> = [
    {
      expectedCode: 'scene_not_found',
      name: 'missing combatant',
      setup: (runtime) => {
        const { session } = setupEncounterParticipants(runtime);

        startEncounter(runtime, session.sessionId);

        return {
          sessionId: session.sessionId,
          targetCombatantId:
            'scene_entity_99999999-9999-4999-8999-999999999999',
        };
      },
    },
    {
      expectedCode: 'invalid_character_state',
      name: 'passive scene entity',
      setup: (runtime) => {
        const { scene, session } = setupEncounterParticipants(runtime);
        const passiveEntity = placeEntity(
          runtime,
          session.sessionId,
          scene.id,
          {
            position: {
              x: 0,
              y: 1,
            },
          },
        );

        startEncounter(runtime, session.sessionId);

        return {
          sessionId: session.sessionId,
          targetCombatantId: passiveEntity.entities.at(-1)!.id,
        };
      },
    },
    {
      expectedCode: 'invalid_attack_target',
      name: 'combatant not in encounter',
      setup: (runtime) => {
        const { session } = setupEncounterParticipants(runtime);

        startEncounter(runtime, session.sessionId);
        const sceneWithCombatant = dmCreateCombatantInActiveScene(
          runtime,
          session.sessionId,
          {
            position: {
              x: 0,
              y: 1,
            },
          },
        );

        return {
          sessionId: session.sessionId,
          targetCombatantId: sceneWithCombatant.entities.find(
            (entity) => entity.combatant,
          )!.id,
        };
      },
    },
    {
      expectedCode: 'attack_target_downed',
      name: 'defeated combatant',
      setup: (runtime) => {
        const { session } = setupEncounterParticipants(runtime);
        const sceneWithCombatant = dmCreateCombatantInActiveScene(
          runtime,
          session.sessionId,
          {
            hp: {
              max: 8,
              current: 1,
              temp: 0,
            },
            position: {
              x: 0,
              y: 1,
            },
          },
        );
        const combatantId = sceneWithCombatant.entities.find(
          (entity) => entity.combatant,
        )!.id;

        startEncounter(runtime, session.sessionId);
        dmSetCombatantCurrentHp(runtime, session.sessionId, combatantId, 0);

        return {
          sessionId: session.sessionId,
          targetCombatantId: combatantId,
        };
      },
    },
    {
      expectedCode: 'attack_target_out_of_reach',
      name: 'out of reach combatant',
      setup: (runtime) => {
        const { session } = setupEncounterParticipants(runtime);
        const sceneWithCombatant = dmCreateCombatantInActiveScene(
          runtime,
          session.sessionId,
          {
            position: {
              x: 3,
              y: 0,
            },
          },
        );
        const combatantId = sceneWithCombatant.entities.find(
          (entity) => entity.combatant,
        )!.id;

        startEncounter(runtime, session.sessionId);

        return {
          sessionId: session.sessionId,
          targetCombatantId: combatantId,
        };
      },
    },
  ];

  for (const testCase of cases) {
    let rollCount = 0;
    const runtime = createRuntimeWithAttackRoller(() => {
      rollCount += 1;
      return 20;
    });
    const { sessionId, targetCombatantId } = testCase.setup(runtime);
    const updates = subscribeToSession(runtime, sessionId);
    const encounterUpdateCountBeforeAttack =
      getEncounterUpdates(updates).length;
    const combatEventCountBeforeAttack = getCombatEvents(updates).length;

    assert.throws(
      () => {
        attackCombatant(runtime, sessionId, targetCombatantId);
      },
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === testCase.expectedCode,
      testCase.name,
    );
    assert.equal(rollCount, 0, testCase.name);
    assert.equal(
      getEncounterUpdates(updates).length,
      encounterUpdateCountBeforeAttack,
      testCase.name,
    );
    assert.equal(
      getCombatEvents(updates).length,
      combatEventCountBeforeAttack,
      testCase.name,
    );
  }
});

test('failed attack commands emit neither combat_event nor encounter_state updates and do not consume attack RNG', () => {
  let rollCount = 0;
  const runtime = createRuntimeWithAttackRoller(() => {
    rollCount += 1;
    return 20;
  });
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  useAction(runtime, session.sessionId);
  const encounterUpdateCountBeforeAttack = getEncounterUpdates(updates).length;
  const combatEventCountBeforeAttack = getCombatEvents(updates).length;

  assert.throws(
    () => {
      attack(runtime, session.sessionId, 'player-002');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'action_already_used',
  );

  assert.equal(rollCount, 0);
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdateCountBeforeAttack,
  );
  assert.equal(getCombatEvents(updates).length, combatEventCountBeforeAttack);
});

test('invalid movement usage is rejected for negative or excessive values', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      recordMovementUsage(runtime, session.sessionId, -5);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'invalid_movement_usage_amount',
  );

  assert.throws(
    () => {
      recordMovementUsage(runtime, session.sessionId, 35);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'movement_usage_exceeds_allowance',
  );
});

test('encounter-aware movement emits independent encounter_state and movement_state updates', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, scene, firstCharacter } =
    setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const encounterUpdateCountBeforeMove = getEncounterUpdates(updates).length;
  const movementUpdateCountBeforeMove = getMovementUpdates(updates).length;

  const movedCharacter = runtime.moveCharacterInActiveScene({
    commandId: 'move-character-during-encounter',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-001',
      position: {
        x: 0,
        y: 2,
      },
    },
  });
  const encounter = getEncounterState(runtime, session.sessionId);
  const encounterStreamUpdates = getEncounterUpdates(updates).slice(
    encounterUpdateCountBeforeMove,
  );
  const movementStreamUpdates = getMovementUpdates(updates).slice(
    movementUpdateCountBeforeMove,
  );
  const encounterStreamUpdate = encounterStreamUpdates.find(
    (update) => update.reason === 'movement_used',
  );
  const movementStreamUpdate = movementStreamUpdates.find(
    (update) => update.reason === 'character_moved',
  );

  assert.equal(movedCharacter.overlay.position?.sceneId, scene.id);
  assert.equal(movedCharacter.character.id, firstCharacter.character.id);
  assert.equal(encounter.currentTurnUsage.movementUsed, 10);
  assert.equal(encounterStreamUpdates.length, 1);
  assert.equal(movementStreamUpdates.length, 1);
  assert.ok(encounterStreamUpdate);
  assert.ok(movementStreamUpdate);
  assert.equal(encounterStreamUpdate?.reason, 'movement_used');
  assert.deepEqual(encounterStreamUpdate?.encounter, encounter);
  assert.equal(movementStreamUpdate?.participantId, 'player-001');
  assert.equal(movementStreamUpdate?.characterId, firstCharacter.character.id);
  assert.equal(movementStreamUpdate?.activeSceneId, scene.id);
  assert.deepEqual(movementStreamUpdate?.position, {
    x: 0,
    y: 2,
  });
  assert.deepEqual(movementStreamUpdate?.footprint, {
    width: 1,
    height: 1,
  });
});

test('zero-cost encounter movement emits only movement_state and leaves encounter usage unchanged', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, scene, firstCharacter } =
    setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const encounterUpdateCountBeforeMove = getEncounterUpdates(updates).length;
  const movementUpdateCountBeforeMove = getMovementUpdates(updates).length;

  const movedCharacter = runtime.moveCharacterInActiveScene({
    commandId: 'move-character-no-op-position',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-001',
      position: {
        x: 0,
        y: 0,
      },
    },
  });
  const encounter = getEncounterState(runtime, session.sessionId);
  const encounterStreamUpdates = getEncounterUpdates(updates).slice(
    encounterUpdateCountBeforeMove,
  );
  const movementStreamUpdates = getMovementUpdates(updates).slice(
    movementUpdateCountBeforeMove,
  );
  const movementStreamUpdate = movementStreamUpdates.find(
    (update) => update.reason === 'character_moved',
  );

  assert.equal(movedCharacter.overlay.position?.sceneId, scene.id);
  assert.equal(movedCharacter.character.id, firstCharacter.character.id);
  assert.deepEqual(movedCharacter.overlay.position, {
    sceneId: scene.id,
    x: 0,
    y: 0,
  });
  assert.equal(encounter.currentTurnUsage.movementUsed, 0);
  assert.equal(encounterStreamUpdates.length, 0);
  assert.equal(movementStreamUpdates.length, 1);
  assert.ok(movementStreamUpdate);
  assert.equal(movementStreamUpdate?.participantId, 'player-001');
  assert.equal(movementStreamUpdate?.characterId, firstCharacter.character.id);
  assert.equal(movementStreamUpdate?.activeSceneId, scene.id);
  assert.deepEqual(movementStreamUpdate?.position, {
    x: 0,
    y: 0,
  });
});

test('downed current-turn actors cannot move during an active encounter', () => {
  const runtime = new InMemoryGameRuntime();
  const { session, scene, firstCharacter } =
    setupDownedCurrentTurnActor(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  const encounterUpdateCountBeforeMove = getEncounterUpdates(updates).length;
  const movementUpdateCountBeforeMove = getMovementUpdates(updates).length;

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-downed-character-during-encounter',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 0,
            y: 1,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'turn_actor_downed',
  );

  const encounter = getEncounterState(runtime, session.sessionId);
  const record = runtime.characters.getCharacter(firstCharacter.character.id);

  assert.equal(encounter.currentTurnUsage.movementUsed, 0);
  assert.deepEqual(record.overlay.position, {
    sceneId: scene.id,
    x: 0,
    y: 0,
  });
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdateCountBeforeMove,
  );
  assert.equal(
    getMovementUpdates(updates).length,
    movementUpdateCountBeforeMove,
  );
});

test('non-active participants cannot move during another participant turn', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-character-out-of-turn',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-002',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-002',
          position: {
            x: 3,
            y: 0,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'invalid_turn_actor',
  );
});

test('encounter movement spending rejects legal destinations that exceed remaining turn budget', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);
  recordMovementUsage(runtime, session.sessionId, 25);

  assert.throws(
    () => {
      runtime.moveCharacterInActiveScene({
        commandId: 'move-character-over-remaining-budget',
        type: 'move_character_in_active_scene',
        actor: {
          participantId: 'player-001',
        },
        payload: {
          sessionId: session.sessionId,
          participantId: 'player-001',
          position: {
            x: 0,
            y: 2,
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'movement_usage_exceeds_allowance',
  );
});

test('advance turn resets turn usage after real action and movement mutations', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  useAction(runtime, session.sessionId);
  recordMovementUsage(runtime, session.sessionId, 15);

  const advancedEncounter = advanceTurn(runtime, session.sessionId);
  const streamUpdate = getEncounterUpdates(updates).at(-1);

  assert.equal(advancedEncounter.currentTurnIndex, 1);
  assert.equal(advancedEncounter.roundNumber, 1);
  assert.deepEqual(advancedEncounter.currentTurnUsage, {
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    movementUsed: 0,
  });
  assert.ok(streamUpdate);
  assert.equal(streamUpdate?.reason, 'turn_advanced');
  assert.deepEqual(streamUpdate?.encounter, advancedEncounter);
});

test('dm can advance past a downed current-turn actor', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupDownedCurrentTurnActor(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);

  const advancedEncounter = advanceTurn(runtime, session.sessionId);
  const streamUpdate = getEncounterUpdates(updates).at(-1);

  assert.equal(advancedEncounter.currentTurnIndex, 1);
  assert.equal(advancedEncounter.roundNumber, 1);
  assert.deepEqual(advancedEncounter.currentTurnUsage, {
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    movementUsed: 0,
  });
  assert.ok(streamUpdate);
  assert.equal(streamUpdate?.reason, 'turn_advanced');
  assert.deepEqual(streamUpdate?.encounter, advancedEncounter);
});

test('advancing turn wraps to the first participant and increments the round number', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  const secondTurn = advanceTurn(runtime, session.sessionId);
  const wrappedTurn = advanceTurn(runtime, session.sessionId);

  assert.equal(secondTurn.currentTurnIndex, 1);
  assert.equal(secondTurn.roundNumber, 1);
  assert.equal(wrappedTurn.currentTurnIndex, 0);
  assert.equal(wrappedTurn.roundNumber, 2);
});

test('starting an encounter without an active scene is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const session = createSession(runtime);

  joinPlayer(runtime, session.sessionId);
  assignPlayerCharacter(runtime, session.sessionId);

  assert.throws(
    () => {
      startEncounter(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof MovementRuntimeError && error.code === 'no_active_scene',
  );
});

test('starting a duplicate active encounter for a session is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  startEncounter(runtime, session.sessionId);

  assert.throws(
    () => {
      startEncounter(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'encounter_already_active',
  );
});

test('reading or advancing encounter state without an active encounter is rejected', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);

  assert.throws(
    () => {
      getEncounterState(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );

  assert.throws(
    () => {
      advanceTurn(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );

  assert.throws(
    () => {
      useAction(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterStoreError &&
      error.code === 'no_active_encounter',
  );
});

test('failed invalid-turn encounter mutations do not emit encounter_state updates', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);

  const updateCountBeforeFailure = getEncounterUpdates(updates).length;

  assert.throws(
    () => {
      useAction(runtime, session.sessionId, 'player-002');
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'invalid_turn_actor',
  );

  assert.equal(getEncounterUpdates(updates).length, updateCountBeforeFailure);
});

test('failed duplicate action usage does not emit an encounter_state update', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);
  useAction(runtime, session.sessionId);

  const updateCountBeforeFailure = getEncounterUpdates(updates).length;

  assert.throws(
    () => {
      useAction(runtime, session.sessionId);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'action_already_used',
  );

  assert.equal(getEncounterUpdates(updates).length, updateCountBeforeFailure);
});

test('failed excessive movement usage does not emit an encounter_state update', () => {
  const runtime = new InMemoryGameRuntime();
  const { session } = setupEncounterParticipants(runtime);
  const updates = subscribeToSession(runtime, session.sessionId);

  startEncounter(runtime, session.sessionId);

  const updateCountBeforeFailure = getEncounterUpdates(updates).length;

  assert.throws(
    () => {
      recordMovementUsage(runtime, session.sessionId, 35);
    },
    (error: unknown) =>
      error instanceof EncounterRuntimeError &&
      error.code === 'movement_usage_exceeds_allowance',
  );

  assert.equal(getEncounterUpdates(updates).length, updateCountBeforeFailure);
});
