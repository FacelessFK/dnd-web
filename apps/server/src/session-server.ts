import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import {
  authMeResponseSchema,
  authMeSuccessSchema,
  authResponseSchema,
  authSuccessSchema,
  characterAssignmentSuccessSchema,
  characterCommandErrorSchema,
  characterCommandSchema,
  characterCommandSuccessSchema,
  characterLibraryCommandErrorSchema,
  characterLibraryCommandSchema,
  characterLibraryCommandSuccessSchema,
  characterLibraryEntryIdSchema,
  clientCommandSchema,
  dmCommandErrorSchema,
  dmCommandSchema,
  dmCommandSuccessSchema,
  encounterCommandErrorSchema,
  encounterCommandSchema,
  encounterCommandSuccessSchema,
  loginAuthRequestSchema,
  movementCommandErrorSchema,
  movementCommandSchema,
  movementCommandSuccessSchema,
  outboxStatusSuccessSchema,
  participantIdSchema,
  registerAuthRequestSchema,
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
  type CharacterLibraryCommandSuccess,
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

import { AuthService, AuthStoreError } from './auth-store.js';
import { CharacterStoreError } from './character-store.js';
import {
  DbBackedCharacterLibraryRepository,
  CharacterLibraryService,
  CharacterLibraryStoreError,
} from './character-library-store.js';
import {
  CommandIdempotencyError,
  InMemoryCommandIdempotencyStore,
  type CommandIdempotencyCategory,
  type CommandIdempotencyStore,
} from './command-idempotency-store.js';
import type { CommandEventOutboxDispatcherLike } from './command-event-outbox-dispatcher.js';
import {
  CombatMovementTransactionRequiredError,
  DbBackedCharacterCommandTransactionBoundary,
} from './db-character-command-transaction.js';
import { DbBackedCombatCommandTransactionBoundary } from './db-combat-command-transaction.js';
import { DbBackedEncounterCommandTransactionBoundary } from './db-encounter-command-transaction.js';
import { DbBackedSceneCommandTransactionBoundary } from './db-scene-command-transaction.js';
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

const defaultWebOrigin = 'http://localhost:3000';

const baseCorsHeaders = {
  'access-control-allow-headers': 'content-type',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  vary: 'Origin',
} as const;

type RuntimeStoreError =
  | AuthStoreError
  | CharacterStoreError
  | CharacterLibraryStoreError
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

type ErrorResponseSchema = { parse: (input: unknown) => unknown };

export function createSessionServer(
  runtime: GameRuntime = new InMemoryGameRuntime(),
  idempotency: CommandIdempotencyStore = new InMemoryCommandIdempotencyStore(),
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary,
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary,
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
  commandEventOutboxDispatcher?: CommandEventOutboxDispatcherLike,
  sceneCommandTransaction?: DbBackedSceneCommandTransactionBoundary,
  characterLibrary: CharacterLibraryService = new CharacterLibraryService(),
  auth?: AuthService,
): {
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary;
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary;
  characterLibrary: CharacterLibraryService;
  auth?: AuthService;
  commandEventOutboxDispatcher?: CommandEventOutboxDispatcherLike;
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary;
  idempotency: CommandIdempotencyStore;
  sceneCommandTransaction?: DbBackedSceneCommandTransactionBoundary;
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
        sceneCommandTransaction,
        characterLibrary,
        auth,
        commandEventOutboxDispatcher,
      );
    } catch (error) {
      handleUnexpectedError(response, error, sessionCommandErrorSchema);
    }
  });

  return {
    combatCommandTransaction,
    characterCommandTransaction,
    characterLibrary,
    auth,
    commandEventOutboxDispatcher,
    encounterCommandTransaction,
    idempotency,
    sceneCommandTransaction,
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
  sceneCommandTransaction?: DbBackedSceneCommandTransactionBoundary,
  characterLibrary: CharacterLibraryService = new CharacterLibraryService(),
  auth?: AuthService,
  commandEventOutboxDispatcher?: CommandEventOutboxDispatcherLike,
): Promise<void> {
  setCorsHeaders(response, request);

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
      status:
        'db-idempotency-claim-plus-scene-transaction-and-session-character-movement-encounter-combat-outbox-foundation',
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    await handleAuthMeRequest(request, response, auth);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/outbox/status') {
    await handleOutboxStatusRequest(response, commandEventOutboxDispatcher);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    await handleAuthRegisterRequest(request, response, auth);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    await handleAuthLoginRequest(request, response, auth);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    await handleAuthLogoutRequest(request, response, auth);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/session/command') {
    await handleSessionCommandRequest(
      request,
      response,
      runtime,
      idempotency,
      sessionCommandTransaction,
    );
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
      characterLibrary,
      auth,
    );
    return;
  }

  if (
    request.method === 'POST' &&
    url.pathname === '/api/character-library/command'
  ) {
    await handleCharacterLibraryCommandRequest(
      request,
      response,
      characterLibrary,
      idempotency,
      auth,
    );
    return;
  }

  const portraitMatch = url.pathname.match(
    /^\/api\/character-library\/portraits\/([^/]+)\/([^/]+)\/([^/]+)$/,
  );

  if (request.method === 'GET' && portraitMatch) {
    await handleCharacterLibraryPortraitRequest(
      request,
      response,
      characterLibrary,
      auth,
      portraitMatch,
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
      sceneCommandTransaction,
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/movement/command') {
    await handleMovementCommandRequest(
      request,
      response,
      runtime,
      idempotency,
      characterCommandTransaction,
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
      combatCommandTransaction,
      sceneCommandTransaction,
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

async function handleAuthMeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  auth?: AuthService,
): Promise<void> {
  try {
    const user = auth
      ? await auth.getUserByToken(readAuthCookie(request))
      : null;

    sendJson(
      response,
      200,
      {
        data: {
          authenticated: user !== null,
          user,
        },
        ok: true,
      },
      authMeSuccessSchema,
    );
  } catch (error) {
    handleRuntimeError(response, error, authMeResponseSchema);
  }
}

async function handleOutboxStatusRequest(
  response: ServerResponse,
  commandEventOutboxDispatcher?: CommandEventOutboxDispatcherLike,
): Promise<void> {
  const data = commandEventOutboxDispatcher
    ? await commandEventOutboxDispatcher.getUnpublishedStatus()
    : {
        configured: false,
        eventTypeCounts: {
          character_state: 0,
          combat_event: 0,
          encounter_state: 0,
          movement_state: 0,
          session_state: 0,
        },
        oldestCreatedAt: null,
        unpublishedCount: 0,
      };

  sendJson(
    response,
    200,
    {
      data,
      ok: true,
    },
    outboxStatusSuccessSchema,
  );
}

async function handleAuthRegisterRequest(
  request: IncomingMessage,
  response: ServerResponse,
  auth?: AuthService,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    sendJson(
      response,
      400,
      invalidAuthRequest('Request body must be valid JSON.'),
    );
    return;
  }

  const requestResult = registerAuthRequestSchema.safeParse(body);

  if (!requestResult.success) {
    sendJson(
      response,
      400,
      invalidAuthRequest(
        requestResult.error.issues[0]?.message ?? 'Invalid register payload.',
      ),
    );
    return;
  }

  try {
    const service = requireAuthService(auth);
    const session = await service.register(requestResult.data);

    setAuthCookie(response, session.token, session.expiresAt);
    sendJson(
      response,
      200,
      {
        data: {
          user: session.user,
        },
        ok: true,
      },
      authSuccessSchema,
    );
  } catch (error) {
    handleRuntimeError(response, error, authResponseSchema);
  }
}

async function handleAuthLoginRequest(
  request: IncomingMessage,
  response: ServerResponse,
  auth?: AuthService,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    sendJson(
      response,
      400,
      invalidAuthRequest('Request body must be valid JSON.'),
    );
    return;
  }

  const requestResult = loginAuthRequestSchema.safeParse(body);

  if (!requestResult.success) {
    sendJson(
      response,
      400,
      invalidAuthRequest(
        requestResult.error.issues[0]?.message ?? 'Invalid login payload.',
      ),
    );
    return;
  }

  try {
    const service = requireAuthService(auth);
    const session = await service.login(requestResult.data);

    setAuthCookie(response, session.token, session.expiresAt);
    sendJson(
      response,
      200,
      {
        data: {
          user: session.user,
        },
        ok: true,
      },
      authSuccessSchema,
    );
  } catch (error) {
    handleRuntimeError(response, error, authResponseSchema);
  }
}

