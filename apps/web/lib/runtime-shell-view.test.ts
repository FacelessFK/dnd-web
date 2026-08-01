import assert from 'node:assert/strict';
import test from 'node:test';

import type { CharacterResource, Encounter, Scene } from '@dnd/protocol';

import { messages } from './i18n';
import {
  containsInternalIdentifier,
  selectGameMasterShellView,
  selectPlayerShellView,
  type PlayerShellView,
} from './runtime-shell-view';
import {
  createRuntimeSessionState,
  runtimeSessionReducer,
  type RuntimeSessionState,
} from './runtime-session-state';

const playerIdentity = {
  sessionId: 'ABC123',
  mode: 'player' as const,
  participantId: 'player-001',
};

const gmIdentity = {
  sessionId: 'ABC123',
  mode: 'dm' as const,
  participantId: 'dm-001',
};

/**
 * A scene holding one visible object and one concealed creature.
 *
 * The GM state is built from this directly; the player state is built from the
 * same scene with the hidden entity removed, which is what the server actually
 * sends a player. Building the player fixture by filtering here mirrors the
 * server's projection rather than pretending a player could receive the whole
 * thing.
 */
function createScene(): Scene {
  return {
    id: 'scene_9f3a2b1c',
    sessionId: 'ABC123',
    name: 'Sunken Chapel',
    grid: { width: 12, height: 10, cellSizeFeet: 5 },
    terrain: null,
    entities: [
      {
        id: 'scene_entity_altar',
        type: 'object',
        name: 'Altar',
        position: { x: 2, y: 2 },
        footprint: { width: 1, height: 1 },
        blocksMovement: true,
        blocksVision: false,
        hidden: false,
        combatant: null,
        meta: {},
      },
      {
        id: 'scene_entity_lurker',
        type: 'monster',
        name: 'Bog Lurker',
        position: { x: 6, y: 6 },
        footprint: { width: 1, height: 1 },
        blocksMovement: true,
        blocksVision: false,
        hidden: true,
        combatant: {
          kind: 'monster',
          hp: { max: 33, current: 27, temp: 0 },
          armorClass: 15,
          speed: 30,
          abilities: { str: 14, dex: 12, con: 12, int: 8, wis: 10, cha: 8 },
        },
        meta: {},
      },
    ],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  };
}

function createCharacter(): CharacterResource {
  return {
    character: {
      id: 'character_7c1d',
      ownerParticipantId: 'player-001',
      status: 'ready',
      name: 'Aria Duskwind',
      rulesProfileId: 'dnd5e-2024-core',
      level: 5,
      className: 'Fighter',
      speciesOrRace: 'Human',
      background: 'Soldier',
      abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
      hp: { max: 40, current: 31, temp: 3 },
      armorClass: 17,
      speed: 30,
      notes: null,
      meta: {},
      proficiencies: { savingThrows: [], skills: [] },
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    },
    derived: {
      abilityModifiers: { str: 3, dex: 2, con: 2, int: 0, wis: 0, cha: 0 },
      proficiencyBonus: 3,
      initiativeModifier: 2,
      passivePerception: 10,
      spellSaveDc: null,
    },
    overlay: {
      characterId: 'character_7c1d',
      footprint: { width: 1, height: 1 },
      position: null,
      activeConditions: ['poisoned'],
      concentration: null,
      currentVisibility: 'visible',
    },
    rulesProfile: {
      id: 'dnd5e-2024-core',
      baseRuleset: 'dnd5e-2014',
      strictness: 'dm_led',
      optionalRules: [],
      houseRules: {},
      allowedSources: [],
    },
  };
}

function createEncounter(currentTurnIndex: number): Encounter {
  return {
    id: 'encounter_44ab',
    sessionId: 'ABC123',
    sceneId: 'scene_9f3a2b1c',
    status: 'active',
    participants: [
      {
        kind: 'character',
        characterId: 'character_7c1d',
        participantId: 'player-001',
        initiative: 18,
      },
      {
        kind: 'concealed_combatant',
        participantId: 'dm-001',
        initiative: 12,
      },
    ],
    currentTurnIndex,
    roundNumber: 3,
    currentTurnUsage: {
      actionUsed: false,
      bonusActionUsed: false,
      reactionUsed: false,
      movementUsed: 0,
    },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  };
}

