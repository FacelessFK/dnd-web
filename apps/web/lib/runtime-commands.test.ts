import assert from 'node:assert/strict';
import test from 'node:test';

import type { Scene } from '@dnd/protocol';

import {
  createDefaultCombatantDraftForm,
  createDefaultSceneEntityDraftForm,
  type SessionSnapshot,
} from './runtime-cockpit-helpers';
import {
  assertDraftValid,
  createRuntimeCommandContext,
  requireCharacterResponse,
  requireSceneResponse,
  type RuntimeCommandActors,
} from './runtime-command-runner';
import { createCombatantCommands } from './runtime-combatant-commands';
import {
  createSceneCommands,
  type SceneTarget,
} from './runtime-scene-commands';
import { createSessionCommands } from './runtime-session-commands';
import {
  createRuntimeSessionState,
  runtimeSessionReducer,
  type RuntimeSessionAction,
  type RuntimeSessionState,
} from './runtime-session-state';

/**
 * These drive the real context and the real reducer, not stand-ins for them.
 * The thing worth protecting is the whole path - a command builds a payload, the
 * funnel decides whether that counts as success, and the reducer turns the
 * outcome into what a user sees - so a test that faked the middle would prove
 * the least interesting third of it.
 */
const actors: RuntimeCommandActors = {
  acting: 'player-001',
  dm: 'dm-001',
  player: 'player-001',
  stream: 'dm-001',
  streamDisplayName: 'Gamemaster',
  streamRole: 'dm',
};

function createScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene_1',
    sessionId: 'ABC123',
    name: 'Sunken Chapel',
    grid: { width: 10, height: 10, cellSizeFeet: 5 },
    terrain: null,
    entities: [],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function createSnapshot(): SessionSnapshot {
  return {
    session: {
      id: 'ABC123',
      status: 'lobby',
      dmParticipantId: 'dm-001',
      playerParticipantIds: [],
      rulesProfileId: 'dnd5e-2024-core',
      activeSceneId: 'scene_1',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
      revision: 2,
    },
    participants: [],
  };
}

type Harness = {
  actions: RuntimeSessionAction[];
  ctx: ReturnType<typeof createRuntimeCommandContext>;
  sent: Record<string, unknown>[];
  settled: string[];
  /** The state the reducer reaches after replaying everything dispatched. */
  state: () => RuntimeSessionState;
};

function createHarness(sessionId = 'ABC123'): Harness {
  const actions: RuntimeSessionAction[] = [];
  const sent: Record<string, unknown>[] = [];
  const settled: string[] = [];

  const ctx = createRuntimeCommandContext({
    dispatch: (action) => actions.push(action),
    getActors: () => actors,
    getSessionId: () => sessionId,
    onSettled: (label) => settled.push(label),
  });

  return {
    actions,
    ctx,
    sent,
    settled,
    state: () =>
      actions.reduce(
        runtimeSessionReducer,
        createRuntimeSessionState({
          mode: 'dm',
          participantId: 'dm-001',
          sessionId,
        }),
      ),
  };
}

/** A sender that records what it was asked to send and answers with a scene. */
function sceneSender(harness: Harness, scene: Scene = createScene()) {
  return (async (command: Record<string, unknown>) => {
    harness.sent.push(command);

    return { ok: true, response: { data: { scene } } };
  }) as never;
}

function failingSender(harness: Harness, error: Record<string, unknown>) {
  return (async (command: Record<string, unknown>) => {
    harness.sent.push(command);

    return { ok: false, error };
  }) as never;
}

// --- the funnel ------------------------------------------------------------

test('a command marks itself pending, then clears on success', async () => {
  const harness = createHarness();

  await harness.ctx.run('place scene entity', async () => 'done');

  assert.deepEqual(
    harness.actions.map((action) => action.type),
    ['command_started', 'command_succeeded'],
  );
  assert.equal(harness.state().pendingCommand, null);
  assert.equal(harness.state().commandError, null);
  assert.deepEqual(harness.settled, ['place scene entity']);
});

test('a thrown command cannot report success and leaves one readable message', async () => {
  const harness = createHarness();

  await harness.ctx.run('place scene entity', async () => {
    throw new Error('Fix the entity draft first: Name is required.');
  });

  assert.deepEqual(
    harness.actions.map((action) => action.type),
    ['command_started', 'command_failed'],
  );

  const state = harness.state();

  assert.equal(state.pendingCommand, null);
  assert.equal(
    state.commandError,
    'Fix the entity draft first: Name is required.',
  );
  // A failure must not reach the diagnostics ledger as a settled command.
  assert.deepEqual(harness.settled, []);
});

