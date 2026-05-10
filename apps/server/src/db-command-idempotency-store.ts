import type { CommandIdempotencyRecordDatabase } from '@dnd/db';

import {
  CommandIdempotencyError,
  InMemoryCommandIdempotencyStore,
  createCommandFingerprint,
  createCommandIdempotencyKey,
  getCommandSessionId,
  type CommandIdempotencyLookup,
  type CommandIdempotencyStore,
} from './command-idempotency-store.js';

export const DURABLE_CHARACTER_MUTATION_COMMAND_TYPES = [
  'create_character',
  'create_character_library_entry',
  'update_character',
  'update_character_library_entry',
  'finalize_character',
  'finalize_character_library_entry',
  'dm_set_character_current_hp',
  'dm_set_character_active_conditions',
] as const;

export type DurableCharacterMutationCommandType =
  (typeof DURABLE_CHARACTER_MUTATION_COMMAND_TYPES)[number];

type DbBackedCommandIdempotencyStoreOptions = {
  durableCommandTypes?: readonly string[];
  fallback?: CommandIdempotencyStore;
};

export class DbBackedCommandIdempotencyStore implements CommandIdempotencyStore {
  private readonly durableCommandTypes: ReadonlySet<string>;
  private readonly fallback: CommandIdempotencyStore;

  constructor(
    private readonly database: CommandIdempotencyRecordDatabase,
    options: DbBackedCommandIdempotencyStoreOptions = {},
  ) {
    this.durableCommandTypes = new Set(
      options.durableCommandTypes ?? DURABLE_CHARACTER_MUTATION_COMMAND_TYPES,
    );
    this.fallback = options.fallback ?? new InMemoryCommandIdempotencyStore();
  }

  async cacheSuccess(
    params: CommandIdempotencyLookup & { response: unknown },
  ): Promise<void> {
    if (!this.shouldPersist(params)) {
      await this.fallback.cacheSuccess(params);
      return;
    }

    const idempotencyKey = createCommandIdempotencyKey(params);
    const fingerprint = createCommandFingerprint(params.command);
    const existing =
      await this.database.getCompletedCommandIdempotencyRecord(idempotencyKey);

    if (existing) {
      this.assertSameFingerprint(
        idempotencyKey,
        existing.fingerprint,
        fingerprint,
      );
      return;
    }

    const inserted =
      await this.database.insertCompletedCommandIdempotencyRecord({
        actorParticipantId: params.command.actor.participantId,
        category: params.category,
        commandId: params.command.commandId,
        commandType: params.command.type,
        fingerprint,
        idempotencyKey,
        response: this.clone(params.response),
        sessionId: getCommandSessionId(params.command),
      });

    if (inserted) {
      return;
    }

    const concurrentRecord =
      await this.database.getCompletedCommandIdempotencyRecord(idempotencyKey);

    if (!concurrentRecord) {
      throw new Error(
        `Command idempotency record "${idempotencyKey}" was not inserted and could not be reloaded.`,
      );
    }

    this.assertSameFingerprint(
      idempotencyKey,
      concurrentRecord.fingerprint,
      fingerprint,
    );
  }

  async getCachedSuccess<TResponse>(
    params: CommandIdempotencyLookup,
  ): Promise<TResponse | null> {
    if (!this.shouldPersist(params)) {
      return this.fallback.getCachedSuccess<TResponse>(params);
    }

    const idempotencyKey = createCommandIdempotencyKey(params);
    const fingerprint = createCommandFingerprint(params.command);
    const existing =
      await this.database.getCompletedCommandIdempotencyRecord(idempotencyKey);

    if (!existing) {
      return null;
    }

    this.assertSameFingerprint(
      idempotencyKey,
      existing.fingerprint,
      fingerprint,
    );

    return this.clone(existing.response) as TResponse;
  }

  private shouldPersist(params: CommandIdempotencyLookup): boolean {
    return this.durableCommandTypes.has(params.command.type);
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

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}
