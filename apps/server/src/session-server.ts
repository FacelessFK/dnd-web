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
import { EncounterRuntimeError } from './encounter-runtime.js';
import { EncounterStoreError } from './encounter-store.js';
import { createConnectionId, InMemoryGameRuntime } from './game-runtime.js';
import { MovementRuntimeError } from './movement-runtime.js';
import { RulesProfileStoreError } from './rules-profile-store.js';
import { SceneStoreError } from './scene-store.js';
import { SessionStoreError } from './session-store.js';

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

export function createSessionServer(
  runtime = new InMemoryGameRuntime(),
  idempotency: CommandIdempotencyStore = new InMemoryCommandIdempotencyStore(),
): {
  idempotency: CommandIdempotencyStore;
  server: Server;
  runtime: InMemoryGameRuntime;
  store: InMemoryGameRuntime['sessions'];
} {
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, runtime, idempotency);
    } catch (error) {
      handleUnexpectedError(response, error, sessionCommandErrorSchema);
    }
  });

  return {
    idempotency,
    server,
    runtime,
    store: runtime.sessions,
  };
}

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: InMemoryGameRuntime,
  idempotency: CommandIdempotencyStore,
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
      phase: 'phase-6',
      status: 'attack-foundation-ready',
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
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/scenes/command') {
    await handleSceneCommandRequest(request, response, runtime, idempotency);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/movement/command') {
    await handleMovementCommandRequest(request, response, runtime, idempotency);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/encounters/command') {
    await handleEncounterCommandRequest(
      request,
      response,
      runtime,
      idempotency,
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
  runtime: InMemoryGameRuntime,
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
    const cachedSuccess = idempotency.getCachedSuccess<SessionCommandSuccess>({
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
        result = runtime.createSession(command);
        break;
      case 'join_session':
        result = runtime.joinSession(command);
        break;
      case 'reconnect_session':
        result = runtime.reconnectSession(command);
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

    idempotency.cacheSuccess({
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
  runtime: InMemoryGameRuntime,
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
    const cachedSuccess = idempotencyCategory
      ? idempotency.getCachedSuccess<
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
            ? runtime.createCharacter(command)
            : runtime.getCharacter(command);
        const success: CharacterCommandSuccess = {
          ok: true,
          data,
        };

        if (idempotencyCategory) {
          idempotency.cacheSuccess({
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
            ? runtime.updateCharacter(command)
            : runtime.finalizeCharacter(command);
        const success: CharacterCommandSuccess = {
          ok: true,
          data,
        };

        idempotency.cacheSuccess({
          category: 'character',
          command,
          response: success,
        });
        sendCharacterSuccess(response, command.type, success);
        return;
      }
      case 'assign_character_to_participant': {
        const success: CharacterAssignmentSuccess = {
          ok: true,
          data: runtime.assignCharacterToParticipant(command),
        };

        idempotency.cacheSuccess({
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
  runtime: InMemoryGameRuntime,
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
      ? idempotency.getCachedSuccess<
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
            ? runtime.createScene(command)
            : command.type === 'get_scene'
              ? runtime.getScene(command)
              : runtime.placeEntityInScene(command);
        const success: SceneCommandSuccess = {
          ok: true,
          data: {
            scene,
          },
        };

        if (idempotencyCategory) {
          idempotency.cacheSuccess({
            category: idempotencyCategory,
            command,
            response: success,
          });
        }
        sendSceneSuccess(response, command.type, success);
        return;
      }
      case 'activate_scene_for_session': {
        const success: SceneActivationSuccess = {
          ok: true,
          data: runtime.activateSceneForSession(command),
        };

        idempotency.cacheSuccess({
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
  runtime: InMemoryGameRuntime,
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
      ? idempotency.getCachedSuccess<MovementCommandSuccess>({
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
        data = runtime.placeCharacterInActiveScene(command);
        break;
      case 'move_character_in_active_scene':
        data = runtime.moveCharacterInActiveScene(command);
        break;
      case 'get_active_scene_state':
        data = runtime.getActiveSceneState(command);
        break;
      default:
        throw new Error('Unsupported movement command type.');
    }
    const success = {
      ok: true,
      data,
    };

    if (idempotencyCategory) {
      idempotency.cacheSuccess({
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
  runtime: InMemoryGameRuntime,
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
    const cachedSuccess = idempotencyCategory
      ? idempotency.getCachedSuccess<EncounterCommandSuccess>({
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
        encounter = runtime.startEncounter(command);
        break;
      case 'get_encounter_state':
        encounter = runtime.getEncounterState(command);
        break;
      case 'advance_turn':
        encounter = runtime.advanceTurn(command);
        break;
      case 'use_action':
        encounter = runtime.useAction(command);
        break;
      case 'use_bonus_action':
        encounter = runtime.useBonusAction(command);
        break;
      case 'use_reaction':
        encounter = runtime.useReaction(command);
        break;
      case 'record_movement_usage':
        encounter = runtime.recordMovementUsage(command);
        break;
      case 'attack':
        encounter = runtime.attack(command);
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
      idempotency.cacheSuccess({
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

function handleStreamRequest(
  response: ServerResponse,
  request: IncomingMessage,
  url: URL,
  rawSessionId: string,
  runtime: InMemoryGameRuntime,
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