test('a starting command clears the previous error rather than stacking one', async () => {
  const harness = createHarness();

  await harness.ctx.run('first', async () => {
    throw new Error('Boom.');
  });

  assert.equal(harness.state().commandError, 'Boom.');

  harness.ctx.run('second', async () => 'ok');

  assert.equal(harness.state().commandError, null);
  assert.equal(harness.state().pendingCommand, 'second');
});

test('a server failure becomes presentation-safe text naming the command', async () => {
  const harness = createHarness();

  await harness.ctx.run('attack', () =>
    harness.ctx.unwrap(
      'attack_target',
      Promise.resolve({
        ok: false,
        error: {
          code: 'not_your_turn',
          message: 'Wait your turn.',
          status: 409,
        },
      }) as never,
    ),
  );

  assert.equal(
    harness.state().commandError,
    'attack_target failed. HTTP 409: not_your_turn: Wait your turn.',
  );
});

test('a command refuses to run without a session and says what to do', async () => {
  const harness = createHarness('');

  await harness.ctx.run('create scene', async () =>
    harness.ctx.requireSessionId(),
  );

  assert.equal(harness.state().commandError, 'Create or join a session first.');
});

// --- response narrowing ----------------------------------------------------

test('a non-scene response fails loudly instead of blanking the map', () => {
  assert.throws(
    () =>
      requireSceneResponse('place_entity_in_scene', { data: { state: {} } }),
    /place_entity_in_scene returned a non-scene response\./,
  );

  const scene = createScene();

  assert.equal(requireSceneResponse('get_scene', { data: { scene } }), scene);
});

test('a non-character response fails loudly', () => {
  assert.throws(
    () => requireCharacterResponse('get_character', { data: { scene: {} } }),
    /get_character returned a non-character response\./,
  );
});

test('an invalid draft refuses to send and repeats the form errors', () => {
  assert.throws(
    () => assertDraftValid('Fix the scene draft first', ['Name is required.']),
    /Fix the scene draft first: Name is required\./,
  );

  assert.doesNotThrow(() => assertDraftValid('Fix it', []));
});

// --- scene commands --------------------------------------------------------

const target: SceneTarget = { activeSceneId: 'scene_1', loadedSceneId: null };

test('placing an entity sends the GM actor and the drafted entity', async () => {
  const harness = createHarness();
  const commands = createSceneCommands(harness.ctx, {
    sendSceneCommand: sceneSender(harness),
  });

  await commands.placeSceneEntity({
    cell: { x: 3, y: 4 },
    draft: { ...createDefaultSceneEntityDraftForm(), name: 'Altar' },
    errors: [],
    target,
  });

  assert.equal(harness.state().commandError, null);

  const command = harness.sent[0]!;

  assert.equal(command.type, 'place_entity_in_scene');
  assert.deepEqual(command.actor, { participantId: 'dm-001' });

  const payload = command.payload as {
    entity: { position: { x: number; y: number } };
    sceneId: string;
    sessionId: string;
  };

  assert.equal(payload.sceneId, 'scene_1');
  assert.equal(payload.sessionId, 'ABC123');
  assert.deepEqual(payload.entity.position, { x: 3, y: 4 });
});

test('an entity draft with errors never reaches the server', async () => {
  const harness = createHarness();
  const commands = createSceneCommands(harness.ctx, {
    sendSceneCommand: sceneSender(harness),
  });

  await commands.placeSceneEntity({
    cell: { x: 1, y: 1 },
    draft: createDefaultSceneEntityDraftForm(),
    errors: ['Name is required.'],
    target,
  });

  assert.deepEqual(harness.sent, []);
  assert.match(harness.state().commandError!, /Fix the entity draft first/);
});

test('the loaded scene wins over the active one, and neither is an error', async () => {
  const harness = createHarness();
  const commands = createSceneCommands(harness.ctx, {
    sendSceneCommand: sceneSender(harness),
  });

  await commands.deleteSceneEntity({
    entityId: 'entity_1',
    target: { activeSceneId: 'scene_1', loadedSceneId: 'scene_7' },
  });

  assert.equal(
    (harness.sent[0]!.payload as { sceneId: string }).sceneId,
    'scene_7',
  );

  const empty = createHarness();
  const emptyCommands = createSceneCommands(empty.ctx, {
    sendSceneCommand: sceneSender(empty),
  });

  await emptyCommands.deleteSceneEntity({
    entityId: 'entity_1',
    target: { activeSceneId: '', loadedSceneId: null },
  });

  assert.deepEqual(empty.sent, []);
  assert.match(
    empty.state().commandError!,
    /Create, activate, or recover a scene before/,
  );
});

