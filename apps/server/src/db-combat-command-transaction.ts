import type {
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
} from '@dnd/db';
import type { CombatEvent, EncounterStateUpdate } from '@dnd/protocol';
import type { Encounter, SessionId } from '@dnd/shared';

import {
  CommandIdempotencyError,
  createCommandFingerprint,
  createCommandIdempotencyKey,
  getCommandSessionId,
  type CommandIdempotencyCategory,
  type IdempotentCommand,
} from './command-idempotency-store.js';
import { DbBackedCharacterRepository } from './db-character-repository.js';
import { DbBackedEncounterStore } from './db-encounter-store.js';
import type {
  InMemoryGameRuntime,
  RuntimeCharacterRepository,
} from './game-runtime.js';
import type { RuntimeSessionStore } from './session-store.js';

export const DURABLE_CROSS_STORE_COMBAT_COMMAND_TYPES = ['attack'] as const;

type TransactionalCommandParams = {
  category: CommandIdempotencyCategory;
  command: IdempotentCommand;
};

type CombatTransactionalPublication = CombatEvent | EncounterStateUpdate;

type TransactionalRunParams<TPrepared, TResponse> =
  TransactionalCommandParams & {
    execute: (
      runtime: InMemoryGameRuntime<
        RuntimeCharacterRepository,
        RuntimeSessionStore
      >,
      prepared: TPrepared,
    ) => Promise<TResponse>;
    prepare: (
      runtime: InMemoryGameRuntime<
        RuntimeCharacterRepository,
        RuntimeSessionStore
      >,
    ) => Promise<TPrepared> | TPrepared;
    runtime: InMemoryGameRuntime<
      RuntimeCharacterRepository,
      RuntimeSessionStore
    >;
  };

type TransactionalRunResult<TResponse> = {
  encounterCache: Map<SessionId, Encounter>;
  publications: CombatTransactionalPublication[];
  response: TResponse;
};

type CachedResult<TResponse> = {
  encounterCache: Map<SessionId, Encounter>;
  response: TResponse;
};

export class DbBackedCombatCommandTransactionBoundary {
  private readonly durableCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_CROSS_STORE_COMBAT_COMMAND_TYPES,
  );

  constructor(private readonly unitOfWork: DndDatabaseUnitOfWork) {}

  supports(params: TransactionalCommandParams): boolean {
    return (
      params.category === 'encounter' &&
      this.durableCommandTypes.has(params.command.type)
    );
  }

  async run<TPrepared, TResponse>(
    params: TransactionalRunParams<TPrepared, TResponse>,
  ): Promise<TResponse> {
    if (!this.supports(params)) {
      throw new Error(
        `Command "${params.command.type}" is not supported by the DB-backed combat transaction boundary.`,
      );
    }

    if (!(params.runtime.characters instanceof DbBackedCharacterRepository)) {
      throw new Error(
        'The DB-backed combat transaction boundary requires the runtime to use DbBackedCharacterRepository.',
      );
    }

    if (!(params.runtime.encounters instanceof DbBackedEncounterStore)) {
      throw new Error(
        'The DB-backed combat transaction boundary requires the runtime to use DbBackedEncounterStore.',
      );
    }

    const idempotencyKey = createCommandIdempotencyKey(params);
    const fingerprint = createCommandFingerprint(params.command);
    const cached = await this.unitOfWork.transaction((context) =>
      this.loadCachedResponse<TResponse>(context, idempotencyKey, fingerprint),
    );

    if (cached) {
      params.runtime.encounters.replaceEncountersBySession(
        cached.encounterCache,
      );
      return this.clone(cached.response);
    }

    const prepared = await params.prepare(params.runtime);
    const result = await this.unitOfWork.transaction((context) =>
      this.runInTransaction(
        context,
        params,
        prepared,
        idempotencyKey,
        fingerprint,
      ),
    );

    params.runtime.encounters.replaceEncountersBySession(result.encounterCache);

    for (const publication of result.publications) {
      if (publication.type === 'encounter_state') {
        params.runtime.sessions.publishEncounterStateUpdate(publication);
        continue;
      }

      params.runtime.sessions.publishCombatEvent(publication);
    }

    return this.clone(result.response);
  }

  private async loadCachedResponse<TResponse>(
    context: DndDatabaseUnitOfWorkContext,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<CachedResult<TResponse> | null> {
    const existing =
      await context.commandIdempotency.getCompletedCommandIdempotencyRecord(
        idempotencyKey,
      );

    if (!existing) {
      return null;
    }

    this.assertSameFingerprint(
      idempotencyKey,
      existing.fingerprint,
      fingerprint,
    );

    const encounters = await DbBackedEncounterStore.fromDatabase(
      context.encounters,
    );

    return {
      encounterCache: encounters.cloneEncountersBySession(),
      response: this.clone(existing.response) as TResponse,
    };
  }

  private async runInTransaction<TPrepared, TResponse>(
    context: DndDatabaseUnitOfWorkContext,
    params: TransactionalRunParams<TPrepared, TResponse>,
    prepared: TPrepared,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<TransactionalRunResult<TResponse>> {
    const cached = await this.loadCachedResponse<TResponse>(
      context,
      idempotencyKey,
      fingerprint,
    );

    if (cached) {
      return {
        encounterCache: cached.encounterCache,
        publications: [],
        response: cached.response,
      };
    }

    const publications: CombatTransactionalPublication[] = [];
    const encounters = await DbBackedEncounterStore.fromDatabase(
      context.encounters,
    );
    const transactionRuntime = params.runtime.withCombatRepositories(
      new DbBackedCharacterRepository(context.characters),
      encounters,
      {
        combatEventSink: (update) => {
          publications.push(this.clone(update));
        },
        encounterStateUpdateSink: (update) => {
          publications.push(this.clone(update));
        },
      },
    );
    const response = await params.execute(transactionRuntime, prepared);
    const inserted =
      await context.commandIdempotency.insertCompletedCommandIdempotencyRecord({
        actorParticipantId: params.command.actor.participantId,
        category: params.category,
        commandId: params.command.commandId,
        commandType: params.command.type,
        fingerprint,
        idempotencyKey,
        response: this.clone(response),
        sessionId: getCommandSessionId(params.command),
      });

    if (inserted) {
      return {
        encounterCache: encounters.cloneEncountersBySession(),
        publications,
        response,
      };
    }

    const concurrentRecord =
      await context.commandIdempotency.getCompletedCommandIdempotencyRecord(
        idempotencyKey,
      );

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

    return {
      encounterCache: encounters.cloneEncountersBySession(),
      publications: [],
      response: this.clone(concurrentRecord.response) as TResponse,
    };
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
