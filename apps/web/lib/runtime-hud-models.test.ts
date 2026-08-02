import assert from 'node:assert/strict';
import test from 'node:test';

import type { CharacterResource, Scene } from '@dnd/protocol';

import { messages } from './i18n';
import { createDefaultCharacterDraftForm } from './runtime-cockpit-helpers';
import { deriveRuntimePlayerModel } from './runtime-hud-player-model';
import { deriveRuntimeTableModel } from './runtime-hud-table-model';
import { containsInternalIdentifier } from './runtime-shell-view';
import type { SessionSnapshot } from './runtime-cockpit-helpers';

const translate = ((key: string, values?: Record<string, string>) => {
  const template = (messages.en as Record<string, string>)[key];

  assert.ok(template, `missing English message for ${key}`);

  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    values && name in values ? values[name]! : `{${name}}`,
  );
}) as never;

const runtimeCharacterId = 'character_1c9f0a2b-0000-4000-8000-000000000001';

function createCharacter(): CharacterResource {
  return {
    character: {
      abilities: { cha: 10, con: 12, dex: 16, int: 10, str: 10, wis: 12 },
      armorClass: 14,
      background: 'Soldier',
      className: 'Rogue',
      hp: { current: 9, max: 12, temp: 0 },
      id: runtimeCharacterId,
      level: 2,
      name: 'Sable',
      notes: '',
      speciesOrRace: 'Human',
      speed: 30,
      status: 'ready',
    },
    derived: {
      initiativeModifier: 3,
      passivePerception: 11,
      proficiencyBonus: 2,
    },
    overlay: { activeConditions: [] },
  } as unknown as CharacterResource;
}

function createSnapshot(overrides: {
  characterId?: string | null;
  pendingCharacterId?: string | null;
}): SessionSnapshot {
  return {
    participants: [
      {
        characterId: null,
        connectionStatus: 'connected',
        displayName: 'Game Master',
        id: 'dm-001',
        joinedAt: '',
        lastSeenAt: '',
        pendingCharacterId: null,
        role: 'dm',
      },
      {
        characterId: overrides.characterId ?? null,
        connectionStatus: 'connected',
        displayName: 'Player One',
        id: 'player-001',
        joinedAt: '',
        lastSeenAt: '',
        pendingCharacterId: overrides.pendingCharacterId ?? null,
        role: 'player',
      },
      {
        characterId: null,
        connectionStatus: 'connected',
        displayName: 'Player Two',
        id: 'player-002',
        joinedAt: '',
        lastSeenAt: '',
        pendingCharacterId: null,
        role: 'player',
      },
    ],
    session: { activeSceneId: null, id: 'ABC123' },
  } as unknown as SessionSnapshot;
}

function playerModelInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    busyReason: null,
    characterDraft: createDefaultCharacterDraftForm('Player One'),
    charactersByParticipant: {},
    finalizedLibraryEntries: [],
    hasAuthUser: true,
    knownCharacterIds: {},
    libraryLoading: false,
    missingSessionReason: null,
    playerParticipantId: 'player-001',
    selectedLibraryEntryId: '',
    sessionId: 'ABC123',
    sessionState: createSnapshot({}),
    t: translate,
    ...overrides,
  } as Parameters<typeof deriveRuntimePlayerModel>[0];
}

test('a player who has not joined is told to join, not to fix their sheet', () => {
  // The reason chain is the product decision under test: a blocked control has
  // to name the *first* thing standing in the way, or a player fixes a form
  // that was never the problem.
  const model = deriveRuntimePlayerModel(
    playerModelInput({ sessionState: null }),
  );

  assert.equal(model.isJoined, false);
  assert.equal(
    model.reasons.create,
    messages.en['runtime.disabled.joinAsPlayer'],
  );
  assert.equal(
    model.reasons.submit,
    messages.en['runtime.disabled.joinAsPlayer'],
  );
});

test('busy outranks every other reason', () => {
  const model = deriveRuntimePlayerModel(
    playerModelInput({
      busyReason: 'Waiting on join_session.',
      sessionState: null,
    }),
  );

  assert.equal(model.reasons.create, 'Waiting on join_session.');
  assert.equal(model.reasons.update, 'Waiting on join_session.');
});