async function handleAuthLogoutRequest(
  request: IncomingMessage,
  response: ServerResponse,
  auth?: AuthService,
): Promise<void> {
  try {
    if (auth) {
      await auth.logout(readAuthCookie(request));
    }

    clearAuthCookie(response);
    sendJson(
      response,
      200,
      {
        data: {
          authenticated: false,
          user: null,
        },
        ok: true,
      },
      authMeSuccessSchema,
    );
  } catch (error) {
    handleRuntimeError(response, error, authMeResponseSchema);
  }
}

async function handleSessionCommandRequest(
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

    if (
      sessionCommandTransaction?.supports({
        category: 'session',
        command,
      })
    ) {
      const success: SessionCommandSuccess = {
        ok: true,
        data: await sessionCommandTransaction.run({
          category: 'session',
          command,
          execute: async (transactionRuntime) => {
            let result;

            switch (command.type) {
              case 'create_session':
                result = await transactionRuntime.createSession(command);
                break;
              case 'join_session':
                result = await transactionRuntime.joinSession(command);
                break;
              default:
                throw new Error(
                  `Unsupported transactional session command type "${command.type}".`,
                );
            }

            return {
              sessionId: result.sessionId,
              participantId: result.participantId,
              state: result.state,
              streamPath: buildStreamPath(
                result.sessionId,
                result.participantId,
              ),
            } satisfies SessionCommandSuccess['data'];
          },
          runtime,
        }),
      };

      sendJson(response, 200, success, sessionCommandSuccessSchema);
      return;
    }

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
  characterLibrary: CharacterLibraryService = new CharacterLibraryService(),
  auth?: AuthService,
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
    const authenticatedUser =
      command.type === 'submit_character_library_entry_for_assignment' && auth
        ? await requireAuthenticatedUser(request, auth)
        : null;

    if (
      auth &&
      command.type === 'submit_character_library_entry_for_assignment' &&
      (!authenticatedUser ||
        command.payload.ownerParticipantId !== authenticatedUser.id)
    ) {
      throw new CharacterLibraryStoreError(
        'invalid_participant_session_association',
        'Authenticated user cannot submit another owner character library entry.',
      );
    }

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
      case 'submit_character_for_assignment': {
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
                transactionRuntime.submitCharacterForAssignment(command),
              runtime,
            }),
          };

          sendCharacterSuccess(response, command.type, success);
          return;
        }

        const success: CharacterAssignmentSuccess = {
          ok: true,
          data: await runtime.submitCharacterForAssignment(command),
        };

        await idempotency.cacheSuccess({
          category: 'character',
          command,
          response: success,
        });
        sendCharacterSuccess(response, command.type, success);
        return;
      }
      case 'submit_character_library_entry_for_assignment': {
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
              execute: async (transactionRuntime, context) => {
                const transactionCharacterLibrary =
                  characterLibrary.withRepository(
                    new DbBackedCharacterLibraryRepository(
                      context.characterLibrary,
                    ),
                  );
                const entry =
                  await transactionCharacterLibrary.getEntryForOwner(
                    {
                      entryId: command.payload.entryId,
                      ownerParticipantId: command.payload.ownerParticipantId,
                    },
                    authenticatedUser?.id,
                  );

                return transactionRuntime.submitCharacterLibraryEntryForAssignment(
                  command,
                  entry,
                );
              },
              runtime,
            }),
          };

          sendCharacterSuccess(response, command.type, success);
          return;
        }

        const entry = await characterLibrary.getEntryForOwner(
          {
            entryId: command.payload.entryId,
            ownerParticipantId: command.payload.ownerParticipantId,
          },
          authenticatedUser?.id,
        );
        const success: CharacterAssignmentSuccess = {
          ok: true,
          data: await runtime.submitCharacterLibraryEntryForAssignment(
            command,
            entry,
          ),
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

async function handleCharacterLibraryCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  characterLibrary: CharacterLibraryService,
  idempotency: CommandIdempotencyStore,
  auth?: AuthService,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    sendJson(
      response,
      400,
      {
        ok: false,
        error: {
          code: 'invalid_command',
          message: 'Request body must be valid JSON.',
        },
      },
      characterLibraryCommandErrorSchema,
    );
    return;
  }

  const commandResult = characterLibraryCommandSchema.safeParse(body);

  if (!commandResult.success) {
    sendJson(
      response,
      400,
      {
        ok: false,
        error: {
          code: 'invalid_command',
          message:
            commandResult.error.issues[0]?.message ??
            'Invalid command payload.',
        },
      },
      characterLibraryCommandErrorSchema,
    );
    return;
  }

  try {
    const command = commandResult.data;
    const authenticatedUser = auth
      ? await requireAuthenticatedUser(request, auth)
      : null;

    if (auth) {
      if (
        !authenticatedUser ||
        command.actor.participantId !== authenticatedUser.id ||
        command.payload.ownerParticipantId !== authenticatedUser.id
      ) {
        throw new CharacterLibraryStoreError(
          'invalid_participant_session_association',
          'Authenticated user cannot manage another owner character library.',
        );
      }
    }

    const idempotencyCategory: CommandIdempotencyCategory | null =
      command.type === 'get_character_library_entry' ||
      command.type === 'list_character_library_entries'
        ? null
        : 'character-library';
    const cachedSuccess = idempotencyCategory
      ? await idempotency.getCachedSuccess<CharacterLibraryCommandSuccess>({
          category: idempotencyCategory,
          command,
        })
      : null;

    if (cachedSuccess) {
      sendJson(
        response,
        200,
        cachedSuccess,
        characterLibraryCommandSuccessSchema,
      );
      return;
    }

    const data =
      command.type === 'list_character_library_entries'
        ? {
            entries: await characterLibrary.listEntries(
              command,
              authenticatedUser?.id,
            ),
          }
        : {
            entry:
              command.type === 'create_character_library_entry'
                ? await characterLibrary.createEntry(
                    command,
                    authenticatedUser?.id,
                  )
                : command.type === 'update_character_library_entry'
                  ? await characterLibrary.updateEntry(
                      command,
                      authenticatedUser?.id,
                    )
                  : command.type === 'finalize_character_library_entry'
                    ? await characterLibrary.finalizeEntry(
                        command,
                        authenticatedUser?.id,
                      )
                    : await characterLibrary.getEntry(
                        command,
                        authenticatedUser?.id,
                      ),
          };
    const success: CharacterLibraryCommandSuccess = {
      data,
      ok: true,
    };

    if (idempotencyCategory) {
      await idempotency.cacheSuccess({
        category: idempotencyCategory,
        command,
        response: success,
      });
    }

    sendJson(response, 200, success, characterLibraryCommandSuccessSchema);
  } catch (error) {
    handleRuntimeError(response, error, characterLibraryCommandErrorSchema);
  }
}

