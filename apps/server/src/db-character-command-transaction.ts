import type {
  CommandEventOutboxEventType,
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
} from '@dnd/db';
import type {
  AuthoritativeSceneStateUpdate,
  CharacterStateUpdate,
  MoveCharacterInActiveSceneCommand,
  MovementStateUpdate,
} from '@dnd/protocol';

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
import { acquireTransactionalIdempotencyClaim } from './db-transactional-idempotency-claim.js';
import type { CommandEventOutboxDispatcherLike } from './command-event-outbox-dispatcher.js';
import type {
  InMemoryGameRuntime,
  PreparedMovementContext,
  RuntimeCharacterRepository,
} from './game-runtime.js';
import type { RuntimeSessionStore } from './session-store.js';

const DURABLE_CHARACTER_MOVEMENT_COMMAND_TYPES = [
  'place_character_in_active_scene',
  'move_character_in_active_scene',
  'dm_reposition_character_in_active_scene',
] as const;

type DurableCharacterMovementCommandType =
  (typeof DURABLE_CHARACTER_MOVEMENT_COMMAND_TYPES)[number];
type CharacterTransactionalPublication =
  | AuthoritativeSceneStateUpdate
  | CharacterStateUpdate
  | MovementStateUpdate;

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
  characterStateUpdates: CharacterStateUpdate[];
  dispatchIdempotencyKey: string | null;
  publications: CharacterTransactionalPublication[];
  response: TResponse;
};

export class CombatMovementTransactionRequiredError extends Error {
  constructor() {
    super(
      'move_character_in_active_scene requires the combat transaction boundary for encounter-aware movement spending.',
    );
  }
}

export class DbBackedCharacterCommandTransactionBoundary {
  private readonly durableCommandTypes: ReadonlySet<string>;

  constructor(
    private readonly unitOfWork: DndDatabaseUnitOfWork,
    private readonly outboxDispatcher: CommandEventOutboxDispatcherLike,
  ) {
    this.durableCommandTypes = new Set([
      ...DURABLE_CHARACTER_MUTATION_COMMAND_TYPES,
      ...DURABLE_CHARACTER_MOVEMENT_COMMAND_TYPES,
    ] satisfies readonly string[]);
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

    if (result.dispatchIdempotencyKey) {
      try {
        await this.outboxDispatcher.drainUnpublishedByIdempotencyKey(
          result.dispatchIdempotencyKey,
        );
      } catch (error) {
        console.error(
          '[character-transaction] failed to dispatch character outbox rows after commit',
          error,
        );
      }
    }

    if (!this.supportsOutboxDispatch(params.command.type)) {
      for (const update of result.characterStateUpdates) {
        params.runtime.sessions.publishCharacterStateUpdate(update);
      }
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
        dispatchIdempotencyKey: null,
        publications: [],
        response: this.clone(existing.response) as TResponse,
      };
    }

    const characterStateUpdates: CharacterStateUpdate[] = [];
    const publications: CharacterTransactionalPublication[] = [];
    const outboxBackedCommand = this.supportsOutboxDispatch(
      params.command.type,
    );
    const transactionRuntime = params.runtime.withCharacterRepository(
      new DbBackedCharacterRepository(context.characters),
      {
        characterStateUpdateSink: (update) => {
          const clonedUpdate = this.clone(update);

          characterStateUpdates.push(clonedUpdate);
          publications.push(clonedUpdate);
        },
        movementStateUpdateSink: (update) => {
          publications.push(this.clone(update));
        },
        // Moving a token changes what every player may see. That fog
        // announcement belongs in the same transaction as the move: delivered
        // ahead of the commit it would describe a position the database does
        // not hold yet, and on a rollback it would never be taken back.
        sceneStateUpdateSink: (update) => {
          publications.push(this.clone(update));
        },
      },
    );
    const preparedMovement =
      params.command.type === 'move_character_in_active_scene'
        ? transactionRuntime.prepareMoveCharacterInActiveScene(
            params.command as MoveCharacterInActiveSceneCommand,
          )
        : null;

