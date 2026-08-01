import {
  characterCommandResponseSchema,
  characterLibraryCommandResponseSchema,
  dmCommandResponseSchema,
  playerIntentCommandResponseSchema,
  resolutionCommandResponseSchema,
  encounterCommandResponseSchema,
  movementCommandResponseSchema,
  outboxStatusSuccessSchema,
  sceneCommandResponseSchema,
  sessionCommandResponseSchema,
  type CharacterCommand,
  type CharacterCommandResponse,
  type CharacterLibraryCommand,
  type CharacterLibraryCommandResponse,
  type ClientCommand,
  type DmCommand,
  type DmCommandResponse,
  type PlayerIntentCommand,
  type PlayerIntentCommandResponse,
  type ResolutionCommand,
  type ResolutionCommandResponse,
  type EncounterCommand,
  type EncounterCommandResponse,
  type MovementCommand,
  type MovementCommandResponse,
  type OutboxStatusSuccess,
  type RuntimeErrorCode,
  type SceneCommand,
  type SceneCommandResponse,
  type SessionCommandResponse,
} from '@dnd/protocol';

const DEFAULT_SERVER_URL = 'http://localhost:2567';

/**
 * Ceiling on how long a command may hang before the UI gives up.
 *
 * Without it a stalled or unreachable server leaves the cockpit waiting forever
 * with a spinner and no way back: `fetch` has no default timeout, and the runtime
 * has no retry policy to fall back on.
 */
const REQUEST_TIMEOUT_MS = 15_000;

const PARTICIPANT_TOKEN_HEADER = 'x-dnd-participant-token';

type SchemaResult<T> =
  | {
      data: T;
      success: true;
    }
  | {
      error: {
        issues: Array<{
          message: string;
        }>;
      };
      success: false;
    };

type ResponseSchema<T> = {
  safeParse(input: unknown): SchemaResult<T>;
};

type CommandResponse = {
  ok: boolean;
};

type CommandErrorResponse = {
  error: {
    code: RuntimeErrorCode;
    message: string;
  };
  ok: false;
};

export type RuntimeApiFailure = {
  code?: RuntimeErrorCode;
  message: string;
  status?: number;
};

export type RuntimeApiResult<TSuccess> =
  | {
      response: TSuccess;
      ok: true;
    }
  | {
      error: RuntimeApiFailure;
      ok: false;
    };

export type CharacterCommandSuccessResponse = Extract<
  CharacterCommandResponse,
  { ok: true }
>;
export type CharacterLibraryCommandSuccessResponse = Extract<
  CharacterLibraryCommandResponse,
  { ok: true }
>;
export type DmCommandSuccessResponse = Extract<DmCommandResponse, { ok: true }>;
export type ResolutionCommandSuccessResponse = Extract<
  ResolutionCommandResponse,
  { ok: true }
>;
export type PlayerIntentCommandSuccessResponse = Extract<
  PlayerIntentCommandResponse,
  { ok: true }
>;
export type EncounterCommandSuccessResponse = Extract<
  EncounterCommandResponse,
  { ok: true }
>;
export type MovementCommandSuccessResponse = Extract<
  MovementCommandResponse,
  { ok: true }
>;
export type SceneCommandSuccessResponse = Extract<
  SceneCommandResponse,
  { ok: true }
>;
export type SessionCommandSuccessResponse = Extract<
  SessionCommandResponse,
  { ok: true }
>;
export type OutboxStatusSuccessResponse = OutboxStatusSuccess;

export const runtimeServerUrl =
  process.env.NEXT_PUBLIC_SERVER_URL ?? DEFAULT_SERVER_URL;

export type ParticipantCredential = {
  participantId: string;
  sessionId: string;
  token: string;
};

export const participantCredentialStorageKey = 'dnd-participant-credential';

/**
 * Credentials this tab holds, keyed by session and participant.
 *
 * A map rather than one ambient credential because a single tab legitimately
 * acts as several participants: the runtime cockpit can create a session as the
 * DM and then join players into it, and the demo scenario does exactly that in
 * one click. Keeping only the most recent credential meant joining a player
 * silently revoked the tab's ability to act as the DM.
 *
 * This is not a hole. The tab can only act as participants the server issued it
 * a credential for - the ones it actually created or joined. It still cannot
 * act as a participant that joined from someone else's browser, which is the
 * property that matters.
 *
 * Mirrored into `localStorage`, which is the least bad of three options:
 *
 * - In memory only would be tidiest, but a page refresh wipes it and
 *   `reconnect_session` needs the credential to prove who is reconnecting. That
 *   breaks "refresh mid-fight and carry on", which is a product requirement.
 * - `sessionStorage` survives a refresh and dies with the tab, which is a better
 *   lifetime - but it is per-tab, and one participant legitimately spans pages:
 *   a DM paints in `/maps` and publishes to the table they created in
 *   `/runtime`. Under `sessionStorage` that publish has no credential.
 * - An HttpOnly cookie would be strictly better, but the web app and the server
 *   are different origins, so it would need `SameSite=None; Secure` and would
 *   stop working over plain HTTP - which is how this runs locally and in the
 *   demo stack. Same-origin proxying is the real fix and belongs with the
 *   production work.
 *
 * The accepted cost: any script on the origin can read these, and they outlive
 * the tab. Such a script can already call `sendDmCommand` directly from this
 * module, so the incremental exposure is the lifetime, not the readability.
 */
