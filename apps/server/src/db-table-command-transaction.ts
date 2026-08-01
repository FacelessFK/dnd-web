/**
 * One transaction per M1 table command.
 *
 * Follows the boundary the encounter and scene commands already use: claim the
 * idempotency key, run the command against a runtime forked onto the
 * transaction's database handle, write the completed record and the outbox
 * rows, commit, then swap the in-process view and dispatch.
 *
 * What commits together is the point. A resolved check writes the request row,
 * the dice audit row, the idempotency record and the `resolution_state` outbox
 * row inside one transaction; a failure anywhere before the commit leaves none
 * of them. The alternative - a roll recorded with no idempotency record - would
 * let the same command ID roll a second, different die.
 *
 * `dm_set_combatant_hidden` is not here. It mutates the scene, so it belongs to
 * the scene boundary, which now carries the encounter event that concealment
 * produces.
 */
import type {
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
  CommandEventOutboxEventType,
} from '@dnd/db';
import type {
  PlayerIntentStateUpdate,
  ResolutionStateUpdate,
} from '@dnd/protocol';
import type { SessionId } from '@dnd/shared';

import {
  CommandIdempotencyError,
  createCommandFingerprint,
  createCommandIdempotencyKey,
  getCommandSessionId,
  type CommandIdempotencyCategory,
  type IdempotentCommand,
} from './command-idempotency-store.js';
import type { CommandEventOutboxDispatcherLike } from './command-event-outbox-dispatcher.js';
import { acquireTransactionalIdempotencyClaim } from './db-transactional-idempotency-claim.js';
import { DbBackedSessionTableStateStore } from './db-session-table-state-store.js';
import type {
  InMemoryGameRuntime,
  RuntimeCharacterRepository,
} from './game-runtime.js';
import type { SessionTableState } from './session-table-state.js';
import type { RuntimeSessionStore } from './session-store.js';

export const DURABLE_RESOLUTION_COMMAND_TYPES = [
  'request_resolution',
  'submit_resolution',
  'cancel_resolution_request',
] as const;

export const DURABLE_PLAYER_INTENT_COMMAND_TYPES = [
  'submit_player_intent',
  'update_player_intent_status',
] as const;

type TableStateUpdate = ResolutionStateUpdate | PlayerIntentStateUpdate;

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
  dispatchIdempotencyKey: string | null;
  response: TResponse;
  tableStateCache: Map<SessionId, SessionTableState> | null;
};

export class DbBackedTableCommandTransactionBoundary {
  private readonly durableResolutionCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_RESOLUTION_COMMAND_TYPES,
  );
  private readonly durableIntentCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_PLAYER_INTENT_COMMAND_TYPES,
  );

  constructor(
    private readonly unitOfWork: DndDatabaseUnitOfWork,
    private readonly outboxDispatcher: CommandEventOutboxDispatcherLike,
  ) {}

  supports(params: TransactionalCommandParams): boolean {
    if (this.durableResolutionCommandTypes.has(params.command.type)) {
      return params.category === 'resolution';
    }

    if (this.durableIntentCommandTypes.has(params.command.type)) {
      return params.category === 'intent';
    }

    return false;
  }

  async run<TResponse>(
    params: TransactionalRunParams<TResponse>,
  ): Promise<TResponse> {
    if (!this.supports(params)) {
      throw new Error(
        `Command "${params.command.type}" is not supported by the DB-backed table transaction boundary.`,
      );
    }

    const tableStates = params.runtime.tableStates;

    if (!(tableStates instanceof DbBackedSessionTableStateStore)) {
      throw new Error(
        'The DB-backed table transaction boundary requires the runtime to use DbBackedSessionTableStateStore.',
      );
    }

    const result = await this.unitOfWork.transaction((context) =>
      this.runInTransaction(context, params, tableStates),
    );

    if (result.tableStateCache) {
      tableStates.replaceStates(result.tableStateCache);
    }

    // After the commit, never before. A subscriber that saw the event and then
    // watched the transaction roll back would have observed state the server
    // does not hold.
    if (result.dispatchIdempotencyKey) {
      try {
        await this.outboxDispatcher.drainUnpublishedByIdempotencyKey(
          result.dispatchIdempotencyKey,
        );
      } catch (error) {
        console.error(
          '[table-transaction] failed to dispatch M1 outbox rows after commit',
          error,
        );
      }
    }

    return this.clone(result.response);
  }

  private async runInTransaction<TResponse>(
    context: DndDatabaseUnitOfWorkContext,
    params: TransactionalRunParams<TResponse>,
    tableStates: DbBackedSessionTableStateStore,
  ): Promise<TransactionalRunResult<TResponse>> {
    const idempotencyKey = createCommandIdempotencyKey(params);
    const fingerprint = createCommandFingerprint(params.command);
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
        dispatchIdempotencyKey: null,
        response: this.clone(claim.response),
        tableStateCache: null,
      };
    }

    const updates: TableStateUpdate[] = [];
    const transactionTableStates = tableStates.forkForTransaction(
      context.tableState,
    );
    const transactionRuntime = params.runtime.withTableStateRepository(
      transactionTableStates,
      {
        tableStateUpdateSink: (update) => {
          updates.push(update);
        },
      },
    );
    const response = await params.execute(transactionRuntime);

    await transactionTableStates.flushPendingWrites();

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
      await this.persistOutboxRows(context, idempotencyKey, updates);

      return {
        dispatchIdempotencyKey: idempotencyKey,
        response,
        tableStateCache: transactionTableStates.cloneStates(),
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
      dispatchIdempotencyKey: null,
      response: this.clone(concurrentRecord.response) as TResponse,
      tableStateCache: null,
    };
  }

  private async persistOutboxRows(
    context: DndDatabaseUnitOfWorkContext,
    idempotencyKey: string,
    updates: TableStateUpdate[],
  ): Promise<void> {
    for (const [eventOrder, update] of updates.entries()) {
      const inserted = await context.outbox.insertCommandEventOutboxRecord({
        eventOrder,
        eventType: update.type satisfies CommandEventOutboxEventType,
        idempotencyKey,
        outboxId: `${idempotencyKey}:${eventOrder}`,
        payload: this.clone(update),
        sessionId: update.sessionId,
      });

      if (inserted) {
        continue;
      }

      throw new Error(
        `Outbox row "${idempotencyKey}:${eventOrder}" was not inserted for table command "${idempotencyKey}".`,
      );
    }
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