/** The player's state, holding the projected scene the server would send. */
function playerState(currentTurnIndex = 0): RuntimeSessionState {
  const projected: Scene = {
    ...createScene(),
    entities: createScene().entities.filter((entity) => !entity.hidden),
  };
  let state = createRuntimeSessionState(playerIdentity);

  state = runtimeSessionReducer(state, {
    type: 'scene_received',
    scene: projected,
  });
  state = runtimeSessionReducer(state, {
    type: 'character_remembered',
    character: createCharacter(),
  });
  state = runtimeSessionReducer(state, {
    type: 'encounter_received',
    encounter: createEncounter(currentTurnIndex),
  });
  state = runtimeSessionReducer(state, {
    type: 'connection_changed',
    status: 'connected',
  });

  return state;
}

function gmState(): RuntimeSessionState {
  let state = createRuntimeSessionState(gmIdentity);

  state = runtimeSessionReducer(state, {
    type: 'scene_received',
    scene: createScene(),
  });
  state = runtimeSessionReducer(state, {
    type: 'session_snapshot_received',
    snapshot: {
      session: {
        id: 'ABC123',
        status: 'lobby',
        dmParticipantId: 'dm-001',
        playerParticipantIds: ['player-001', 'player-002'],
        rulesProfileId: 'dnd5e-2024-core',
        activeSceneId: 'scene_9f3a2b1c',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        revision: 7,
      },
      participants: [
        {
          id: 'dm-001',
          displayName: 'Dungeon Master',
          role: 'dm',
          connectionStatus: 'connected',
          joinedAt: '2026-08-01T10:00:00.000Z',
          lastSeenAt: '2026-08-01T10:00:00.000Z',
          characterId: null,
          pendingCharacterId: null,
        },
        {
          id: 'player-001',
          displayName: 'Aria',
          role: 'player',
          connectionStatus: 'connected',
          joinedAt: '2026-08-01T10:00:00.000Z',
          lastSeenAt: '2026-08-01T10:00:00.000Z',
          characterId: 'character_7c1d',
          pendingCharacterId: null,
        },
        {
          id: 'player-002',
          displayName: 'Borin',
          role: 'player',
          connectionStatus: 'disconnected',
          joinedAt: '2026-08-01T10:00:00.000Z',
          lastSeenAt: '2026-08-01T10:00:00.000Z',
          characterId: null,
          pendingCharacterId: null,
        },
      ],
    },
  });

  return state;
}

/**
 * Every string the player view model would put on screen.
 *
 * Deliberately walks the view model rather than the rendered DOM: the rule
 * being enforced is that the IDs are not *in the data*, which is stronger than
 * asserting they were not drawn.
 */
function playerVisibleStrings(view: PlayerShellView): string[] {
  return [
    view.sceneName ?? '',
    view.character?.name ?? '',
    ...(view.character?.conditions ?? []),
    view.notice ?? '',
    String(view.visibleTokenCount),
    String(view.turn.turnNumber ?? ''),
    String(view.turn.roundNumber ?? ''),
    String(view.turn.combatantCount),
  ];
}

test('the player view model exposes the map, their character and the turn', () => {
  const view = selectPlayerShellView(playerState());

  assert.equal(view.sceneName, 'Sunken Chapel');
  assert.equal(view.character?.name, 'Aria Duskwind');
  assert.equal(view.character?.currentHp, 31);
  assert.equal(view.character?.maxHp, 40);
  assert.equal(view.character?.temporaryHp, 3);
  assert.deepEqual(view.character?.conditions, ['poisoned']);
  assert.equal(view.turn.isOwnTurn, true);
  assert.equal(view.turn.roundNumber, 3);
});

test('the player counts only tokens the server let them have', () => {
  const view = selectPlayerShellView(playerState());

  // The projected scene has one entity. Counting concealed creatures would be
  // a leak of exactly the kind the map is careful not to draw.
  assert.equal(view.visibleTokenCount, 1);
  // The concealed creature still occupies a slot in the order, so the count of
  // combatants is honest without naming what they are.
  assert.equal(view.turn.combatantCount, 2);
});

test("a concealed creature's turn is a turn, not that creature's turn", () => {
  const view = selectPlayerShellView(playerState(1));

  assert.equal(view.turn.isOwnTurn, false);
  assert.equal(view.turn.turnNumber, 2);
  assert.equal(
    JSON.stringify(view).includes('Bog Lurker'),
    false,
    'the concealed creature is never named to the player',
  );
});

test('no raw identifier appears anywhere in the player view model', () => {
  const view = selectPlayerShellView(playerState());

  for (const value of playerVisibleStrings(view)) {
    assert.equal(
      containsInternalIdentifier(value),
      false,
      `player-visible string leaked an identifier: ${value}`,
    );
  }
});

