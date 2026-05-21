import {
  characterCommandResponseSchema,
  characterLibraryCommandResponseSchema,
  dmCommandResponseSchema,
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

export function createCommandId(scope: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `web-${scope}-${random}`;
}

export function buildSessionStreamUrl(
  sessionId: string,
  participantId: string,
): string {
  const baseUrl = new URL(runtimeServerUrl);
  baseUrl.pathname = `/api/sessions/${encodeURIComponent(sessionId)}/stream`;
  baseUrl.search = '';
  baseUrl.searchParams.set('participantId', participantId);

  return baseUrl.toString();
}

export async function sendSessionCommand(
  command: ClientCommand,
): Promise<RuntimeApiResult<SessionCommandSuccessResponse>> {
  return postCommand(
    '/api/session/command',
    command,
    sessionCommandResponseSchema,
  );
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
    });
  } catch (error) {
    return {
      error: {
        message:
          error instanceof Error
            ? error.message
            : 'Unable to reach the runtime server.',
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

  try {
    response = await fetch(new URL(path, runtimeServerUrl), {
      body: JSON.stringify(command),
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
  } catch (error) {
    return {
      error: {
        message:
          error instanceof Error
            ? error.message
            : 'Unable to reach the runtime server.',
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
