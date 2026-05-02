import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import {
  characterAssignmentSuccessSchema,
  characterCommandErrorSchema,
  characterCommandSchema,
  characterCommandSuccessSchema,
  clientCommandSchema,
  dmCommandErrorSchema,
  dmCommandSchema,
  dmCommandSuccessSchema,
  encounterCommandErrorSchema,
  encounterCommandSchema,
  encounterCommandSuccessSchema,
  movementCommandErrorSchema,
  movementCommandSchema,
  movementCommandSuccessSchema,
  participantIdSchema,
  sceneActivationSuccessSchema,
  sceneCommandErrorSchema,
  sceneCommandSchema,
  sceneCommandSuccessSchema,
  sessionCommandErrorSchema,
  sessionCommandSuccessSchema,
  sessionIdSchema,
  sessionStreamEventSchema,
  type CharacterAssignmentSuccess,
  type CharacterCommandError,
  type CharacterCommandSuccess,
  type DmCommandError,
  type DmCommandSuccess,
  type EncounterCommandError,
  type EncounterCommandSuccess,
  type MovementCommandError,
  type MovementCommandSuccess,
  type RuntimeErrorCode,
  type SceneActivationSuccess,
  type SceneCommandError,
  type SceneCommandSuccess,
  type SessionCommandError,
  type SessionCommandSuccess,
  type SessionStreamEvent,
} from '@dnd/protocol';

import { CharacterStoreError } from './character-store.js';
import {
  CommandIdempotencyError,
  InMemoryCommandIdempotencyStore,
  type CommandIdempotencyCategory,
  type CommandIdempotencyStore,
} from './command-idempotency-store.js';
import type { CommandEventOutboxDispatcherLike } from './command-event-outbox-dispatcher.js';
import { DbBackedCharacterCommandTransactionBoundary } from './db-character-command-transaction.js';
import { DbBackedCombatCommandTransactionBoundary } from './db-combat-command-transaction.js';
import { DbBackedEncounterCommandTransactionBoundary } from './db-encounter-command-transaction.js';
import { DbBackedSessionCommandTransactionBoundary } from './db-session-command-transaction.js';
import { EncounterRuntimeError } from './encounter-runtime.js';
import { EncounterStoreError } from './encounter-store.js';
import {
  createConnectionId,
  InMemoryGameRuntime,
  type RuntimeCharacterRepository,
} from './game-runtime.js';
import { MovementRuntimeError } from './movement-runtime.js';
import { RulesProfileStoreError } from './rules-profile-store.js';
import { SceneStoreError } from './scene-store.js';
import {
  SessionStoreError,
  type RuntimeSessionStore,
} from './session-store.js';

const corsHeaders = {
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-origin': '*',
} as const;

type RuntimeStoreError =
  | CharacterStoreError
  | CommandIdempotencyError
  | EncounterRuntimeError
  | EncounterStoreError
  | MovementRuntimeError
  | RulesProfileStoreError
  | SceneStoreError
  | SessionStoreError;

type GameRuntime = InMemoryGameRuntime<
  RuntimeCharacterRepository,
  RuntimeSessionStore
>;

