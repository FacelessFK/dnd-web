import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateAbilityModifier,
  calculatePassivePerception,
  calculateProficiencyBonus,
} from '@dnd/rules';

import { CharacterStoreError } from './character-store.js';
import { InMemoryGameRuntime } from './game-runtime.js';
import { RulesProfileStoreError } from './rules-profile-store.js';

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
) {
  return runtime.createCharacter({
    commandId: 'create-character-1',
    type: 'create_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      ownerParticipantId: 'player-001',
      character: {
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