test('a mutated scene replaces the map from the server response only', async () => {
  const harness = createHarness();
  const returned = createScene({
    updatedAt: '2026-08-01T11:00:00.000Z',
    entities: [],
  });
  const commands = createSceneCommands(harness.ctx, {
    sendSceneCommand: sceneSender(harness, returned),
  });

  await commands.repositionSceneEntity({
    cell: { x: 2, y: 2 },
    entityId: 'entity_1',
    target,
  });

  // The map came from `scene_remembered`, never from a locally patched copy.
  assert.ok(
    harness.actions.some((action) => action.type === 'scene_remembered'),
  );
  assert.equal(harness.state().scene?.updatedAt, '2026-08-01T11:00:00.000Z');
});

test('activating a scene applies the snapshot and then reads the map back', async () => {
  const harness = createHarness();
  const scene = createScene();
  const commands = createSceneCommands(harness.ctx, {
    sendSceneCommand: (async (command: Record<string, unknown>) => {
      harness.sent.push(command);

      return command.type === 'activate_scene_for_session'
        ? { ok: true, response: { data: { state: createSnapshot() } } }
        : { ok: true, response: { data: { scene } } };
    }) as never,
  });

  await commands.activateSelectedScene({ sceneId: 'scene_1' });

  assert.deepEqual(
    harness.sent.map((command) => command.type),
    ['activate_scene_for_session', 'get_scene'],
  );
  // The snapshot alone would leave the previous board on screen.
  assert.equal(harness.state().scene?.id, 'scene_1');
  assert.equal(harness.state().session?.session.revision, 2);
});

test('an empty scene ID is refused before any request is made', async () => {
  const harness = createHarness();
  const commands = createSceneCommands(harness.ctx, {
    sendSceneCommand: sceneSender(harness),
  });

  await commands.activateSelectedScene({ sceneId: '   ' });

  assert.deepEqual(harness.sent, []);
  assert.match(harness.state().commandError!, /Enter or create a scene ID/);
});

// --- combatant commands ----------------------------------------------------

test('concealment goes through the authoritative command, not a local filter', async () => {
  const harness = createHarness();
  const commands = createCombatantCommands(harness.ctx, {
    sendDmCommand: sceneSender(harness),
  });

  await commands.setCombatantHidden({
    combatantId: 'combatant_1',
    hidden: true,
  });

  const command = harness.sent[0]!;

  assert.equal(command.type, 'dm_set_combatant_hidden');
  assert.deepEqual(command.payload, {
    combatantId: 'combatant_1',
    hidden: true,
    sessionId: 'ABC123',
  });
  // The map that follows is the server's scene, so a player's copy changes
  // because their projection changed - not because this browser redrew it.
  assert.ok(
    harness.actions.some((action) => action.type === 'scene_remembered'),
  );
});

test('revealing is the same command with the flag inverted', async () => {
  const harness = createHarness();
  const commands = createCombatantCommands(harness.ctx, {
    sendDmCommand: sceneSender(harness),
  });

  await commands.setCombatantHidden({
    combatantId: 'combatant_1',
    hidden: false,
  });

  assert.equal((harness.sent[0]!.payload as { hidden: boolean }).hidden, false);
});

test('a combatant command without a selection refuses before sending', async () => {
  const harness = createHarness();
  const commands = createCombatantCommands(harness.ctx, {
    sendDmCommand: sceneSender(harness),
  });

  await commands.repositionCombatant({ cell: { x: 1, y: 1 }, combatantId: '' });

  assert.deepEqual(harness.sent, []);
  assert.match(
    harness.state().commandError!,
    /Select a monster\/NPC combatant/,
  );
});

test('creating a combatant carries the GM actor and the drafted cell', async () => {
  const harness = createHarness();
  const commands = createCombatantCommands(harness.ctx, {
    sendDmCommand: sceneSender(harness),
  });

  await commands.createCombatant({
    cell: { x: 6, y: 7 },
    draft: { ...createDefaultCombatantDraftForm(), name: 'Ghoul' },
    errors: [],
  });

  const command = harness.sent[0]!;

  assert.equal(command.type, 'dm_create_combatant_in_active_scene');
  assert.deepEqual(command.actor, { participantId: 'dm-001' });
  assert.deepEqual(
    (command.payload as { combatant: { position: unknown } }).combatant
      .position,
    { x: 6, y: 7 },
  );
});

// --- session commands ------------------------------------------------------

test('creating a session clears the old table before applying the new one', async () => {
  const harness = createHarness();
  const commands = createSessionCommands(harness.ctx, {
    sendMovementCommand: sceneSender(harness),
    sendSessionCommand: (async (command: Record<string, unknown>) => {
      harness.sent.push(command);

      return { ok: true, response: { data: { state: createSnapshot() } } };
    }) as never,
  });

  await commands.createSession({ rulesProfileId: 'dnd-5e-2014' });

  const order = harness.actions.map((action) => action.type);

  // Applying first would briefly show the previous table's board under the new
  // table's name.
  assert.ok(
    order.indexOf('read_models_cleared') <
      order.indexOf('session_snapshot_received'),
  );
  assert.equal(harness.state().session?.session.id, 'ABC123');
});