export function createSessionServer(
  runtime: GameRuntime = new InMemoryGameRuntime(),
  idempotency: CommandIdempotencyStore = new InMemoryCommandIdempotencyStore(),
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary,
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary,
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
  commandEventOutboxDispatcher?: CommandEventOutboxDispatcherLike,
): {
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary;
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary;
  commandEventOutboxDispatcher?: CommandEventOutboxDispatcherLike;
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary;
  idempotency: CommandIdempotencyStore;
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary;
  server: Server;
  startup: () => Promise<void>;
  runtime: GameRuntime;
  store: GameRuntime['sessions'];
} {
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(
        request,
        response,
        runtime,
        idempotency,
        characterCommandTransaction,
        sessionCommandTransaction,
        encounterCommandTransaction,
        combatCommandTransaction,
      );
    } catch (error) {
      handleUnexpectedError(response, error, sessionCommandErrorSchema);
    }
  });

  return {
    combatCommandTransaction,
    characterCommandTransaction,
    commandEventOutboxDispatcher,
    encounterCommandTransaction,
    idempotency,
    sessionCommandTransaction,
    server,
    startup: async () => undefined,
    runtime,
    store: runtime.sessions,
  };
}

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: GameRuntime,
  idempotency: CommandIdempotencyStore,
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary,
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary,
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
): Promise<void> {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', getBaseUrl(request));

  if (request.method === 'GET' && url.pathname === '/') {
    sendJson(response, 200, {
      name: 'dnd-dm-platform-server',
      phase: 'phase-12',
      status: 'session-character-encounter-combat-outbox-foundation',
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/session/command') {
    await handleSessionCommandRequest(request, response, runtime, idempotency);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/characters/command') {
    await handleCharacterCommandRequest(
      request,
      response,
      runtime,
      idempotency,
      characterCommandTransaction,
      sessionCommandTransaction,
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/scenes/command') {
    await handleSceneCommandRequest(
      request,
      response,
      runtime,
      idempotency,
      sessionCommandTransaction,
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/movement/command') {
    await handleMovementCommandRequest(
      request,
      response,
      runtime,
      idempotency,
      combatCommandTransaction,
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/dm/command') {
    await handleDmCommandRequest(
      request,
      response,
      runtime,
      idempotency,
      characterCommandTransaction,
      encounterCommandTransaction,
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/encounters/command') {
    await handleEncounterCommandRequest(
      request,
      response,
      runtime,
      idempotency,
      encounterCommandTransaction,
      combatCommandTransaction,
    );
    return;
  }

  const streamMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/stream$/);

  if (request.method === 'GET' && streamMatch) {
    const sessionIdFromPath = streamMatch[1];

    if (!sessionIdFromPath) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: 'invalid_session_id',
          message: 'Session ID is required in the stream path.',
        },
      } satisfies SessionCommandError);
      return;
    }

    handleStreamRequest(
      response,
      request,
      url,
      decodeURIComponent(sessionIdFromPath),
      runtime,
    );
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: {
      code: 'invalid_command',
      message: 'Route not found.',
    },
  } satisfies SessionCommandError);
}

async function handleSessionCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: GameRuntime,
  idempotency: CommandIdempotencyStore,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message: 'Request body must be valid JSON.',
      },
    } satisfies SessionCommandError);
    return;
  }

  const commandResult = clientCommandSchema.safeParse(body);

  if (!commandResult.success) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message:
          commandResult.error.issues[0]?.message ?? 'Invalid command payload.',
      },
    } satisfies SessionCommandError);
    return;
  }

  try {
    const command = commandResult.data;
    const cachedSuccess =
      await idempotency.getCachedSuccess<SessionCommandSuccess>({
        category: 'session',
        command,
      });

    if (cachedSuccess) {
      sendJson(response, 200, cachedSuccess, sessionCommandSuccessSchema);
      return;
    }

    let result;

    switch (command.type) {
      case 'create_session':
        result = await runtime.createSession(command);
        break;
      case 'join_session':
        result = await runtime.joinSession(command);
        break;
      case 'reconnect_session':
        result = await runtime.reconnectSession(command);
        break;
      default:
        throw new Error('Unsupported session command type.');
    }

    const success: SessionCommandSuccess = {
      ok: true,
      data: {
        sessionId: result.sessionId,
        participantId: result.participantId,
        state: result.state,
        streamPath: buildStreamPath(result.sessionId, result.participantId),
      },
    };

    await idempotency.cacheSuccess({
      category: 'session',
      command,
      response: success,
    });
    sendJson(response, 200, success, sessionCommandSuccessSchema);
  } catch (error) {
    handleRuntimeError(response, error, sessionCommandErrorSchema);
  }
}

