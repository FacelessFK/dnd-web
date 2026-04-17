import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import {
  clientCommandSchema,
  sessionCommandErrorSchema,
  sessionCommandSuccessSchema,
  sessionIdSchema,
  participantIdSchema,
  type SessionCommandError,
  type SessionCommandSuccess,
  SessionStateUpdate,
} from '@dnd/protocol';

import {
  InMemorySessionStore,
  SessionStoreError,
  createConnectionId,
} from './session-store.js';

const corsHeaders = {
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-origin': '*',
} as const;

export function createSessionServer(store = new InMemorySessionStore()): {
  server: Server;
  store: InMemorySessionStore;
} {
  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, store);
    } catch (error) {
      handleUnexpectedError(response, error);
    }
  });

  return { server, store };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: InMemorySessionStore,
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
      phase: 'phase-1',
      status: 'session-runtime-slice-ready',
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/session/command') {
    await handleCommandRequest(request, response, store);
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
      store,
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

async function handleCommandRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: InMemorySessionStore,
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
        result = store.createSession(command);
        break;
      case 'join_session':
        result = store.joinSession(command);
        break;
      case 'reconnect_session':
        result = store.reconnectSession(command);
        break;
      default:
        throw new Error('Unsupported command type.');
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
    handleStoreError(response, error);
  }
}

function handleStreamRequest(
  response: ServerResponse,
  request: IncomingMessage,
  url: URL,
  rawSessionId: string,
  store: InMemorySessionStore,
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
    store.getSessionSnapshotForParticipant(
      sessionIdResult.data,
      participantIdResult.data,
    );
  } catch (error) {
    handleStoreError(response, error);
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
    send: (update: Parameters<typeof serializeSseEvent>[0]) => {
      const eventPayload = serializeSseEvent(update);

      if (!streamStarted) {
        pendingEvents.push(eventPayload);
        return;
      }

      response.write(eventPayload);
    },
  };

  try {
    store.connectParticipant(
      sessionIdResult.data,
      participantIdResult.data,
      subscriber,
    );
  } catch (error) {
    handleStoreError(response, error);
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
    store.disconnectParticipant(
      sessionIdResult.data,
      participantIdResult.data,
      connectionId,
    );
  };

  request.on('close', closeConnection);
  response.on('close', closeConnection);
}

function handleStoreError(response: ServerResponse, error: unknown): void {
  if (response.headersSent || response.writableEnded) {
    response.end();
    return;
  }

  if (error instanceof SessionStoreError) {
    const payload = {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    } satisfies SessionCommandError;

    sendJson(
      response,
      errorCodeToStatus(error.code),
      payload,
      sessionCommandErrorSchema,
    );
    return;
  }

  handleUnexpectedError(response, error);
}

function handleUnexpectedError(response: ServerResponse, error: unknown): void {
  if (response.headersSent || response.writableEnded) {
    response.end();
    return;
  }

  console.error('[server] unexpected error', error);
  sendJson(response, 500, {
    ok: false,
    error: {
      code: 'internal_server_error',
      message: 'Unexpected server error.',
    },
  } satisfies SessionCommandError);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  schema?:
    | typeof sessionCommandSuccessSchema
    | typeof sessionCommandErrorSchema,
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

function errorCodeToStatus(code: SessionCommandError['error']['code']): number {
  switch (code) {
    case 'duplicate_join':
      return 409;
    case 'internal_server_error':
      return 500;
    case 'invalid_role_assumption':
      return 403;
    case 'invalid_command':
    case 'invalid_session_id':
      return 400;
    case 'participant_not_found':
    case 'session_not_found':
      return 404;
  }
}

function serializeSseEvent(update: { type: SessionStateUpdate }): string {
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