test('a movement failure surfaces once and does not report the move as done', async () => {
  const harness = createHarness();
  const commands = createSessionCommands(harness.ctx, {
    sendMovementCommand: failingSender(harness, {
      code: 'move_out_of_range',
      message: 'Too far.',
    }),
    sendSessionCommand: sceneSender(harness),
  });

  await commands.moveActingCharacter({ cell: { x: 9, y: 9 } });

  assert.equal(
    harness.state().commandError,
    'move_character_in_active_scene failed. move_out_of_range: Too far.',
  );
  assert.deepEqual(harness.settled, []);
});

test('a move acts as the acting seat and reads placements back', async () => {
  const harness = createHarness();
  const commands = createSessionCommands(harness.ctx, {
    sendMovementCommand: (async (command: Record<string, unknown>) => {
      harness.sent.push(command);

      return command.type === 'move_character_in_active_scene'
        ? { ok: true, response: { data: { moved: true } } }
        : {
            ok: true,
            response: {
              data: {
                activeSceneId: 'scene_1',
                placedCharacters: [],
                sessionId: 'ABC123',
              },
            },
          };
    }) as never,
    sendSessionCommand: sceneSender(harness),
  });

  await commands.moveActingCharacter({ cell: { x: 2, y: 5 } });

  assert.deepEqual(
    harness.sent.map((command) => command.type),
    ['move_character_in_active_scene', 'get_active_scene_state'],
  );
  assert.deepEqual(harness.sent[0]!.actor, { participantId: 'player-001' });
  assert.equal(harness.state().commandError, null);
  assert.equal(harness.state().activeScene?.activeSceneId, 'scene_1');
});

test('a failed follow-up read does not turn a successful move into an error', async () => {
  const harness = createHarness();
  const commands = createSessionCommands(harness.ctx, {
    sendMovementCommand: (async (command: Record<string, unknown>) => {
      harness.sent.push(command);

      return command.type === 'move_character_in_active_scene'
        ? { ok: true, response: { data: { moved: true } } }
        : { ok: false, error: { code: 'no_active_scene', message: 'None.' } };
    }) as never,
    sendSessionCommand: sceneSender(harness),
  });

  await commands.moveActingCharacter({ cell: { x: 2, y: 5 } });

  assert.equal(harness.state().commandError, null);
  assert.deepEqual(harness.settled, ['move_character_in_active_scene']);
});

// --- command identity ------------------------------------------------------

test('every command carries a fresh scoped ID so retries stay idempotent', async () => {
  const harness = createHarness();
  const commands = createCombatantCommands(harness.ctx, {
    sendDmCommand: sceneSender(harness),
  });

  await commands.setCombatantHidden({
    combatantId: 'combatant_1',
    hidden: true,
  });
  await commands.setCombatantHidden({
    combatantId: 'combatant_1',
    hidden: true,
  });

  const [first, second] = harness.sent.map(
    (command) => command.commandId as string,
  );

  // Same scope, different ID: a repeat is a new command, not a replay of the
  // cached one. Reusing the ID would make the second click a no-op.
  assert.match(first!, /^web-m1-combatant-hidden-/);
  assert.match(second!, /^web-m1-combatant-hidden-/);
  assert.notEqual(first, second);
});

test('no command payload ever carries a participant credential', async () => {
  const harness = createHarness();
  const scene = createSceneCommands(harness.ctx, {
    sendSceneCommand: sceneSender(harness),
  });
  const combatant = createCombatantCommands(harness.ctx, {
    sendDmCommand: sceneSender(harness),
  });

  await scene.placeSceneEntity({
    cell: { x: 1, y: 1 },
    draft: { ...createDefaultSceneEntityDraftForm(), name: 'Altar' },
    errors: [],
    target,
  });
  await combatant.setCombatantHidden({
    combatantId: 'combatant_1',
    hidden: true,
  });

  assert.ok(harness.sent.length >= 2);

  for (const command of harness.sent) {
    assert.equal(
      /token|credential|secret|bearer/i.test(JSON.stringify(command)),
      false,
      `${command.type as string} carried a credential-shaped field`,
    );
  }
});

test('a command error never leaks raw response internals into state', async () => {
  const harness = createHarness();
  const commands = createCombatantCommands(harness.ctx, {
    sendDmCommand: failingSender(harness, {
      code: 'forbidden_role',
      message: 'Only the GM may conceal a combatant.',
      status: 403,
    }),
  });

  await commands.setCombatantHidden({
    combatantId: 'combatant_1',
    hidden: true,
  });

  const message = harness.state().commandError!;

  assert.equal(
    message,
    'dm_set_combatant_hidden failed. HTTP 403: forbidden_role: Only the GM may conceal a combatant.',
  );
  assert.equal(message.includes('{'), false);
});
