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
  outboxStatusResponseSchema,
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
  type ClientCommand,
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

import {
  AuthRateLimiter,
  authThrottleMessage,
  PasswordHashConcurrencyGate,
  type AuthThrottleDecision,
} from './auth-rate-limiter.js';
import { AuthService, AuthStoreError } from './auth-store.js';
import {
  SeatOwnershipError,
  SessionSeatOwnership,
} from './session-seat-ownership.js';
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
import {
  PARTICIPANT_TOKEN_HEADER,
  PARTICIPANT_TOKEN_QUERY_PARAM,
  ParticipantCredentialStore,
} from './participant-credential-store.js';
import { RulesProfileStoreError } from './rules-profile-store.js';
import { SceneStoreError } from './scene-store.js';
import {
  SessionStoreError,
  type RuntimeSessionStore,
} from './session-store.js';

const defaultWebOrigin = 'http://localhost:3000';

const baseCorsHeaders = {
  'access-control-allow-headers': `content-type,${PARTICIPANT_TOKEN_HEADER}`,
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

/**
 * Brute-force gates for `/api/auth/*`. Both are per-process and in-memory —
 * see `auth-rate-limiter.ts` for exactly what that does and does not buy.
 */
export type AuthThrottle = {
  gate: PasswordHashConcurrencyGate;
  limiter: AuthRateLimiter;
};

export function createAuthThrottle(): AuthThrottle {
  return {
    gate: new PasswordHashConcurrencyGate(),
    limiter: new AuthRateLimiter(),
  };
}

/**
 * Shared by every request that does not supply its own throttle.
 *
 * This is deliberately a module singleton rather than a per-call default:
 * counters only mean something if consecutive requests hit the same instance.
 * Tests pass an explicit throttle to stay isolated from each other.
 */
const defaultAuthThrottle = createAuthThrottle();

/**
 * Shared by any `handleRequest` call that does not supply its own store, for the
 * same reason as `defaultAuthThrottle`: a credential issued on one request has
 * to be verifiable on the next.
 */
const defaultParticipantCredentials = new ParticipantCredentialStore();
const defaultSeatOwnership = new SessionSeatOwnership();

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
  participantCredentials: ParticipantCredentialStore;
  seatOwnership: SessionSeatOwnership;
  sceneCommandTransaction?: DbBackedSceneCommandTransactionBoundary;
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary;
  server: Server;
  startup: () => Promise<void>;
  runtime: GameRuntime;
  store: GameRuntime['sessions'];
} {
  // One throttle and one credential store per server instance, shared by every
  // request it serves. Both only mean anything if consecutive requests hit the
  // same instance.
  const authThrottle = createAuthThrottle();
  const participantCredentials = new ParticipantCredentialStore();
  // Seat bindings outlive credentials on purpose: a restart re-issues the
  // token without costing the player their seat.
  const seatOwnership = new SessionSeatOwnership();
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
        authThrottle,
        participantCredentials,
        seatOwnership,
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
    participantCredentials,
    sceneCommandTransaction,
    seatOwnership,
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
  authThrottle: AuthThrottle = defaultAuthThrottle,
  participantCredentials: ParticipantCredentialStore = defaultParticipantCredentials,
  seatOwnership: SessionSeatOwnership = defaultSeatOwnership,
): Promise<void> {
  setCorsHeaders(response, request);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', getBaseUrl(request));

  // Liveness only. It deliberately reports nothing about configuration,
  // persistence mode, or feature state: this endpoint is unauthenticated, and
  // the previous payload advertised the server's internal build phase to anyone
  // who asked.
  if (request.method === 'GET' && url.pathname === '/') {
    sendJson(response, 200, {
      name: 'dnd-web-server',
      status: 'ok',
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    await handleAuthMeRequest(request, response, auth);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/outbox/status') {
    await handleOutboxStatusRequest(
      request,
      response,
      auth,
      commandEventOutboxDispatcher,
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    await handleAuthRegisterRequest(request, response, auth, authThrottle);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    await handleAuthLoginRequest(request, response, auth, authThrottle);
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
      participantCredentials,
      sessionCommandTransaction,
      auth,
      seatOwnership,
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/characters/command') {
    await handleCharacterCommandRequest(
      request,
      response,
      runtime,
      idempotency,
      participantCredentials,
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
      participantCredentials,
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
      participantCredentials,
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
      participantCredentials,
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
      participantCredentials,
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
      participantCredentials,
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

/**
 * Operator visibility into the unpublished outbox backlog.
 *
 * Authenticated because it is an operational endpoint, and because it used to be
 * an unauthenticated way to make the server run a query over an unbounded table.
 * It now reports database-side aggregates and never materializes rows.
 *
 * Any authenticated user passes. That is deliberately coarse: this repository
 * has no operator role yet, and inventing one here would be a data model change
 * smuggled into a security fix. It is a real narrowing from "anyone on the
 * network" and the endpoint exposes counts, never row contents.
 */
async function handleOutboxStatusRequest(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService | undefined,
  commandEventOutboxDispatcher?: CommandEventOutboxDispatcherLike,
): Promise<void> {
  if (auth) {
    try {
      await requireAuthenticatedUser(request, auth);
    } catch (error) {
      handleRuntimeError(response, error, outboxStatusResponseSchema);
      return;
    }
  }

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
  auth: AuthService | undefined,
  authThrottle: AuthThrottle,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch (error) {
    sendBodyReadError(response, error, authResponseSchema);
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

  const ip = readClientIp(request);
  const registerDecision = authThrottle.limiter.checkRegister({ ip });

  if (!registerDecision.allowed) {
    sendThrottled(response, registerDecision);
    return;
  }

  // Registration counts every attempt up front, not just failures: a
  // successful signup is precisely what account-spam wants to repeat, and it
  // runs the same expensive scrypt hash as a login.
  authThrottle.limiter.recordRegisterAttempt({ ip });

  if (!authThrottle.gate.tryAcquire()) {
    sendThrottled(response, {
      allowed: false,
      retryAfterSeconds: 1,
      scope: 'concurrency',
    });
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
  } finally {
    authThrottle.gate.release();
  }
}

async function handleAuthLoginRequest(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService | undefined,
  authThrottle: AuthThrottle,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch (error) {
    sendBodyReadError(response, error, authResponseSchema);
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

  const ip = readClientIp(request);
  const decision = authThrottle.limiter.checkLogin({
    email: requestResult.data.email,
    ip,
  });

  // Denied attempts are rejected here and never recorded as failures, so a
  // client that keeps hammering a blocked key cannot extend its own block.
  if (!decision.allowed) {
    sendThrottled(response, decision);
    return;
  }

  if (!authThrottle.gate.tryAcquire()) {
    sendThrottled(response, {
      allowed: false,
      retryAfterSeconds: 1,
      scope: 'concurrency',
    });
    return;
  }

  try {
    const service = requireAuthService(auth);
    const session = await service.login(requestResult.data);

    authThrottle.limiter.recordLoginSuccess({
      email: requestResult.data.email,
      ip,
    });
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
    // Count only genuine credential rejections. A misconfigured server or a
    // database outage surfaces as a different code, and must not accumulate
    // toward a lockout that would outlive the outage.
    if (
      error instanceof AuthStoreError &&
      error.code === 'invalid_credentials'
    ) {
      authThrottle.limiter.recordLoginFailure({
        email: requestResult.data.email,
        ip,
      });
    }

    handleRuntimeError(response, error, authResponseSchema);
  } finally {
    authThrottle.gate.release();
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
  participantCredentials: ParticipantCredentialStore,
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary,
  auth?: AuthService,
  seatOwnership: SessionSeatOwnership = defaultSeatOwnership,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch (error) {
    sendBodyReadError(response, error, sessionCommandErrorSchema);
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

  const command = commandResult.data;

  // `create_session` and `join_session` mint a credential, so they cannot
  // require one. `reconnect_session` must: without this check, anyone holding a
  // session code plus a participant ID from a published snapshot could reconnect
  // as the GM.
  if (
    command.type === 'reconnect_session' &&
    !requireParticipantCredential(
      request,
      response,
      participantCredentials,
      command,
      sessionCommandErrorSchema,
    )
  ) {
    return;
  }

  // Seat ownership. Participant IDs are public - the session snapshot
  // broadcasts every one of them - so the session code plus a participant ID
  // must not be enough to sit down in someone else's chair. The binding is
  // checked here, before any seat is handed out or any credential is minted.
  //
  // When no auth service is configured the server has no accounts to bind to
  // and this is a no-op, which keeps anonymous local play working. An
  // unauthenticated caller can still take an *unbound* seat; what it can never
  // do is take a seat that some account already owns.
  let seatUserId: string | undefined;

  if (auth) {
    try {
      seatUserId = (await auth.getUserByToken(readAuthCookie(request)))?.id;
    } catch {
      seatUserId = undefined;
    }
  }

  if (command.type !== 'create_session') {
    try {
      seatOwnership.assertAvailableTo(
        command.payload.sessionId,
        command.actor.participantId,
        seatUserId,
      );
    } catch (error) {
      if (error instanceof SeatOwnershipError) {
        sendJson(response, 403, {
          ok: false,
          error: {
            code: 'seat_owned_by_another_account',
            message: 'That seat belongs to another account.',
          },
        } satisfies SessionCommandError);
        return;
      }

      throw error;
    }
  }

  try {
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

            if (seatUserId) {
              seatOwnership.claim({
                participantId: result.participantId,
                sessionId: result.sessionId,
                userId: seatUserId,
              });
            }

            return {
              sessionId: result.sessionId,
              participantId: result.participantId,
              participantToken: participantCredentials.issue(
                result.sessionId,
                result.participantId,
              ),
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
        result = await claimPlayerSeat(runtime, command);
        break;
      case 'reconnect_session':
        result = await runtime.reconnectSession(command);
        break;
      default:
        throw new Error('Unsupported session command type.');
    }

    // Bind the seat to the account that just took it. Idempotent for the
    // owner, so a reconnect after a restart re-affirms the same seat instead
    // of failing.
    if (seatUserId) {
      seatOwnership.claim({
        participantId: result.participantId,
        sessionId: result.sessionId,
        userId: seatUserId,
      });
    }

    // Reconnect echoes the credential the caller just proved it holds rather
    // than rotating it. Rotating would invalidate the token embedded in this
    // command's cached idempotent response, so a legitimate retry would fail.
    const participantToken =
      command.type === 'reconnect_session'
        ? (readParticipantToken(request) ?? '')
        : participantCredentials.issue(result.sessionId, result.participantId);

    const success: SessionCommandSuccess = {
      ok: true,
      data: {
        sessionId: result.sessionId,
        participantId: result.participantId,
        participantToken,
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
  participantCredentials: ParticipantCredentialStore,
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary,
  characterLibrary: CharacterLibraryService = new CharacterLibraryService(),
  auth?: AuthService,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch (error) {
    sendBodyReadError(response, error, characterCommandErrorSchema);
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

  const command = commandResult.data;

  if (
    !requireParticipantCredential(
      request,
      response,
      participantCredentials,
      command,
      characterCommandErrorSchema,
    )
  ) {
    return;
  }

  try {
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
  } catch (error) {
    sendBodyReadError(response, error, characterLibraryCommandErrorSchema);
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
  participantCredentials: ParticipantCredentialStore,
  sessionCommandTransaction?: DbBackedSessionCommandTransactionBoundary,
  sceneCommandTransaction?: DbBackedSceneCommandTransactionBoundary,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch (error) {
    sendBodyReadError(response, error, sceneCommandErrorSchema);
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

  const command = commandResult.data;

  if (
    !requireParticipantCredential(
      request,
      response,
      participantCredentials,
      command,
      sceneCommandErrorSchema,
    )
  ) {
    return;
  }

  try {
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
  participantCredentials: ParticipantCredentialStore,
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch (error) {
    sendBodyReadError(response, error, movementCommandErrorSchema);
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

  const command = commandResult.data;

  if (
    !requireParticipantCredential(
      request,
      response,
      participantCredentials,
      command,
      movementCommandErrorSchema,
    )
  ) {
    return;
  }

  try {
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
  participantCredentials: ParticipantCredentialStore,
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary,
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch (error) {
    sendBodyReadError(response, error, encounterCommandErrorSchema);
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

  const command = commandResult.data;

  if (
    !requireParticipantCredential(
      request,
      response,
      participantCredentials,
      command,
      encounterCommandErrorSchema,
    )
  ) {
    return;
  }

  try {
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
  participantCredentials: ParticipantCredentialStore,
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary,
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
  sceneCommandTransaction?: DbBackedSceneCommandTransactionBoundary,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJson(request);
  } catch (error) {
    sendBodyReadError(response, error, dmCommandErrorSchema);
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

  const command = commandResult.data;

  if (
    !requireParticipantCredential(
      request,
      response,
      participantCredentials,
      command,
      dmCommandErrorSchema,
    )
  ) {
    return;
  }

  try {
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
  participantCredentials: ParticipantCredentialStore,
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

  // `EventSource` cannot send request headers, so the stream takes the same
  // credential as a query parameter. Checked before the session lookup so that a
  // caller without a token learns nothing about whether the session exists.
  if (
    !participantCredentials.verify(
      sessionIdResult.data,
      participantIdResult.data,
      url.searchParams.get(PARTICIPANT_TOKEN_QUERY_PARAM),
    )
  ) {
    sendJson(response, 401, {
      ok: false,
      error: {
        code: 'unauthenticated',
        message:
          'A valid participant token is required to subscribe to this session stream.',
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

/**
 * Raised when a request body is refused before it is fully read, so the caller
 * can answer 413 or 408 instead of the generic 400 that a JSON parse error gets.
 */
class RequestBodyError extends Error {
  constructor(
    readonly statusCode: 408 | 413,
    message: string,
  ) {
    super(message);
    this.name = 'RequestBodyError';
  }
}

const DEFAULT_MAX_REQUEST_BODY_BYTES = 1_048_576;
const DEFAULT_REQUEST_BODY_TIMEOUT_MS = 15_000;

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads and parses a JSON request body under a size ceiling and a wall-clock
 * deadline.
 *
 * Both bounds are load-bearing. Without the ceiling, a single request could
 * stream unbounded data into an in-memory array until the process died; the
 * portrait upload path means bodies are legitimately large, so "it is only
 * commands" was never true. Without the deadline, a client that opens a request
 * and dribbles one byte at a time holds a connection and a buffer open
 * indefinitely - the classic slow-loris shape - and Node applies no default
 * timeout to a request body.
 *
 * `content-length` is checked first as a cheap rejection, but it is
 * client-supplied, so the running total is enforced regardless.
 */
async function readJson(request: IncomingMessage): Promise<unknown> {
  const maxBytes = readPositiveIntegerEnv(
    'SERVER_MAX_REQUEST_BODY_BYTES',
    DEFAULT_MAX_REQUEST_BODY_BYTES,
  );
  const timeoutMs = readPositiveIntegerEnv(
    'SERVER_REQUEST_BODY_TIMEOUT_MS',
    DEFAULT_REQUEST_BODY_TIMEOUT_MS,
  );

  const declaredLength = Number(request.headers['content-length']);

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError(
      413,
      `Request body exceeds the ${maxBytes} byte limit.`,
    );
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  let timedOut = false;

  const deadline = setTimeout(() => {
    timedOut = true;
    request.destroy();
  }, timeoutMs);

  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      receivedBytes += buffer.byteLength;

      if (receivedBytes > maxBytes) {
        // Stop reading immediately rather than draining the rest: continuing to
        // consume a body already known to be over the limit is the resource
        // exhaustion this guard exists to prevent.
        request.destroy();
        throw new RequestBodyError(
          413,
          `Request body exceeds the ${maxBytes} byte limit.`,
        );
      }

      chunks.push(buffer);
    }
  } catch (error) {
    if (timedOut) {
      throw new RequestBodyError(
        408,
        `Request body was not received within ${timeoutMs}ms.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(deadline);
  }

  const body = Buffer.concat(chunks).toString('utf8');

  if (!body) {
    return {};
  }

  return JSON.parse(body) as unknown;
}

/**
 * Answers a refused body with its own status code, and anything else - a JSON
 * syntax error - with the 400 the callers already expected.
 */
function sendBodyReadError(
  response: ServerResponse,
  error: unknown,
  errorSchema: ErrorResponseSchema,
): void {
  if (error instanceof RequestBodyError) {
    sendJson(
      response,
      error.statusCode,
      {
        ok: false,
        error: {
          code: 'invalid_command',
          message: error.message,
        },
      },
      errorSchema,
    );
    return;
  }

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
    errorSchema,
  );
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
    case 'seat_owned_by_another_account':
      return 403;
    case 'unauthenticated':
      return 401;
    case 'too_many_requests':
      return 429;
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

function sendThrottled(
  response: ServerResponse,
  decision: Extract<AuthThrottleDecision, { allowed: false }>,
): void {
  response.setHeader('retry-after', String(decision.retryAfterSeconds));
  sendJson(
    response,
    429,
    {
      ok: false,
      error: {
        // The message stays uniform across every scope. Saying which gate
        // tripped would tell an attacker whether the address they guessed is
        // interesting, which is the enumeration leak this work is closing.
        code: 'too_many_requests',
        message: authThrottleMessage,
      },
    },
    authResponseSchema,
  );
}

/**
 * Best-effort source address for throttling.
 *
 * `x-forwarded-for` is client-supplied and trivially spoofed, so honouring it
 * unconditionally would let an attacker mint a fresh throttle key per request
 * and bypass every per-IP limit here. It is therefore only trusted when the
 * operator explicitly asserts a proxy is in front via
 * `SERVER_TRUST_PROXY_HEADER=true`. Default deployment reads the socket.
 */
function readClientIp(request: IncomingMessage): string {
  if (process.env.SERVER_TRUST_PROXY_HEADER === 'true') {
    const forwarded = request.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      ?.split(',')[0]
      ?.trim();

    if (first) {
      return first;
    }
  }

  return request.socket?.remoteAddress ?? 'unknown';
}

function readParticipantToken(request: IncomingMessage): string | null {
  const header = request.headers[PARTICIPANT_TOKEN_HEADER];
  const value = Array.isArray(header) ? header[0] : header;

  return value?.trim() ? value.trim() : null;
}

/**
 * Gate for every session-scoped command.
 *
 * The runtime's role checks read `command.actor.participantId` and assert a role
 * against the stored participant record. Those checks are only worth anything if
 * the caller actually is that participant, and a participant ID is public - a
 * session snapshot hands every subscriber the GM's. So the caller has to present
 * the credential issued to it at create/join time.
 *
 * Returns `true` when the request may proceed. On failure it has already written
 * the response, so callers must return immediately.
 *
 * The failure is deliberately indistinguishable between "no such session",
 * "no such participant" and "wrong token": distinguishing them would turn this
 * into an oracle for enumerating live sessions and their participants.
 */
function requireParticipantCredential(
  request: IncomingMessage,
  response: ServerResponse,
  participantCredentials: ParticipantCredentialStore,
  command: { actor: { participantId: string }; payload: { sessionId: string } },
  errorSchema: ErrorResponseSchema,
): boolean {
  if (
    participantCredentials.verify(
      command.payload.sessionId,
      command.actor.participantId,
      readParticipantToken(request),
    )
  ) {
    return true;
  }

  sendJson(
    response,
    401,
    {
      ok: false,
      error: {
        code: 'unauthenticated',
        message:
          'A valid participant token is required. Join or reconnect to the session to obtain one.',
      },
    },
    errorSchema,
  );

  return false;
}

/**
 * Joins a session, treating an already-occupied player seat as a re-claim.
 *
 * The session code is the table's shared secret, and a player seat is claimable
 * with it. That matters for two flows that would otherwise be dead ends:
 *
 * - A player closes their tab. Their credential lived in `sessionStorage` and is
 *   gone, but the server still holds one for that participant, so
 *   `reconnect_session` refuses them - and a plain re-join used to fail with
 *   `duplicate_join`. They could never get back to the table.
 * - The DM prepares seats for sample players during demo setup, which issues
 *   credentials to the DM's browser. A real player then needs to take one of
 *   those seats from their own browser.
 *
 * What this deliberately does **not** allow: claiming the DM seat.
 * `joinSession` asserts the actor's role is `player` before anything else, so a
 * caller can never join as the DM, and `reconnect_session` still demands the
 * credential issued at `create_session`. Every command and stream endpoint
 * demands a credential too.
 *
 * So the residual exposure is: someone holding the session code can take over a
 * *player* seat, seeing that player's character and view. They cannot gain GM
 * omniscience, which is what a broadcast `dmParticipantId` used to hand them.
 */
async function claimPlayerSeat(
  runtime: GameRuntime,
  command: Extract<ClientCommand, { type: 'join_session' }>,
) {
  try {
    return await runtime.joinSession(command);
  } catch (error) {
    if (
      !(error instanceof SessionStoreError) ||
      error.code !== 'duplicate_join'
    ) {
      throw error;
    }

    // Re-claiming the seat: the snapshot read is the same one reconnect
    // performs, and the caller is issued a fresh credential by the caller of
    // this function. The previous holder's token stops working.
    return runtime.reconnectSession({
      actor: {
        displayName: command.actor.displayName,
        participantId: command.actor.participantId,
        role: 'player',
      },
      commandId: command.commandId,
      payload: command.payload,
      type: 'reconnect_session',
    });
  }
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