let participantCredentials: Map<string, ParticipantCredential> | null = null;

function credentialKey(sessionId: string, participantId: string): string {
  return `${sessionId} ${participantId}`;
}

function loadCredentials(): Map<string, ParticipantCredential> {
  if (participantCredentials) {
    return participantCredentials;
  }

  participantCredentials = new Map();

  if (typeof localStorage === 'undefined') {
    return participantCredentials;
  }

  try {
    const raw = localStorage.getItem(participantCredentialStorageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];

    if (Array.isArray(parsed)) {
      for (const entry of parsed as Array<Partial<ParticipantCredential>>) {
        if (entry?.participantId && entry.sessionId && entry.token) {
          participantCredentials.set(
            credentialKey(entry.sessionId, entry.participantId),
            {
              participantId: entry.participantId,
              sessionId: entry.sessionId,
              token: entry.token,
            },
          );
        }
      }
    }
  } catch {
    // Corrupt or blocked storage is the same as holding no credential: the
    // caller is told to rejoin rather than crashing.
  }

  return participantCredentials;
}

function persistCredentials(): void {
  if (typeof localStorage === 'undefined' || !participantCredentials) {
    return;
  }

  try {
    localStorage.setItem(
      participantCredentialStorageKey,
      JSON.stringify([...participantCredentials.values()]),
    );
  } catch {
    // Storage can be unavailable or full. The in-memory copy still works for
    // this page load; only surviving a refresh is lost.
  }
}

export function setParticipantCredential(
  credential: ParticipantCredential,
): void {
  const credentials = loadCredentials();

  // Drop credentials for other sessions. A browser plays one table at a time,
  // and because these persist past the tab, keeping every token this browser was
  // ever issued would accumulate live credentials indefinitely.
  for (const [key, held] of credentials) {
    if (held.sessionId !== credential.sessionId) {
      credentials.delete(key);
    }
  }

  credentials.set(
    credentialKey(credential.sessionId, credential.participantId),
    credential,
  );
  persistCredentials();
}

export function getParticipantCredential(
  sessionId: string,
  participantId: string,
): ParticipantCredential | null {
  return loadCredentials().get(credentialKey(sessionId, participantId)) ?? null;
}

export function clearParticipantCredentials(): void {
  participantCredentials = new Map();

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(participantCredentialStorageKey);
    } catch {
      // Nothing useful to do; the in-memory copy is already gone.
    }
  }
}

/**
 * Resolves the token to send with a command, from the credential issued to that
 * exact session and participant.
 */
function participantTokenForCommand(command: unknown): string | null {
  const scoped = command as {
    actor?: { participantId?: string };
    payload?: { sessionId?: string };
  };
  const participantId = scoped?.actor?.participantId;
  const sessionId = scoped?.payload?.sessionId;

  if (!participantId || !sessionId) {
    return null;
  }

  return getParticipantCredential(sessionId, participantId)?.token ?? null;
}

export function createCommandId(scope: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `web-${scope}-${random}`;
}

/**
 * Builds the SSE subscription URL, including the participant token.
 *
 * The token travels in the query string because `EventSource` cannot set
 * request headers. That is a real trade-off - query strings land in access logs
 * and referrers more readily than headers do - accepted here because the
 * alternative is an unauthenticated stream, which is what this replaced.
 */
export function buildSessionStreamUrl(
  sessionId: string,
  participantId: string,
): string {
  const baseUrl = new URL(runtimeServerUrl);
  baseUrl.pathname = `/api/sessions/${encodeURIComponent(sessionId)}/stream`;
  baseUrl.search = '';
  baseUrl.searchParams.set('participantId', participantId);

  const credential = getParticipantCredential(sessionId, participantId);

  if (credential) {
    baseUrl.searchParams.set('participantToken', credential.token);
  }

  return baseUrl.toString();
}

export async function sendSessionCommand(
  command: ClientCommand,
): Promise<RuntimeApiResult<SessionCommandSuccessResponse>> {
  const result = await postCommand(
    '/api/session/command',
    command,
    sessionCommandResponseSchema,
  );

  // Create, join and reconnect are the only commands that hand back a
  // credential. Capturing it here is what lets every other call site stay
  // unaware that participant tokens exist.
  if (result.ok) {
    setParticipantCredential({
      participantId: result.response.data.participantId,
      sessionId: result.response.data.sessionId,
      token: result.response.data.participantToken,
    });
  }

  return result;
}

export async function sendCharacterCommand(
  command: CharacterCommand,
): Promise<RuntimeApiResult<CharacterCommandSuccessResponse>> {
  return postCommand(
    '/api/characters/command',
    command,
    characterCommandResponseSchema,
  );
}