async function handleCharacterCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: GameRuntime,
  idempotency: CommandIdempotencyStore,
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message: 'Request body must be valid JSON.',
      },
    } satisfies CharacterCommandError);
    return;
  }

  const commandResult = characterCommandSchema.safeParse(body);

  if (!commandResult.success) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message:
          commandResult.error.issues[0]?.message ?? 'Invalid command payload.',
      },
    } satisfies CharacterCommandError);
    return;
  }

  try {
    const command = commandResult.data;
    const idempotencyCategory: CommandIdempotencyCategory | null =
      command.type === 'get_character' ? null : 'character';

    if (
      idempotencyCategory &&
      characterCommandTransaction?.supports({
        category: idempotencyCategory,
        command,
      })
    ) {
      const success = await characterCommandTransaction.run({
        category: idempotencyCategory,
        command,
        runtime,
        execute: async (transactionRuntime) => {
          switch (command.type) {
            case 'create_character':
            case 'update_character':
            case 'finalize_character': {
              const data =
                command.type === 'create_character'
                  ? await transactionRuntime.createCharacter(command)
                  : command.type === 'update_character'
                    ? await transactionRuntime.updateCharacter(command)
                    : await transactionRuntime.finalizeCharacter(command);

              return {
                ok: true,
                data,
              } satisfies CharacterCommandSuccess;
            }
            default:
              throw new Error(
                `Unsupported transactional character command type "${command.type}".`,
              );
          }
        },
      });

      sendCharacterSuccess(response, command.type, success);
      return;
    }

    const cachedSuccess = idempotencyCategory
      ? await idempotency.getCachedSuccess<
          CharacterAssignmentSuccess | CharacterCommandSuccess
        >({
          category: idempotencyCategory,
          command,
        })
      : null;

    if (cachedSuccess) {
      sendCharacterSuccess(response, command.type, cachedSuccess);
      return;
    }

    switch (command.type) {
      case 'create_character':
      case 'get_character': {
        const data =
          command.type === 'create_character'
            ? await runtime.createCharacter(command)
            : await runtime.getCharacter(command);
        const success: CharacterCommandSuccess = {
          ok: true,
          data,
        };

        if (idempotencyCategory) {
          await idempotency.cacheSuccess({
            category: idempotencyCategory,
            command,
            response: success,
          });
        }
        sendCharacterSuccess(response, command.type, success);
        return;
      }
      case 'update_character':
      case 'finalize_character': {
        const data =
          command.type === 'update_character'
            ? await runtime.updateCharacter(command)
            : await runtime.finalizeCharacter(command);
        const success: CharacterCommandSuccess = {
          ok: true,
          data,
        };

        await idempotency.cacheSuccess({
          category: 'character',
          command,
          response: success,
        });
        sendCharacterSuccess(response, command.type, success);
        return;
      }
      case 'assign_character_to_participant': {
        if (
          sessionCommandTransaction?.supports({
            category: 'character',
            command,
          })
        ) {
          const success: CharacterAssignmentSuccess = {
            ok: true,
            data: await sessionCommandTransaction.run({
              category: 'character',
              command,
              execute: async (transactionRuntime) =>
                transactionRuntime.assignCharacterToParticipant(command),
              runtime,
            }),
          };

          sendCharacterSuccess(response, command.type, success);
          return;
        }

        const success: CharacterAssignmentSuccess = {
          ok: true,
          data: await runtime.assignCharacterToParticipant(command),
        };

        await idempotency.cacheSuccess({
          category: 'character',
          command,
          response: success,
        });
        sendCharacterSuccess(response, command.type, success);
        return;
      }
      default:
        throw new Error('Unsupported character command type.');
    }
  } catch (error) {
    handleRuntimeError(response, error, characterCommandErrorSchema);
  }
}