async function handleCharacterLibraryPortraitRequest(
  request: IncomingMessage,
  response: ServerResponse,
  characterLibrary: CharacterLibraryService,
  auth: AuthService | undefined,
  portraitMatch: RegExpMatchArray,
): Promise<void> {
  try {
    const authenticatedUser = await requireAuthenticatedUser(request, auth);
    const ownerUserId = decodeURIComponent(portraitMatch[1] ?? '');
    const entryId = characterLibraryEntryIdSchema.parse(
      decodeURIComponent(portraitMatch[2] ?? ''),
    );
    const fileName = decodeURIComponent(portraitMatch[3] ?? '');

    if (ownerUserId !== authenticatedUser.id) {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        'Character portrait does not exist for authenticated user.',
      );
    }

    const portrait = await characterLibrary.readPortrait({
      entryId,
      fileName,
      ownerUserId,
    });

    response.writeHead(200, {
      ...getCorsHeaders(request),
      'cache-control': 'private, max-age=31536000, immutable',
      'content-length': portrait.data.byteLength,
      'content-type': portrait.mimeType,
    });
    response.end(portrait.data);
  } catch (error) {
    handleRuntimeError(response, error, characterLibraryCommandErrorSchema);
  }
}

async function handleSceneCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: GameRuntime,
  idempotency: CommandIdempotencyStore,
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary,
  sceneCommandTransaction?: DbBackedSceneCommandTransactionBoundary,
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

    if (
      idempotencyCategory &&
      sceneCommandTransaction?.supports({
        category: idempotencyCategory,
        command,
      })
    ) {
      const success: SceneCommandSuccess = {
        ok: true,
        data: {
          scene: await sceneCommandTransaction.run({
            category: idempotencyCategory,
            command,
            execute: async (transactionRuntime) => {
              switch (command.type) {
                case 'create_scene':
                  return transactionRuntime.createScene(command);
                case 'place_entity_in_scene':
                  return transactionRuntime.placeEntityInScene(command);
                case 'update_scene_entity':
                  return transactionRuntime.updateSceneEntity(command);
                case 'reposition_scene_entity':
                  return transactionRuntime.repositionSceneEntity(command);
                case 'delete_scene_entity':
                  return transactionRuntime.deleteSceneEntity(command);
                case 'paint_scene_terrain':
                  return transactionRuntime.paintSceneTerrain(command);
                case 'create_scene_transition':
                  return transactionRuntime.createSceneTransition(command);
                case 'update_scene_transition':
                  return transactionRuntime.updateSceneTransition(command);
                case 'delete_scene_transition':
                  return transactionRuntime.deleteSceneTransition(command);
                default:
                  throw new Error(
                    `Unsupported transactional scene command type "${command.type}".`,
                  );
              }
            },
            runtime,
          }),
        },
      };

      sendSceneSuccess(response, command.type, success);
      return;
    }

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
      case 'place_entity_in_scene':
      case 'update_scene_entity':
      case 'reposition_scene_entity':
      case 'delete_scene_entity':
      case 'paint_scene_terrain':
      case 'create_scene_transition':
      case 'update_scene_transition':
      case 'delete_scene_transition': {
        const scene =
          command.type === 'create_scene'
            ? await runtime.createScene(command)
            : command.type === 'get_scene'
              ? await runtime.getScene(command)
              : command.type === 'place_entity_in_scene'
                ? await runtime.placeEntityInScene(command)
                : command.type === 'update_scene_entity'
                  ? await runtime.updateSceneEntity(command)
                  : command.type === 'reposition_scene_entity'
                    ? await runtime.repositionSceneEntity(command)
                    : command.type === 'delete_scene_entity'
                      ? await runtime.deleteSceneEntity(command)
                      : command.type === 'paint_scene_terrain'
                        ? await runtime.paintSceneTerrain(command)
                        : command.type === 'create_scene_transition'
                          ? await runtime.createSceneTransition(command)
                          : command.type === 'update_scene_transition'
                            ? await runtime.updateSceneTransition(command)
                            : await runtime.deleteSceneTransition(command);
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
      case 'activate_scene_for_session':
      case 'activate_scene_transition': {
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
                command.type === 'activate_scene_for_session'
                  ? transactionRuntime.activateSceneForSession(command)
                  : transactionRuntime.activateSceneTransition(command),
              runtime,
            }),
          };

          sendSceneSuccess(response, command.type, success);
          return;
        }

        const success: SceneActivationSuccess = {
          ok: true,
          data:
            command.type === 'activate_scene_for_session'
              ? await runtime.activateSceneForSession(command)
              : await runtime.activateSceneTransition(command),
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
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
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
    const runCombatMovementTransaction =
      async (): Promise<MovementCommandSuccess | null> => {
        if (
          !idempotencyCategory ||
          !combatCommandTransaction?.supports({
            category: idempotencyCategory,
            command,
          })
        ) {
          return null;
        }

        const success = await combatCommandTransaction.run({
          category: idempotencyCategory,
          command,
          runtime,
          prepare: (preparedRuntime) => {
            switch (command.type) {
              case 'move_character_in_active_scene':
                return preparedRuntime.prepareMoveCharacterInActiveScene(
                  command,
                );
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

        if (!success) {
          return null;
        }

        return success;
      };

    {
      const success = await runCombatMovementTransaction();
      if (success) {
        sendJson(response, 200, success, movementCommandSuccessSchema);
        return;
      }
    }

    if (
      idempotencyCategory &&
      characterCommandTransaction?.supports({
        category: idempotencyCategory,
        command,
      })
    ) {
      let success: MovementCommandSuccess;

      try {
        success = await characterCommandTransaction.run({
          category: idempotencyCategory,
          command,
          runtime,
          execute: async (transactionRuntime) => {
            let data: MovementCommandSuccess['data'];

            switch (command.type) {
              case 'place_character_in_active_scene':
                data =
                  await transactionRuntime.placeCharacterInActiveScene(command);
                break;
              case 'move_character_in_active_scene':
                data =
                  await transactionRuntime.moveCharacterInActiveScene(command);
                break;
              default:
                throw new Error(
                  `Unsupported transactional movement command type "${command.type}".`,
                );
            }

            return {
              ok: true,
              data,
            } satisfies MovementCommandSuccess;
          },
        });
      } catch (error) {
        if (
          error instanceof CombatMovementTransactionRequiredError &&
          command.type === 'move_character_in_active_scene'
        ) {
          const retriedSuccess = await runCombatMovementTransaction();

          if (retriedSuccess) {
            sendJson(
              response,
              200,
              retriedSuccess,
              movementCommandSuccessSchema,
            );
            return;
          }
        }

        throw error;
      }

      sendJson(response, 200, success, movementCommandSuccessSchema);
      return;
    }

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
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
  sceneCommandTransaction?: DbBackedSceneCommandTransactionBoundary,
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
            case 'dm_reposition_character_in_active_scene':
              return {
                ok: true,
                data: await transactionRuntime.dmRepositionCharacterInActiveScene(
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
      sceneCommandTransaction?.supports({
        category: 'dm',
        command,
      })
    ) {
      const success = await sceneCommandTransaction.run({
        category: 'dm',
        command,
        runtime,
        execute: async (transactionRuntime) => {
          switch (command.type) {
            case 'dm_create_combatant_in_active_scene':
              return {
                ok: true,
                data: {
                  scene:
                    await transactionRuntime.dmCreateCombatantInActiveScene(
                      command,
                    ),
                },
              } satisfies DmCommandSuccess;
            case 'dm_reposition_combatant_in_active_scene':
              return {
                ok: true,
                data: {
                  scene:
                    await transactionRuntime.dmRepositionCombatantInActiveScene(
                      command,
                    ),
                },
              } satisfies DmCommandSuccess;
            case 'dm_set_combatant_current_hp':
              return {
                ok: true,
                data: {
                  scene:
                    await transactionRuntime.dmSetCombatantCurrentHp(command),
                },
              } satisfies DmCommandSuccess;
            default:
              throw new Error(
                `Unsupported transactional DM scene command type "${command.type}".`,
              );
          }
        },
      });

      sendJson(response, 200, success, dmCommandSuccessSchema);
      return;
    }

    if (
      combatCommandTransaction?.supports({
        category: 'dm',
        command,
      })
    ) {
      const success = await combatCommandTransaction.run({
        category: 'dm',
        command,
        runtime,
        prepare: (preparedRuntime) => {
          switch (command.type) {
            case 'dm_combatant_attack':
              return preparedRuntime.prepareDmCombatantAttack(command);
            default:
              throw new Error(
                `Unsupported transactional DM combat command type "${command.type}".`,
              );
          }
        },
        execute: async (transactionRuntime, prepared) => {
          switch (command.type) {
            case 'dm_combatant_attack':
              return {
                ok: true,
                data: {
                  encounter:
                    await transactionRuntime.dmCombatantAttackPrepared(
                      prepared,
                    ),
                },
              } satisfies DmCommandSuccess;
            default:
              throw new Error(
                `Unsupported transactional DM combat command type "${command.type}".`,
              );
          }
        },
      });

      if (!success) {
        throw new Error(
          `Transactional DM combat command "${command.type}" unexpectedly returned no result.`,
        );
      }

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
      case 'dm_create_combatant_in_active_scene':
        data = {
          scene: await runtime.dmCreateCombatantInActiveScene(command),
        };
        break;
      case 'dm_reposition_combatant_in_active_scene':
        data = {
          scene: await runtime.dmRepositionCombatantInActiveScene(command),
        };
        break;
      case 'dm_set_combatant_current_hp':
        data = {
          scene: await runtime.dmSetCombatantCurrentHp(command),
        };
        break;
      case 'dm_combatant_attack':
        data = {
          encounter: await runtime.dmCombatantAttack(command),
        };
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
    ...getCorsHeaders(request),
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
  errorSchema: ErrorResponseSchema,
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
  errorSchema: ErrorResponseSchema,
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

  if (
    commandType === 'submit_character_for_assignment' ||
    commandType === 'submit_character_library_entry_for_assignment'
  ) {
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
  if (
    commandType === 'activate_scene_for_session' ||
    commandType === 'activate_scene_transition'
  ) {
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
    case 'character_library_entry_not_found':
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
    case 'email_already_registered':
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
    case 'scene_terrain_blocks_occupant':
    case 'turn_actor_downed':
      return 409;
    // These errors mean the request target itself is invalid for the current
    // validated constraints.
    case 'internal_server_error':
      return 500;
    case 'invalid_command':
    case 'invalid_credentials':
    case 'invalid_character_id':
    case 'invalid_character_hp':
    case 'invalid_character_library_entry':
    case 'invalid_condition_list':
    case 'invalid_entity_position':
    case 'invalid_grid_size':
    case 'invalid_movement_usage_amount':
    case 'invalid_scene_id':
    case 'invalid_session_id':
    case 'movement_exceeds_allowance':
    case 'movement_out_of_bounds':
    case 'scene_entity_out_of_bounds':
    case 'scene_terrain_out_of_bounds':
      return 400;
    case 'invalid_role_assumption':
      return 403;
    case 'unauthenticated':
      return 401;
  }
}

function isRuntimeStoreError(error: unknown): error is RuntimeStoreError {
  return (
    error instanceof AuthStoreError ||
    error instanceof CharacterStoreError ||
    error instanceof CharacterLibraryStoreError ||
    error instanceof CommandIdempotencyError ||
    error instanceof EncounterRuntimeError ||
    error instanceof EncounterStoreError ||
    error instanceof MovementRuntimeError ||
    error instanceof RulesProfileStoreError ||
    error instanceof SceneStoreError ||
    error instanceof SessionStoreError
  );
}

function requireAuthService(auth?: AuthService): AuthService {
  if (auth) {
    return auth;
  }

  throw new AuthStoreError(
    'internal_server_error',
    'Authentication requires SERVER_PERSISTENCE_MODE=db.',
  );
}

async function requireAuthenticatedUser(
  request: IncomingMessage,
  auth?: AuthService,
) {
  return requireAuthService(auth).requireUserByToken(readAuthCookie(request));
}

function invalidAuthRequest(message: string) {
  return {
    ok: false,
    error: {
      code: 'invalid_command',
      message,
    },
  } as const;
}

const AUTH_COOKIE_NAME = 'dnd_web_session';

function readAuthCookie(request: IncomingMessage): string | null {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = cookie.trim().split('=');

    if (rawName === AUTH_COOKIE_NAME) {
      return decodeURIComponent(rawValueParts.join('='));
    }
  }

  return null;
}

function setAuthCookie(
  response: ServerResponse,
  token: string,
  expiresAt: Date,
): void {
  response.setHeader(
    'set-cookie',
    [
      `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      `Expires=${expiresAt.toUTCString()}`,
      `Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}`,
      isSecureCookieEnabled() ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; '),
  );
}

function clearAuthCookie(response: ServerResponse): void {
  response.setHeader(
    'set-cookie',
    [
      `${AUTH_COOKIE_NAME}=`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'Max-Age=0',
      isSecureCookieEnabled() ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; '),
  );
}

function isSecureCookieEnabled(): boolean {
  if (process.env.AUTH_COOKIE_SECURE) {
    return process.env.AUTH_COOKIE_SECURE === 'true';
  }

  return process.env.NODE_ENV === 'production';
}

function serializeSseEvent(update: SessionStreamEvent): string {
  const payload = sessionStreamEventSchema.parse(update);

  return `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function setCorsHeaders(
  response: ServerResponse,
  request: IncomingMessage,
): void {
  for (const [key, value] of Object.entries(getCorsHeaders(request))) {
    response.setHeader(key, value);
  }
}

function getCorsHeaders(request: IncomingMessage): Record<string, string> {
  return {
    ...baseCorsHeaders,
    'access-control-allow-origin': getAllowedCorsOrigin(request),
  };
}

function getAllowedCorsOrigin(request: IncomingMessage): string {
  const requestOrigin = request.headers.origin;

  if (requestOrigin && isAllowedCorsOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return getConfiguredWebOrigins()[0] ?? defaultWebOrigin;
}

function isAllowedCorsOrigin(origin: string): boolean {
  if (getConfiguredWebOrigins().includes(origin)) {
    return true;
  }

  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);

    return (
      (parsedOrigin.protocol === 'http:' ||
        parsedOrigin.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname)
    );
  } catch {
    return false;
  }
}

function getConfiguredWebOrigins(): string[] {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL ?? defaultWebOrigin;

  return configuredOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function getBaseUrl(request: IncomingMessage): string {
  return `http://${request.headers.host ?? '127.0.0.1:2567'}`;
}