test('no protocol field name or enum value reaches the player as copy', () => {
  const view = selectPlayerShellView(playerState());
  const forbidden = [
    'participantId',
    'combatantId',
    'sceneId',
    'characterId',
    'scene_state',
    'encounter_state',
    'combat_event',
    'initial_sync',
    'dm_combatant_visibility_changed',
  ];

  for (const value of playerVisibleStrings(view)) {
    for (const term of forbidden) {
      assert.equal(
        value.includes(term),
        false,
        `player-visible string leaked protocol vocabulary: ${value}`,
      );
    }
  }
});

test('the player view model carries no diagnostics surface at all', () => {
  const view = selectPlayerShellView(playerState()) as Record<string, unknown>;

  // Absent by construction rather than hidden by a flag: there is nothing for a
  // stray render to accidentally switch on.
  assert.equal('diagnosticsOpen' in view, false);
  assert.equal('outboxStatus' in view, false);
  assert.equal('eventLog' in view, false);
  assert.equal('lastResponse' in view, false);
});

test('the player is never handed a session revision or a raw payload', () => {
  const view = selectPlayerShellView(playerState()) as Record<string, unknown>;

  assert.equal('session' in view, false);
  assert.equal('revision' in view, false);
});

test('the GM view model keeps the identifiers their tools are built from', () => {
  const view = selectGameMasterShellView(gmState());

  assert.equal(view.sceneId, 'scene_9f3a2b1c');
  assert.equal(view.entityCount, 2);
  // The GM is the authority; concealment is something they applied, not
  // something applied to them.
  assert.equal(view.hiddenEntityCount, 1);
});

test('the GM view model reports who is actually at the table', () => {
  const view = selectGameMasterShellView(gmState());

  assert.equal(view.seatCount, 3);
  assert.equal(view.connectedSeatCount, 2);
});

test('diagnostics default closed for the GM', () => {
  assert.equal(selectGameMasterShellView(gmState()).diagnosticsOpen, false);

  const opened = runtimeSessionReducer(gmState(), {
    type: 'diagnostics_toggled',
    open: true,
  });

  assert.equal(selectGameMasterShellView(opened).diagnosticsOpen, true);
});

test('a command failure becomes the single notice, ahead of recovery notes', () => {
  let state = runtimeSessionReducer(playerState(), {
    type: 'recovery_finished',
    notes: ['No encounter is running.'],
  });

  assert.equal(selectPlayerShellView(state).notice, 'No encounter is running.');

  state = runtimeSessionReducer(state, {
    type: 'command_failed',
    message: 'That creature is not on the map.',
  });

  // What the player just did wins over standing background state; stacking
  // both produces a wall neither gets read.
  assert.equal(
    selectPlayerShellView(state).notice,
    'That creature is not on the map.',
  );
});

test('a rejected credential asks the user to act; a retry does not', () => {
  const retrying = runtimeSessionReducer(playerState(), {
    type: 'connection_changed',
    status: 'reconnecting',
  });
  const rejected = runtimeSessionReducer(playerState(), {
    type: 'connection_failed',
    status: 'credential_invalid',
    message: 'This seat needs to reconnect.',
  });

  assert.equal(
    selectPlayerShellView(retrying).connection.needsUserAction,
    false,
  );
  assert.equal(
    selectPlayerShellView(rejected).connection.needsUserAction,
    true,
  );
});

test('every connection label exists in English and Persian', () => {
  const statuses = [
    'idle',
    'connecting',
    'connected',
    'reconnecting',
    'credential_invalid',
    'seat_unavailable',
  ] as const;

  for (const status of statuses) {
    const view = selectPlayerShellView(
      runtimeSessionReducer(playerState(), {
        type: 'connection_failed',
        status,
        message: '',
      }),
    );

    assert.ok(
      messages.en[view.connection.labelKey],
      `missing English copy for ${status}`,
    );
    assert.ok(
      messages.fa[view.connection.labelKey],
      `missing Persian copy for ${status}`,
    );
  }
});

test('containsInternalIdentifier recognises the shapes this codebase mints', () => {
  assert.equal(containsInternalIdentifier('scene_entity_altar'), true);
  assert.equal(
    containsInternalIdentifier('3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
    true,
  );
  assert.equal(containsInternalIdentifier('encounter_44ab'), true);
  // Ordinary prose and player-authored names must not trip it.
  assert.equal(containsInternalIdentifier('Sunken Chapel'), false);
  assert.equal(containsInternalIdentifier('Aria Duskwind'), false);
  assert.equal(containsInternalIdentifier('poisoned'), false);
});