async function handleSceneCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: GameRuntime,
  idempotency: CommandIdempotencyStore,
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message: 'Request body must be valid JSON.',
      },
    } satisfies SceneCommandError);
    return;
  }

  const commandResult = sceneCommandSchema.safeParse(body);

  if (!commandResult.success) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message:
          commandResult.error.issues[0]?.message ?? 'Invalid command payload.',
      },
    } satisfies SceneCommandError);
    return;
  }

  try {
    const command = commandResult.data;
    const idempotencyCategory: CommandIdempotencyCategory | null =
      command.type === 'get_scene' ? null : 'scene';
    const cachedSuccess = idempotencyCategory
      ? await idempotency.getCachedSuccess<
          SceneActivationSuccess | SceneCommandSuccess
        >({
          category: idempotencyCategory,
          command,
        })
      : null;

    if (cachedSuccess) {
      sendSceneSuccess(response, command.type, cachedSuccess);
      return;
    }

    switch (command.type) {
      case 'create_scene':
      case 'get_scene':
      case 'place_entity_in_scene': {
        const scene =
          command.type === 'create_scene'
            ? await runtime.createScene(command)
            : command.type === 'get_scene'
              ? await runtime.getScene(command)
              : await runtime.placeEntityInScene(command);
        const success: SceneCommandSuccess = {
          ok: true,
          data: {
            scene,
          },
        };

        if (idempotencyCategory) {
          await idempotency.cacheSuccess({
            category: idempotencyCategory,
            command,
            response: success,
          });
        }
        sendSceneSuccess(response, command.type, success);
        return;
      }
      case 'activate_scene_for_session': {
        if (
          sessionCommandTransaction?.supports({
            category: 'scene',
            command,
          })
        ) {
          const success: SceneActivationSuccess = {
            ok: true,
            data: await sessionCommandTransaction.run({
              category: 'scene',
              command,
              execute: async (transactionRuntime) =>
                transactionRuntime.activateSceneForSession(command),
              runtime,
            }),
          };

          sendSceneSuccess(response, command.type, success);
          return;
        }

        const success: SceneActivationSuccess = {
          ok: true,
          data: await runtime.activateSceneForSession(command),
        };

        await idempotency.cacheSuccess({
          category: 'scene',
          command,
          response: success,
        });
        sendSceneSuccess(response, command.type, success);
        return;
      }
      default:
        throw new Error('Unsupported scene command type.');
    }
  } catch (error) {
    handleRuntimeError(response, error, sceneCommandErrorSchema);
  }
}

async function handleMovementCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: GameRuntime,
  idempotency: CommandIdempotencyStore,
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message: 'Request body must be valid JSON.',
      },
    } satisfies MovementCommandError);
    return;
  }

  const commandResult = movementCommandSchema.safeParse(body);

  if (!commandResult.success) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message:
          commandResult.error.issues[0]?.message ?? 'Invalid command payload.',
      },
    } satisfies MovementCommandError);
    return;
  }

  try {
    const command = commandResult.data;
    const idempotencyCategory: CommandIdempotencyCategory | null =
      command.type === 'get_active_scene_state' ? null : 'movement';
    const cachedSuccess = idempotencyCategory
      ? await idempotency.getCachedSuccess<MovementCommandSuccess>({
          category: idempotencyCategory,
          command,
        })
      : null;

    if (cachedSuccess) {
      sendJson(response, 200, cachedSuccess, movementCommandSuccessSchema);
      return;
    }

    if (
      idempotencyCategory &&
      combatCommandTransaction?.supports({
        category: idempotencyCategory,
        command,
      })
    ) {
      const success = await combatCommandTransaction.run({
        category: idempotencyCategory,
        command,
        runtime,
        prepare: (preparedRuntime) => {
          switch (command.type) {
            case 'move_character_in_active_scene':
              return preparedRuntime.prepareMoveCharacterInActiveScene(command);
            default:
              throw new Error(
                `Unsupported transactional combat command type "${command.type}".`,
              );
          }
        },
        execute: async (transactionRuntime, prepared) => {
          switch (command.type) {
            case 'move_character_in_active_scene': {
              const moved =
                await transactionRuntime.moveCharacterInActiveScenePrepared(
                  prepared,
                );

              if (!moved) {
                return null;
              }

              return {
                ok: true,
                data: moved,
              } satisfies MovementCommandSuccess;
            }
            default:
              throw new Error(
                `Unsupported transactional combat command type "${command.type}".`,
              );
          }
        },
      });

      if (success) {
        sendJson(response, 200, success, movementCommandSuccessSchema);
        return;
      }
    }

    let data: MovementCommandSuccess['data'];

    switch (command.type) {
      case 'place_character_in_active_scene':
        data = await runtime.placeCharacterInActiveScene(command);
        break;
      case 'move_character_in_active_scene':
        data = await runtime.moveCharacterInActiveScene(command);
        break;
      case 'get_active_scene_state':
        data = await runtime.getActiveSceneState(command);
        break;
      default:
        throw new Error('Unsupported movement command type.');
    }
    const success = {
      ok: true,
      data,
    };

    if (idempotencyCategory) {
      await idempotency.cacheSuccess({
        category: idempotencyCategory,
        command,
        response: success,
      });
    }
    sendJson(response, 200, success, movementCommandSuccessSchema);
  } catch (error) {
    handleRuntimeError(response, error, movementCommandErrorSchema);
  }
}