export async function sendCharacterLibraryCommand(
  command: CharacterLibraryCommand,
): Promise<RuntimeApiResult<CharacterLibraryCommandSuccessResponse>> {
  return postCommand(
    '/api/character-library/command',
    command,
    characterLibraryCommandResponseSchema,
  );
}

export async function sendSceneCommand(
  command: SceneCommand,
): Promise<RuntimeApiResult<SceneCommandSuccessResponse>> {
  return postCommand(
    '/api/scenes/command',
    command,
    sceneCommandResponseSchema,
  );
}

export async function sendMovementCommand(
  command: MovementCommand,
): Promise<RuntimeApiResult<MovementCommandSuccessResponse>> {
  return postCommand(
    '/api/movement/command',
    command,
    movementCommandResponseSchema,
  );
}

export async function sendEncounterCommand(
  command: EncounterCommand,
): Promise<RuntimeApiResult<EncounterCommandSuccessResponse>> {
  return postCommand(
    '/api/encounters/command',
    command,
    encounterCommandResponseSchema,
  );
}

/**
 * The three resolution commands share one route because they share one
 * authoritative object. `postCommand` already attaches the participant
 * credential, applies the request timeout, and parses the response through the
 * protocol schema, so nothing here touches a token.
 */
export async function sendResolutionCommand(
  command: ResolutionCommand,
): Promise<RuntimeApiResult<ResolutionCommandSuccessResponse>> {
  return postCommand(
    '/api/resolutions/command',
    command,
    resolutionCommandResponseSchema,
  );
}

export async function sendPlayerIntentCommand(
  command: PlayerIntentCommand,
): Promise<RuntimeApiResult<PlayerIntentCommandSuccessResponse>> {
  return postCommand(
    '/api/intents/command',
    command,
    playerIntentCommandResponseSchema,
  );
}

export async function sendDmCommand(
  command: DmCommand,
): Promise<RuntimeApiResult<DmCommandSuccessResponse>> {
  return postCommand('/api/dm/command', command, dmCommandResponseSchema);
}

export async function fetchOutboxStatus(): Promise<
  RuntimeApiResult<OutboxStatusSuccessResponse>
> {
  let response: Response;

  try {
    response = await fetch(new URL('/api/outbox/status', runtimeServerUrl), {
      credentials: 'include',
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      error: {
        message: describeRequestFailure(error),
      },
      ok: false,
    };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return {
      error: {
        message: `Runtime server returned ${response.status} without a JSON body.`,
        status: response.status,
      },
      ok: false,
    };
  }

  return parseOutboxStatusResponse(response.status, body);
}

async function postCommand<TResponse extends CommandResponse>(
  path: string,
  command: unknown,
  schema: ResponseSchema<TResponse>,
): Promise<RuntimeApiResult<Extract<TResponse, { ok: true }>>> {
  let response: Response;
  const participantToken = participantTokenForCommand(command);

  try {
    response = await fetch(new URL(path, runtimeServerUrl), {
      body: JSON.stringify(command),
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(participantToken
          ? { [PARTICIPANT_TOKEN_HEADER]: participantToken }
          : {}),
      },
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      error: {
        message: describeRequestFailure(error),
      },
      ok: false,
    };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return {
      error: {
        message: `Runtime server returned ${response.status} without a JSON body.`,
        status: response.status,
      },
      ok: false,
    };
  }

  return parseRuntimeCommandResponse(response.status, body, schema);
}

export function parseRuntimeCommandResponse<TResponse extends CommandResponse>(
  status: number,
  body: unknown,
  schema: ResponseSchema<TResponse>,
): RuntimeApiResult<Extract<TResponse, { ok: true }>> {
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return {
      error: {
        message:
          parsed.error.issues[0]?.message ??
          'Runtime server returned an unexpected response shape.',
        status,
      },
      ok: false,
    };
  }

  if (!parsed.data.ok) {
    const commandError = parsed.data as unknown as CommandErrorResponse;

    return {
      error: {
        code: commandError.error.code,
        message: commandError.error.message,
        status,
      },
      ok: false,
    };
  }

  return {
    ok: true,
    response: parsed.data as Extract<TResponse, { ok: true }>,
  };
}

export function parseOutboxStatusResponse(
  status: number,
  body: unknown,
): RuntimeApiResult<OutboxStatusSuccessResponse> {
  const parsed = outboxStatusSuccessSchema.safeParse(body);

  if (!parsed.success) {
    return {
      error: {
        message:
          parsed.error.issues[0]?.message ??
          'Runtime server returned an unexpected response shape.',
        status,
      },
      ok: false,
    };
  }

  return {
    ok: true,
    response: parsed.data,
  };
}

/**
 * Turns a `fetch` rejection into something a player can act on.
 *
 * `AbortSignal.timeout` rejects with a `TimeoutError` whose message is
 * browser-specific and unhelpful, so name that case explicitly instead of
 * surfacing it as an unexplained network failure.
 */
export function describeRequestFailure(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'The runtime server did not respond in time.';
  }

  return error instanceof Error
    ? error.message
    : 'Unable to reach the runtime server.';
}