test('submitted and assigned are different states with different advice', () => {
  const character = createCharacter();

  const submitted = deriveRuntimePlayerModel(
    playerModelInput({
      charactersByParticipant: { 'player-001': character },
      sessionState: createSnapshot({ pendingCharacterId: runtimeCharacterId }),
    }),
  );

  assert.equal(submitted.isCharacterSubmitted, true);
  assert.equal(submitted.isCharacterAssigned, false);
  assert.equal(
    submitted.reasons.submit,
    messages.en['runtime.disabled.characterAwaitingAssignment'],
  );

  const assigned = deriveRuntimePlayerModel(
    playerModelInput({
      charactersByParticipant: { 'player-001': character },
      sessionState: createSnapshot({ characterId: runtimeCharacterId }),
    }),
  );

  assert.equal(assigned.isCharacterAssigned, true);
  assert.equal(
    assigned.reasons.submit,
    messages.en['runtime.disabled.characterAlreadyAssigned'],
  );
});

function tableModelInput(mode: 'dm' | 'player') {
  const snapshot = createSnapshot({ characterId: runtimeCharacterId });

  return {
    actingParticipantId: mode === 'dm' ? 'player-001' : 'player-001',
    activeScene: null,
    attackableCombatants: [
      {
        combatant: {
          hp: { current: 9, max: 12, temp: 0 },
          kind: 'monster',
        },
        hidden: false,
        id: 'scene_entity_9c1d0a2b-0000-4000-8000-000000000002',
        name: 'Watch Hound',
        position: { x: 5, y: 2 },
      },
    ] as unknown as Scene['entities'],
    busyLabel: null,
    busyReason: null,
    charactersByParticipant: { 'player-001': createCharacter() },
    currentTurnCombatantId: null,
    currentTurnParticipantId: null,
    encounter: null,
    entries: [],
    knownCharacterIds: {},
    missingSessionReason: null,
    mode,
    participants: snapshot.participants,
    player: deriveRuntimePlayerModel(
      playerModelInput({
        charactersByParticipant: { 'player-001': createCharacter() },
        sessionState: snapshot,
      }),
    ),
    playerDisplayName: 'Player One',
    playerParticipantId: 'player-001',
    playerParticipantIds: ['player-001', 'player-002'],
    recoveryNotes: [],
    scene: null,
    sceneId: '',
    selection: {
      actorParticipantId: 'player-001',
      cell: { x: 0, y: 0 },
      targetCombatantId: '',
      targetParticipantId: 'player-002',
    },
    sessionId: 'ABC123',
    sessionState: snapshot,
    t: translate,
  } as Parameters<typeof deriveRuntimeTableModel>[0];
}

test("a player's target list names people, never participant IDs", () => {
  const model = deriveRuntimeTableModel(tableModelInput('player'));

  assert.ok(model.attackTargetOptions.length > 0);

  for (const option of model.attackTargetOptions) {
    assert.equal(
      containsInternalIdentifier(option.label),
      false,
      `player target label leaked an identifier: ${option.label}`,
    );
    assert.equal(
      option.label.includes('player-002'),
      false,
      `player target label leaked a participant ID: ${option.label}`,
    );
  }

  // The ID is still carried in the value, because the browser has to name the
  // target in the command it submits. What must not happen is rendering it.
  assert.ok(
    model.attackTargetOptions.some((option) =>
      option.value.includes('player-002'),
    ),
  );
});

test("the GM's target list keeps the IDs their tools are built out of", () => {
  const model = deriveRuntimeTableModel(tableModelInput('dm'));

  assert.ok(
    model.attackTargetOptions.some((option) =>
      option.label.includes('player-002'),
    ),
    'the GM list should carry participant IDs',
  );
});

test('the map only ever learns a name and an HP pair', () => {
  const model = deriveRuntimeTableModel(tableModelInput('dm'));
  const summary = model.mapCharacterSummaries['player-001'];

  assert.ok(summary);
  assert.deepEqual(Object.keys(summary).sort(), ['hp', 'name']);
  assert.equal(summary.name, 'Sable');
  // Narrowing here is the seam the renderer sits behind: it must not be able to
  // reach conditions, abilities or a character ID.
  assert.deepEqual(Object.keys(summary.hp).sort(), ['current', 'max']);
});
