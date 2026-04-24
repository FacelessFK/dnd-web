import type {
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
} from '@dnd/db';
import type { EncounterStateUpdate } from '@dnd/protocol';
import type { Encounter, SessionId } from '@dnd/shared';

import {
  CommandIdempotencyError,
  createCommandFingerprint,
  createCommandIdempotencyKey,
  getCommandSessionId,
  type CommandIdempotencyCategory,
  type IdempotentCommand,
} from './command-idempotency-store.js';
import { DbBackedEncounterStore } from './db-encounter-store.js';
import type {
  InMemoryGameRuntime,
  RuntimeCharacterRepository,
} from './game-runtime.js';
import type { RuntimeSessionStore } from './session-store.js';

export const DURABLE_ENCOUNTER_MUTATION_COMMAND_TYPES = [
  'start_encounter',
  'advance_turn',
  'use_action',
  'use_bonus_action',
  'use_reaction',
  'record_movement_usage',
] as const;

export const DURABLE_DM_ENCOUNTER_MUTATION_COMMAND_TYPES = [
  'dm_set_current_turn_usage',
  'dm_set_current_turn_participant',
  'dm_end_active_encounter',
] as const;

type TransactionalCommandParams = {
  category: CommandIdempotencyCategory;
  command: IdempotentCommand;
};

type TransactionalRunParams<TResponse> = TransactionalCommandParams & {
  execute: (
    runtime: InMemoryGameRuntime<
      RuntimeCharacterRepository,
      RuntimeSessionStore
    >,
  ) => Promise<TResponse>;
  runtime: InMemoryGameRuntime<RuntimeCharacterRepository, RuntimeSessionStore>;
};

type TransactionalRunResult<TResponse> = {
  encounterCache: Map<SessionId, Encounter>;
  encounterStateUpdates: EncounterStateUpdate[];
  response: TResponse;
};

export class DbBackedEncounterCommandTransactionBoundary {
  private readonly durableEncounterCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_ENCOUNTER_MUTATION_COMMAND_TYPES,
  );
  private readonly durableDmCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_DM_ENCOUNTER_MUTATION_COMMAND_TYPES,
  );

  constructor(private readonly unitOfWork: DndDatabaseUnitOfWork) {}

  supports(params: TransactionalCommandParams): boolean {
    return this.categoryMatchesCommandType(
      params.category,
      params.command.type,
    );
  }

  async run<TResponse>(
    params: TransactionalRunParams<TResponse>,
  ): Promise<TResponse> {
    if (!this.supports(params)) {
      throw new Error(
        `Command "${params.command.type}" is not supported by the DB-backed encounter transaction boundary.`,
      );
    }

    if (!(params.runtime.encounters instanceof DbBackedEncounterStore)) {
      throw new Error(
        'The DB-backed encounter transaction boundary requires the runtime to use DbBackedEncounterStore.',
      );
    }

    const result = await this.unitOfWork.transaction((context) =>
      this.runInTransaction(context, params),
    );

    params.runtime.encounters.replaceEncountersBySession(result.encounterCache);

    for (const update of result.encounterStateUpdates) {
      params.runtime.sessions.publishEncounterStateUpdate(update);
    }

    return this.clone(result.response);
  }

  private async runInTransaction<TResponse>(
    context: DndDatabaseUnitOfWorkContext,
    params: TransactionalRunParams<TResponse>,
  ): Promise<TransactionalRunResult<TResponse>> {
    const idempotencyKey = createCommandIdempotencyKey(params);
    const fingerprint = createCommandFingerprint(params.command);
    const existing =
      await context.commandIdempotency.getCompletedCommandIdempotencyRecord(
        idempotencyKey,
      );

    if (existing) {
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
        encounterStateUpdates: [],
        response: this.clone(existing.response) as TResponse,
      };
    }

    const encounterStateUpdates: EncounterStateUpdate[] = [];
    const encounters = await DbBackedEncounterStore.fromDatabase(
      context.encounters,
    );
    const transactionRuntime = params.runtime.withEncounterRepository(
      encounters,
      {
        encounterStateUpdateSink: (update) => {
          encounterStateUpdates.push(update);
        },
      },
    );
    const response = await params.execute(transactionRuntime);
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
        encounterStateUpdates,
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
      encounterStateUpdates: [],
      response: this.clone(concurrentRecord.response) as TResponse,
    };
  }

  private categoryMatchesCommandType(
    category: CommandIdempotencyCategory,
    commandType: string,
  ): boolean {
    if (this.durableEncounterCommandTypes.has(commandType)) {
      return category === 'encounter';
    }

    if (this.durableDmCommandTypes.has(commandType)) {
      return category === 'dm';
    }

    return false;
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