async function handleEncounterCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: GameRuntime,
  idempotency: CommandIdempotencyStore,
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary,
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message: 'Request body must be valid JSON.',
      },
    } satisfies EncounterCommandError);
    return;
  }

  const commandResult = encounterCommandSchema.safeParse(body);

  if (!commandResult.success) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message:
          commandResult.error.issues[0]?.message ?? 'Invalid command payload.',
      },
    } satisfies EncounterCommandError);
    return;
  }

  try {
    const command = commandResult.data;
    const idempotencyCategory: CommandIdempotencyCategory | null =
      command.type === 'get_encounter_state' ? null : 'encounter';

    if (
      idempotencyCategory &&
      combatCommandTransaction?.supports({
        category: idempotencyCategory,
        command,
      })
    ) {
      const success = await combatCommandTransaction.run({
        category: idempotencyCategory,
        command,
        runtime,
        prepare: (preparedRuntime) => {
          switch (command.type) {
            case 'attack':
              return preparedRuntime.prepareAttack(command);
            default:
              throw new Error(
                `Unsupported transactional combat command type "${command.type}".`,
              );
          }
        },
        execute: async (transactionRuntime, prepared) => {
          switch (command.type) {
            case 'attack':
              return {
                ok: true,
                data: {
                  encounter: await transactionRuntime.attackPrepared(prepared),
                },
              } satisfies EncounterCommandSuccess;
            default:
              throw new Error(
                `Unsupported transactional combat command type "${command.type}".`,
              );
          }
        },
      });

      if (!success) {
        throw new Error(
          `Transactional combat command "${command.type}" unexpectedly returned no result.`,
        );
      }

      sendJson(response, 200, success, encounterCommandSuccessSchema);
      return;
    }

    if (
      idempotencyCategory &&
      encounterCommandTransaction?.supports({
        category: idempotencyCategory,
        command,
      })
    ) {
      const success = await encounterCommandTransaction.run({
        category: idempotencyCategory,
        command,
        runtime,
        execute: async (transactionRuntime) => {
          let encounter: EncounterCommandSuccess['data']['encounter'];

          switch (command.type) {
            case 'start_encounter':
              encounter = await transactionRuntime.startEncounter(command);
              break;
            case 'advance_turn':
              encounter = await transactionRuntime.advanceTurn(command);
              break;
            case 'use_action':
              encounter = await transactionRuntime.useAction(command);
              break;
            case 'use_bonus_action':
              encounter = await transactionRuntime.useBonusAction(command);
              break;
            case 'use_reaction':
              encounter = await transactionRuntime.useReaction(command);
              break;
            case 'record_movement_usage':
              encounter = await transactionRuntime.recordMovementUsage(command);
              break;
            default:
              throw new Error(
                `Unsupported transactional encounter command type "${command.type}".`,
              );
          }

          return {
            ok: true,
            data: {
              encounter,
            },
          } satisfies EncounterCommandSuccess;
        },
      });

      sendJson(response, 200, success, encounterCommandSuccessSchema);
      return;
    }

    const cachedSuccess = idempotencyCategory
      ? await idempotency.getCachedSuccess<EncounterCommandSuccess>({
          category: idempotencyCategory,
          command,
        })
      : null;

    if (cachedSuccess) {
      sendJson(response, 200, cachedSuccess, encounterCommandSuccessSchema);
      return;
    }

    let encounter: EncounterCommandSuccess['data']['encounter'];

    switch (command.type) {
      case 'start_encounter':
        encounter = await runtime.startEncounter(command);
        break;
      case 'get_encounter_state':
        encounter = await runtime.getEncounterState(command);
        break;
      case 'advance_turn':
        encounter = await runtime.advanceTurn(command);
        break;
      case 'use_action':
        encounter = await runtime.useAction(command);
        break;
      case 'use_bonus_action':
        encounter = await runtime.useBonusAction(command);
        break;
      case 'use_reaction':
        encounter = await runtime.useReaction(command);
        break;
      case 'record_movement_usage':
        encounter = await runtime.recordMovementUsage(command);
        break;
      case 'attack':
        encounter = await runtime.attack(command);
        break;
      default:
        throw new Error('Unsupported encounter command type.');
    }

    const success: EncounterCommandSuccess = {
      ok: true,
      data: {
        encounter,
      },
    };

    if (idempotencyCategory) {
      await idempotency.cacheSuccess({
        category: idempotencyCategory,
        command,
        response: success,
      });
    }
    sendJson(response, 200, success, encounterCommandSuccessSchema);
  } catch (error) {
    handleRuntimeError(response, error, encounterCommandErrorSchema);
  }
}

