import type {
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
} from '@dnd/db';
import type { CharacterStateUpdate } from '@dnd/protocol';

import {
  CommandIdempotencyError,
  createCommandFingerprint,
  createCommandIdempotencyKey,
  getCommandSessionId,
  type CommandIdempotencyCategory,
  type IdempotentCommand,
} from './command-idempotency-store.js';
import { DbBackedCharacterRepository } from './db-character-repository.js';
import {
  DURABLE_CHARACTER_MUTATION_COMMAND_TYPES,
  type DurableCharacterMutationCommandType,
} from './db-command-idempotency-store.js';
import type {
  InMemoryGameRuntime,
  RuntimeCharacterRepository,
} from './game-runtime.js';

type TransactionalCommandParams = {
  category: CommandIdempotencyCategory;
  command: IdempotentCommand;
};

type TransactionalRunParams<TResponse> = TransactionalCommandParams & {
  execute: (
    runtime: InMemoryGameRuntime<RuntimeCharacterRepository>,
  ) => Promise<TResponse>;
  runtime: InMemoryGameRuntime<RuntimeCharacterRepository>;
};

type TransactionalRunResult<TResponse> = {
  characterStateUpdates: CharacterStateUpdate[];
  response: TResponse;
};

export class DbBackedCharacterCommandTransactionBoundary {
  private readonly durableCommandTypes: ReadonlySet<string>;

  constructor(private readonly unitOfWork: DndDatabaseUnitOfWork) {
    this.durableCommandTypes = new Set(
      DURABLE_CHARACTER_MUTATION_COMMAND_TYPES,
    );
  }

  supports(params: TransactionalCommandParams): boolean {
    return (
      this.durableCommandTypes.has(params.command.type) &&
      this.categoryMatchesCommandType(params.category, params.command.type)
    );
  }

  async run<TResponse>(
    params: TransactionalRunParams<TResponse>,
  ): Promise<TResponse> {
    if (!this.supports(params)) {
      throw new Error(
        `Command "${params.command.type}" is not supported by the DB-backed character transaction boundary.`,
      );
    }

    const result = await this.unitOfWork.transaction((context) =>
      this.runInTransaction(context, params),
    );

    for (const update of result.characterStateUpdates) {
      params.runtime.sessions.publishCharacterStateUpdate(update);
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

      return {
        characterStateUpdates: [],
        response: this.clone(existing.response) as TResponse,
      };
    }

    const characterStateUpdates: CharacterStateUpdate[] = [];
    const transactionRuntime = params.runtime.withCharacterRepository(
      new DbBackedCharacterRepository(context.characters),
      {
        characterStateUpdateSink: (update) => {
          characterStateUpdates.push(update);
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
        characterStateUpdates,
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
      characterStateUpdates: [],
      response: this.clone(concurrentRecord.response) as TResponse,
    };
  }

  private categoryMatchesCommandType(
    category: CommandIdempotencyCategory,
    commandType: string,
  ): commandType is DurableCharacterMutationCommandType {
    if (
      commandType === 'dm_set_character_current_hp' ||
      commandType === 'dm_set_character_active_conditions'
    ) {
      return category === 'dm';
    }

    return category === 'character';
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
