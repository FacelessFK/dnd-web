import type { RuntimeErrorCode } from '@dnd/protocol';

type IdempotentCommand = {
  actor: {
    participantId: string;
  };
  commandId: string;
  payload?: Record<string, unknown>;
  type: string;
};

export type CommandIdempotencyCategory =
  | 'character'
  | 'encounter'
  | 'movement'
  | 'scene'
  | 'session';

type CommandIdempotencyLookup = {
  category: CommandIdempotencyCategory;
  command: IdempotentCommand;
};

type StoredCommandResult = {
  fingerprint: string;
  response: unknown;
};

export class CommandIdempotencyError extends Error {
  readonly code: RuntimeErrorCode = 'command_id_conflict';

  constructor(message: string) {
    super(message);
    this.name = 'CommandIdempotencyError';
  }
}

export interface CommandIdempotencyStore {
  cacheSuccess(params: CommandIdempotencyLookup & { response: unknown }): void;
  getCachedSuccess<TResponse>(
    params: CommandIdempotencyLookup,
  ): TResponse | null;
}

export class InMemoryCommandIdempotencyStore implements CommandIdempotencyStore {
  private readonly completedCommands = new Map<string, StoredCommandResult>();

  cacheSuccess(params: CommandIdempotencyLookup & { response: unknown }): void {
    const key = createCommandIdempotencyKey(params);
    const fingerprint = createCommandFingerprint(params.command);
    const existing = this.completedCommands.get(key);

    if (existing) {
      this.assertSameFingerprint(key, existing.fingerprint, fingerprint);
      return;
    }

    this.completedCommands.set(key, {
      fingerprint,
      response: structuredClone(params.response),
    });
  }

  getCachedSuccess<TResponse>(
    params: CommandIdempotencyLookup,
  ): TResponse | null {
    const key = createCommandIdempotencyKey(params);
    const fingerprint = createCommandFingerprint(params.command);
    const existing = this.completedCommands.get(key);

    if (!existing) {
      return null;
    }

    this.assertSameFingerprint(key, existing.fingerprint, fingerprint);

    return structuredClone(existing.response) as TResponse;
  }

  private assertSameFingerprint(
    key: string,
    existingFingerprint: string,
    nextFingerprint: string,
  ): void {
    if (existingFingerprint === nextFingerprint) {
      return;
    }

    throw new CommandIdempotencyError(
      `Command ID conflict for idempotency key "${key}".`,
    );
  }
}

function createCommandIdempotencyKey(params: CommandIdempotencyLookup): string {
  return stableStringify([
    params.category,
    params.command.type,
    params.command.commandId,
    params.command.actor.participantId,
    getCommandSessionId(params.command),
  ]);
}

// This is intentionally process-local and deterministic enough for the current
// in-memory runtime. Durable deduplication should replace it during a later
// persistence phase.
function createCommandFingerprint(command: IdempotentCommand): string {
  return stableStringify(command);
}

function getCommandSessionId(command: IdempotentCommand): string | null {
  const sessionId = command.payload?.sessionId;

  return typeof sessionId === 'string' ? sessionId : null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
}