async function handleDmCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: GameRuntime,
  idempotency: CommandIdempotencyStore,
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message: 'Request body must be valid JSON.',
      },
    } satisfies DmCommandError);
    return;
  }

  const commandResult = dmCommandSchema.safeParse(body);

  if (!commandResult.success) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message:
          commandResult.error.issues[0]?.message ?? 'Invalid command payload.',
      },
    } satisfies DmCommandError);
    return;
  }

  try {
    const command = commandResult.data;

    if (
      characterCommandTransaction?.supports({
        category: 'dm',
        command,
      })
    ) {
      const success = await characterCommandTransaction.run({
        category: 'dm',
        command,
        runtime,
        execute: async (transactionRuntime) => {
          switch (command.type) {
            case 'dm_set_character_current_hp':
              return {
                ok: true,
                data: await transactionRuntime.dmSetCharacterCurrentHp(command),
              } satisfies DmCommandSuccess;
            case 'dm_set_character_active_conditions':
              return {
                ok: true,
                data: await transactionRuntime.dmSetCharacterActiveConditions(
                  command,
                ),
              } satisfies DmCommandSuccess;
            default:
              throw new Error(
                `Unsupported transactional DM command type "${command.type}".`,
              );
          }
        },
      });

      sendJson(response, 200, success, dmCommandSuccessSchema);
      return;
    }

    if (
      encounterCommandTransaction?.supports({
        category: 'dm',
        command,
      })
    ) {
      const success = await encounterCommandTransaction.run({
        category: 'dm',
        command,
        runtime,
        execute: async (transactionRuntime) => {
          let encounter: EncounterCommandSuccess['data']['encounter'];

          switch (command.type) {
            case 'dm_set_current_turn_usage':
              encounter =
                await transactionRuntime.dmSetCurrentTurnUsage(command);
              break;
            case 'dm_set_current_turn_participant':
              encounter =
                await transactionRuntime.dmSetCurrentTurnParticipant(command);
              break;
            case 'dm_end_active_encounter':
              encounter =
                await transactionRuntime.dmEndActiveEncounter(command);
              break;
            default:
              throw new Error(
                `Unsupported transactional DM encounter command type "${command.type}".`,
              );
          }

          return {
            ok: true,
            data: {
              encounter,
            },
          } satisfies DmCommandSuccess;
        },
      });

      sendJson(response, 200, success, dmCommandSuccessSchema);
      return;
    }

    const cachedSuccess = await idempotency.getCachedSuccess<DmCommandSuccess>({
      category: 'dm',
      command,
    });

    if (cachedSuccess) {
      sendJson(response, 200, cachedSuccess, dmCommandSuccessSchema);
      return;
    }

    let data: DmCommandSuccess['data'];

    switch (command.type) {
      case 'dm_set_character_current_hp':
        data = await runtime.dmSetCharacterCurrentHp(command);
        break;
      case 'dm_set_character_active_conditions':
        data = await runtime.dmSetCharacterActiveConditions(command);
        break;
      case 'dm_reposition_character_in_active_scene':
        data = await runtime.dmRepositionCharacterInActiveScene(command);
        break;
      case 'dm_set_current_turn_usage':
        data = {
          encounter: await runtime.dmSetCurrentTurnUsage(command),
        };
        break;
      case 'dm_set_current_turn_participant':
        data = {
          encounter: await runtime.dmSetCurrentTurnParticipant(command),
        };
        break;
      case 'dm_end_active_encounter':
        data = {
          encounter: await runtime.dmEndActiveEncounter(command),
        };
        break;
      default:
        throw new Error('Unsupported DM command type.');
    }

    const success: DmCommandSuccess = {
      ok: true,
      data,
    };

    await idempotency.cacheSuccess({
      category: 'dm',
      command,
      response: success,
    });
    sendJson(response, 200, success, dmCommandSuccessSchema);
  } catch (error) {
    handleRuntimeError(response, error, dmCommandErrorSchema);
  }
}