    if (preparedMovement) {
      const movementBranch =
        await transactionRuntime.resolveMoveCharacterInActiveSceneBranchPrepared(
          preparedMovement,
        );

      if (movementBranch === 'combat') {
        throw new CombatMovementTransactionRequiredError();
      }
    }
    const claim = await acquireTransactionalIdempotencyClaim<TResponse>({
      category: params.category,
      claims: context.commandIdempotencyClaims,
      command: params.command,
      completed: context.commandIdempotency,
      fingerprint,
      idempotencyKey,
    });

    if (claim.kind === 'cached') {
      return {
        characterStateUpdates: [],
        dispatchIdempotencyKey: null,
        publications: [],
        response: this.clone(claim.response),
      };
    }

    const response = preparedMovement
      ? await this.executePreparedMovementCommand<TResponse>(
          params,
          transactionRuntime,
          preparedMovement,
        )
      : await params.execute(transactionRuntime);
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
      if (outboxBackedCommand) {
        await this.persistOutboxRows(context, idempotencyKey, publications);
      }

      return {
        characterStateUpdates,
        dispatchIdempotencyKey:
          outboxBackedCommand && publications.length > 0
            ? idempotencyKey
            : null,
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
      characterStateUpdates: [],
      dispatchIdempotencyKey: null,
      publications: [],
      response: this.clone(concurrentRecord.response) as TResponse,
    };
  }

  private async executePreparedMovementCommand<TResponse>(
    params: TransactionalRunParams<TResponse>,
    transactionRuntime: InMemoryGameRuntime<
      RuntimeCharacterRepository,
      RuntimeSessionStore
    >,
    preparedMovement: PreparedMovementContext,
  ): Promise<TResponse> {
    const moved = await transactionRuntime.moveCharacterInActiveScenePrepared(
      preparedMovement,
      {
        rejectEncounterSideEffects: true,
        transactionalBranchOnly: false,
      },
    );

    if (!moved) {
      throw new CombatMovementTransactionRequiredError();
    }

    return {
      ok: true,
      data: moved,
    } as TResponse;
  }

  private async persistOutboxRows(
    context: DndDatabaseUnitOfWorkContext,
    idempotencyKey: string,
    publications: CharacterTransactionalPublication[],
  ): Promise<void> {
    for (const [eventOrder, publication] of publications.entries()) {
      const inserted = await context.outbox.insertCommandEventOutboxRecord({
        eventOrder,
        eventType: this.getEventType(publication),
        idempotencyKey,
        outboxId: `${idempotencyKey}:${eventOrder}`,
        payload: this.clone(publication),
        sessionId: publication.sessionId,
      });

      if (inserted) {
        continue;
      }

      throw new Error(
        `Outbox row "${idempotencyKey}:${eventOrder}" was not inserted for character command "${idempotencyKey}".`,
      );
    }
  }

  private supportsOutboxDispatch(commandType: string): boolean {
    return (
      commandType === 'dm_set_character_current_hp' ||
      commandType === 'dm_set_character_active_conditions' ||
      commandType === 'place_character_in_active_scene' ||
      commandType === 'move_character_in_active_scene' ||
      commandType === 'dm_reposition_character_in_active_scene'
    );
  }

  private getEventType(
    publication: CharacterTransactionalPublication,
  ): CommandEventOutboxEventType {
    return publication.type;
  }

  private categoryMatchesCommandType(
    category: CommandIdempotencyCategory,
    commandType: string,
  ): commandType is
    | DurableCharacterMutationCommandType
    | DurableCharacterMovementCommandType {
    if (
      commandType === 'dm_set_character_current_hp' ||
      commandType === 'dm_set_character_active_conditions' ||
      commandType === 'dm_reposition_character_in_active_scene'
    ) {
      return category === 'dm';
    }

    if (
      commandType === 'place_character_in_active_scene' ||
      commandType === 'move_character_in_active_scene'
    ) {
      return category === 'movement';
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
