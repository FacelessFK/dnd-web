import assert from 'node:assert/strict';
import test from 'node:test';

import type { CharacterResource, Scene, SceneView } from '@dnd/protocol';

import {
  buildRuntimeEventLabels,
  EMPTY_RUNTIME_EVENT_LABELS,
  EVENT_ACTOR_OTHER_ADVENTURER,
  EVENT_ACTOR_UNKNOWN,
  EVENT_ACTOR_UNSEEN_CREATURE,
  EVENT_ACTOR_YOU,
  isGenericEventActorLabel,
  isOwnEventCharacter,
  isOwnEventParticipant,
  resolveEventCharacterLabel,
  resolveEventCombatantLabel,
  resolveEventCombatSideLabel,
  resolveEventParticipantLabel,
} from './runtime-event-labels';

const ownSeat = 'player-001';
const otherSeat = 'player-002';
const ownCharacterId = 'character_11111111-1111-4111-8111-111111111111';
const goblinId = 'scene_entity_33333333-3333-4333-8333-333333333333';
const hiddenId = 'scene_entity_44444444-4444-4444-8444-444444444444';

function seat(id: string, displayName: string) {
  return { displayName, id };
}

function characterResource(id: string, name: string): CharacterResource {
  return {
    character: { id, name },
    overlay: { activeConditions: [] },
  } as unknown as CharacterResource;
}

function playerProjection(): SceneView {
  return {
    cells: [],
    entities: [
      {
        combatant: { hp: { current: 5, max: 5 } },
        id: goblinId,
        name: 'Grimtooth',
      },
      // A door. Named, but not a combatant, so it is not an actor and does not
      // belong in the actor directory.
      { combatant: null, id: 'scene_entity_door', name: 'Oak Door' },
    ],
    id: 'scene_5f0d0c1a-0000-4000-8000-000000000001',
    view: 'player_projection',
  } as unknown as SceneView;
}

test('a directory names only the seats the current roster still holds', () => {
  const labels = buildRuntimeEventLabels({
    charactersByParticipant: {
      [ownSeat]: characterResource(ownCharacterId, 'Alder Finch'),
      // A character cached from a seat that has since left the roster. Reading
      // the cache directly would let its name outlive the projection that
      // justified it.
      'player-009': characterResource(
        'character_dead',
        'Ghost Of Sessions Past',
      ),
    },
    ownParticipantId: ownSeat,
    participants: [seat(ownSeat, 'Faye'), seat(otherSeat, 'Rohan')],
    scene: playerProjection(),
  });

  assert.deepEqual(Object.keys(labels.participantNames).sort(), [
    ownSeat,
    otherSeat,
  ]);
  assert.deepEqual(Object.keys(labels.characterNames), [ownCharacterId]);
  assert.equal(labels.ownCharacterId, ownCharacterId);
});

test('a held character name outranks the seat display name', () => {
  // The board draws the character; the feed has to call the same figure the
  // same thing, or the two surfaces name one actor two ways.
  const labels = buildRuntimeEventLabels({
    charactersByParticipant: {
      [ownSeat]: characterResource(ownCharacterId, 'Alder Finch'),
    },
    ownParticipantId: ownSeat,
    participants: [seat(ownSeat, 'Faye'), seat(otherSeat, 'Rohan')],
    scene: null,
  });

  assert.equal(labels.participantNames[ownSeat], 'Alder Finch');
  assert.equal(labels.participantNames[otherSeat], 'Rohan');
});

test('only combatants become actors, and only from the current projection', () => {
  const labels = buildRuntimeEventLabels({
    charactersByParticipant: {},
    ownParticipantId: ownSeat,
    participants: [],
    scene: playerProjection(),
  });

  // The concealed creature was never delivered, so it cannot be named, and the
  // door is not an actor. This is the projection doing the work, not a filter
  // here.
  assert.deepEqual({ ...labels.combatantNames }, { [goblinId]: 'Grimtooth' });
});

test("a GM's authoritative scene names its concealed creatures", () => {
  // The inverse assertion, so the test above cannot pass because the walk found
  // nothing. A GM is entitled to these names; a player's payload never had them.
  const scene = {
    entities: [
      {
        combatant: { hp: { current: 5, max: 5 } },
        hidden: true,
        id: hiddenId,
        name: 'Ambusher',
      },
    ],
    id: 'scene_5f0d0c1a-0000-4000-8000-000000000001',
  } as unknown as Scene;

  const labels = buildRuntimeEventLabels({
    charactersByParticipant: {},
    ownParticipantId: 'dm-001',
    participants: [],
    scene,
  });

  assert.equal(labels.combatantNames[hiddenId], 'Ambusher');
});