function handleStreamRequest(
  response: ServerResponse,
  request: IncomingMessage,
  url: URL,
  rawSessionId: string,
  runtime: GameRuntime,
): void {
  const sessionIdResult = sessionIdSchema.safeParse(rawSessionId);

  if (!sessionIdResult.success) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_session_id',
        message:
          sessionIdResult.error.issues[0]?.message ?? 'Invalid session ID.',
      },
    } satisfies SessionCommandError);
    return;
  }

  const participantIdResult = participantIdSchema.safeParse(
    url.searchParams.get('participantId'),
  );

  if (!participantIdResult.success) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: 'invalid_command',
        message:
          participantIdResult.error.issues[0]?.message ??
          'participantId query parameter is required.',
      },
    } satisfies SessionCommandError);
    return;
  }

  try {
    runtime.getSessionSnapshotForParticipant(
      sessionIdResult.data,
      participantIdResult.data,
    );
  } catch (error) {
    handleRuntimeError(response, error, sessionCommandErrorSchema);
    return;
  }

  const connectionId = createConnectionId();
  const pendingEvents: string[] = [];
  let connectionClosed = false;
  let streamStarted = false;

  const subscriber = {
    connectionId,
    close: () => {
      response.end();
    },
    send: (update: SessionStreamEvent) => {
      const eventPayload = serializeSseEvent(update);

      if (!streamStarted) {
        pendingEvents.push(eventPayload);
        return;
      }

      response.write(eventPayload);
    },
  };

  try {
    runtime.connectParticipant(
      sessionIdResult.data,
      participantIdResult.data,
      subscriber,
    );
  } catch (error) {
    handleRuntimeError(response, error, sessionCommandErrorSchema);
    return;
  }

  response.writeHead(200, {
    ...corsHeaders,
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'content-type': 'text/event-stream',
    'x-accel-buffering': 'no',
  });
  response.write('\n');
  streamStarted = true;

  for (const eventPayload of pendingEvents) {
    response.write(eventPayload);
  }

  const heartbeat = setInterval(() => {
    response.write(': heartbeat\n\n');
  }, 15_000);

  const closeConnection = (): void => {
    if (connectionClosed) {
      return;
    }

    connectionClosed = true;
    clearInterval(heartbeat);
    runtime.disconnectParticipant(
      sessionIdResult.data,
      participantIdResult.data,
      connectionId,
    );
  };

  request.on('close', closeConnection);
  response.on('close', closeConnection);
}

function handleRuntimeError(
  response: ServerResponse,
  error: unknown,
  errorSchema:
    | typeof characterCommandErrorSchema
    | typeof dmCommandErrorSchema
    | typeof encounterCommandErrorSchema
    | typeof movementCommandErrorSchema
    | typeof sceneCommandErrorSchema
    | typeof sessionCommandErrorSchema,
): void {
  if (response.headersSent || response.writableEnded) {
    response.end();
    return;
  }

  if (isRuntimeStoreError(error)) {
    sendJson(
      response,
      errorCodeToStatus(error.code),
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      },
      errorSchema,
    );
    return;
  }

  handleUnexpectedError(response, error, errorSchema);
}

function handleUnexpectedError(
  response: ServerResponse,
  error: unknown,
  errorSchema:
    | typeof characterCommandErrorSchema
    | typeof dmCommandErrorSchema
    | typeof encounterCommandErrorSchema
    | typeof movementCommandErrorSchema
    | typeof sceneCommandErrorSchema
    | typeof sessionCommandErrorSchema,
): void {
  if (response.headersSent || response.writableEnded) {
    response.end();
    return;
  }

  console.error('[server] unexpected error', error);
  sendJson(
    response,
    500,
    {
      ok: false,
      error: {
        code: 'internal_server_error',
        message: 'Unexpected server error.',
      },
    },
    errorSchema,
  );
}

