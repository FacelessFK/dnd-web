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
  participantIdSchema,
  sessionCommandErrorSchema,
  sessionCommandSuccessSchema,
  sessionIdSchema,
  type CharacterAssignmentSuccess,
  type CharacterCommandError,
  type CharacterCommandSuccess,
  type RuntimeErrorCode,
  type SessionCommandError,
  type SessionCommandSuccess,
  type SessionStateUpdate,
} from '@dnd/protocol';

import { CharacterStoreError } from './character-store.js';
import { createConnectionId, InMemoryGameRuntime } from './game-runtime.js';
import { RulesProfileStoreError } from './rules-profile-store.js';
import { SessionStoreError } from './session-store.js';

const corsHeaders = {
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-origin': '*',
} as const;

type RuntimeStoreError =
  | CharacterStoreError
  | RulesProfileStoreError
  | SessionStoreError;

export function createSessionServer(runtime = new InMemoryGameRuntime()): {
  server: Server;
  runtime: InMemoryGameRuntime;
  store: InMemoryGameRuntime['sessions'];
} {
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, runtime);
    } catch (error) {
      handleUnexpectedError(response, error, sessionCommandErrorSchema);
    }
  });

  return {
    server,
    runtime,
    store: runtime.sessions,
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: InMemoryGameRuntime,
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
      phase: 'phase-2',
      status: 'rules-and-character-foundation-ready',
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/session/command') {
    await handleSessionCommandRequest(request, response, runtime);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/characters/command') {
    await handleCharacterCommandRequest(request, response, runtime);
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

    sendJson(response, 200, success, sessionCommandSuccessSchema);
  } catch (error) {
    handleRuntimeError(response, error, sessionCommandErrorSchema);
  }
}

async function handleCharacterCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runtime: InMemoryGameRuntime,
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

        sendJson(response, 200, success, characterCommandSuccessSchema);
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

        sendJson(response, 200, success, characterCommandSuccessSchema);
        return;
      }
      case 'assign_character_to_participant': {
        const success: CharacterAssignmentSuccess = {
          ok: true,
          data: runtime.assignCharacterToParticipant(command),
        };

        sendJson(response, 200, success, characterAssignmentSuccessSchema);
        return;
      }
      default:
        throw new Error('Unsupported character command type.');
    }
  } catch (error) {
    handleRuntimeError(response, error, characterCommandErrorSchema);
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
    send: (update: SessionStateUpdate) => {
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
    case 'session_not_found':
      return 404;
    case 'duplicate_join':
    case 'invalid_participant_session_association':
    case 'invalid_character_state':
      return 409;
    case 'internal_server_error':
      return 500;
    case 'invalid_command':
    case 'invalid_character_id':
    case 'invalid_session_id':
      return 400;
    case 'invalid_role_assumption':
      return 403;
  }
}

function isRuntimeStoreError(error: unknown): error is RuntimeStoreError {
  return (
    error instanceof CharacterStoreError ||
    error instanceof RulesProfileStoreError ||
    error instanceof SessionStoreError
  );
}

function serializeSseEvent(update: SessionStateUpdate): string {
  return `event: ${update.type}\ndata: ${JSON.stringify(update)}\n\n`;
}

function setCorsHeaders(response: ServerResponse): void {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.setHeader(key, value);
  }
}

function getBaseUrl(request: IncomingMessage): string {
  return `http://${request.headers.host ?? '127.0.0.1:2567'}`;
}