test('no resolver returns an identifier when it cannot find a name', () => {
  const empty = EMPTY_RUNTIME_EVENT_LABELS;

  const results = [
    resolveEventParticipantLabel(empty, ownSeat, 'second_person'),
    resolveEventParticipantLabel(empty, ownSeat, 'third_person'),
    resolveEventParticipantLabel(empty, undefined, 'third_person'),
    resolveEventCharacterLabel(empty, ownCharacterId),
    resolveEventCharacterLabel(empty, undefined),
    resolveEventCombatantLabel(empty, goblinId),
    resolveEventCombatantLabel(empty, undefined),
    resolveEventCombatSideLabel(empty, {
      characterId: ownCharacterId,
      combatantId: goblinId,
      concealed: undefined,
      kind: 'combatant',
      participantId: ownSeat,
    }),
    resolveEventCombatSideLabel(empty, {
      characterId: undefined,
      combatantId: undefined,
      concealed: undefined,
      kind: undefined,
      participantId: undefined,
    }),
  ];

  for (const label of results) {
    assert.equal(isGenericEventActorLabel(label), true, label);
    assert.equal(label.includes(ownSeat), false, label);
    assert.equal(label.includes(ownCharacterId), false, label);
    assert.equal(label.includes(goblinId), false, label);
  }
});

test('the reader is second person only where the sentence asks for it', () => {
  const labels = buildRuntimeEventLabels({
    charactersByParticipant: {
      [ownSeat]: characterResource(ownCharacterId, 'Alder Finch'),
    },
    ownParticipantId: ownSeat,
    participants: [seat(ownSeat, 'Faye')],
    scene: null,
  });

  assert.equal(
    resolveEventParticipantLabel(labels, ownSeat, 'second_person'),
    EVENT_ACTOR_YOU,
  );
  // The combat line narrates two actors in one clause, so it stays third
  // person and calls the reader by name.
  assert.equal(
    resolveEventParticipantLabel(labels, ownSeat, 'third_person'),
    'Alder Finch',
  );
  assert.equal(isOwnEventParticipant(labels, ownSeat), true);
  assert.equal(isOwnEventParticipant(labels, otherSeat), false);
  assert.equal(isOwnEventCharacter(labels, ownCharacterId), true);
  assert.equal(isOwnEventCharacter(labels, 'character_other'), false);
});

test('an unseated client is nobody, not everybody', () => {
  // `ownParticipantId` null must never make a lookup match. A directory built
  // before a seat exists would otherwise report every actor as the reader.
  const labels = buildRuntimeEventLabels({
    charactersByParticipant: {},
    ownParticipantId: null,
    participants: [seat(ownSeat, 'Faye')],
    scene: null,
  });

  assert.equal(isOwnEventParticipant(labels, ownSeat), false);
  assert.equal(isOwnEventParticipant(labels, undefined), false);
  assert.equal(isOwnEventCharacter(labels, undefined), false);
  assert.equal(
    resolveEventParticipantLabel(labels, ownSeat, 'second_person'),
    'Faye',
  );
});

test('concealment outranks a name the directory still holds', () => {
  const labels = buildRuntimeEventLabels({
    charactersByParticipant: {},
    ownParticipantId: ownSeat,
    participants: [],
    scene: playerProjection(),
  });

  assert.equal(resolveEventCombatantLabel(labels, goblinId), 'Grimtooth');
  assert.equal(
    resolveEventCombatSideLabel(labels, {
      characterId: undefined,
      combatantId: goblinId,
      concealed: true,
      kind: 'combatant',
      participantId: 'dm-001',
    }),
    EVENT_ACTOR_UNSEEN_CREATURE,
  );
});

test('the generic labels are distinct tokens, not English', () => {
  // They are resolved by `runtime-localization`, so anything that renders one
  // verbatim is a bug the feed tests catch by pattern. Distinctness is what
  // lets those tests tell "unseen creature" from "another adventurer".
  const tokens = [
    EVENT_ACTOR_YOU,
    EVENT_ACTOR_OTHER_ADVENTURER,
    EVENT_ACTOR_UNSEEN_CREATURE,
    EVENT_ACTOR_UNKNOWN,
  ];

  assert.equal(new Set(tokens).size, tokens.length);

  for (const token of tokens) {
    assert.match(token, /^__[a-z_]+__$/);
    assert.equal(isGenericEventActorLabel(token), true);
  }

  assert.equal(isGenericEventActorLabel('Alder Finch'), false);
});