function sendCharacterSuccess(
  response: ServerResponse,
  commandType: string,
  payload: CharacterAssignmentSuccess | CharacterCommandSuccess,
): void {
  if (commandType === 'assign_character_to_participant') {
    sendJson(response, 200, payload, characterAssignmentSuccessSchema);
    return;
  }

  sendJson(response, 200, payload, characterCommandSuccessSchema);
}

function sendSceneSuccess(
  response: ServerResponse,
  commandType: string,
  payload: SceneActivationSuccess | SceneCommandSuccess,
): void {
  if (commandType === 'activate_scene_for_session') {
    sendJson(response, 200, payload, sceneActivationSuccessSchema);
    return;
  }

  sendJson(response, 200, payload, sceneCommandSuccessSchema);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  schema?: { parse: (input: unknown) => unknown },
): void {
  if (schema) {
    schema.parse(payload);
  }

  response.writeHead(statusCode, {
    ...corsHeaders,
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString('utf8');

  if (!body) {
    return {};
  }

  return JSON.parse(body) as unknown;
}

function buildStreamPath(sessionId: string, participantId: string): string {
  const encodedSessionId = encodeURIComponent(sessionId);
  const encodedParticipantId = encodeURIComponent(participantId);

  return `/api/sessions/${encodedSessionId}/stream?participantId=${encodedParticipantId}`;
}

function errorCodeToStatus(code: RuntimeErrorCode): number {
  switch (code) {
    case 'character_not_found':
    case 'participant_not_found':
    case 'rules_profile_not_found':
    case 'scene_not_found':
    case 'session_not_found':
      return 404;
    // These errors mean the current authoritative session/scene state cannot
    // satisfy the request as issued, even if the command shape itself is valid.
    case 'character_not_placed':
    case 'command_id_conflict':
    case 'duplicate_join':
    case 'encounter_already_active':
    case 'action_already_used':
    case 'attack_target_downed':
    case 'attack_target_out_of_reach':
    case 'bonus_action_already_used':
    case 'invalid_encounter_participant':
    case 'invalid_attack_target':
    case 'invalid_encounter_session_association':
    case 'invalid_turn_actor':
    case 'invalid_participant_session_association':
    case 'invalid_scene_session_association':
    case 'invalid_character_state':
    case 'invalid_scene_encounter_association':
    case 'invalid_turn_advance':
    case 'movement_destination_blocked':
    case 'movement_usage_exceeds_allowance':
    case 'no_active_encounter':
    case 'no_active_scene':
    case 'no_assigned_character':
    case 'reaction_already_used':
    case 'self_target_not_allowed':
    case 'scene_entity_overlap':
    case 'turn_actor_downed':
      return 409;
    // These errors mean the request target itself is invalid for the current
    // validated constraints.
    case 'internal_server_error':
      return 500;
    case 'invalid_command':
    case 'invalid_character_id':
    case 'invalid_character_hp':
    case 'invalid_condition_list':
    case 'invalid_entity_position':
    case 'invalid_grid_size':
    case 'invalid_movement_usage_amount':
    case 'invalid_scene_id':
    case 'invalid_session_id':
    case 'movement_exceeds_allowance':
    case 'movement_out_of_bounds':
    case 'scene_entity_out_of_bounds':
      return 400;
    case 'invalid_role_assumption':
      return 403;
  }
}

function isRuntimeStoreError(error: unknown): error is RuntimeStoreError {
  return (
    error instanceof CharacterStoreError ||
    error instanceof CommandIdempotencyError ||
    error instanceof EncounterRuntimeError ||
    error instanceof EncounterStoreError ||
    error instanceof MovementRuntimeError ||
    error instanceof RulesProfileStoreError ||
    error instanceof SceneStoreError ||
    error instanceof SessionStoreError
  );
}

function serializeSseEvent(update: SessionStreamEvent): string {
  const payload = sessionStreamEventSchema.parse(update);

  return `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function setCorsHeaders(response: ServerResponse): void {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.setHeader(key, value);
  }
}

function getBaseUrl(request: IncomingMessage): string {
  return `http://${request.headers.host ?? '127.0.0.1:2567'}`;
}
