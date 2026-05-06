import type {
  CommandEventOutboxEventType,
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
} from '@dnd/db';
import type {
  CharacterAssignmentSuccess,
  SceneActivationSuccess,
  SessionCommandSuccess,
  SessionStateUpdate,
  SessionStateUpdateReason,
} from '@dnd/protocol';
import type { SessionSnapshot } from '@dnd/shared';

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
import type {
  InMemoryGameRuntime,
  RuntimeCharacterRepository,
} from './game-runtime.js';
import { DbBackedSessionStore } from './db-session-store.js';
import type { RuntimeSessionStore } from './session-store.js';

export const DURABLE_SESSION_MUTATION_COMMAND_TYPES = [
  'create_session',
  'join_session',
  'assign_character_to_participant',
  'activate_scene_for_session',
] as const;

type DurableSessionMutationCommandType =
  (typeof DURABLE_SESSION_MUTATION_COMMAND_TYPES)[number];

type SessionMutationSuccessData =
  | SessionCommandSuccess['data']
  | CharacterAssignmentSuccess['data']
  | SceneActivationSuccess['data'];

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
  sessionSnapshot: SessionSnapshot | null;
};

export class DbBackedSessionCommandTransactionBoundary {
  private readonly durableCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_SESSION_MUTATION_COMMAND_TYPES,
  );

  constructor(
    private readonly unitOfWork: DndDatabaseUnitOfWork,
    private readonly outboxDispatcher: CommandEventOutboxDispatcherLike,
  ) {}

  supports(params: TransactionalCommandParams): boolean {
    if (!this.durableCommandTypes.has(params.command.type)) {
      return false;
    }

    if (params.command.type === 'assign_character_to_participant') {
      return params.category === 'character';
    }

    if (params.command.type === 'activate_scene_for_session') {
      return params.category === 'scene';
    }

    return params.category === 'session';
  }

  private supportsOutboxDispatch(
    commandType: DurableSessionMutationCommandType,
  ): boolean {
    return commandType !== 'create_session';
  }

  async run<TResponse>(
    params: TransactionalRunParams<TResponse>,
  ): Promise<TResponse> {
    if (!this.supports(params)) {
      throw new Error(
        `Command "${params.command.type}" is not supported by the DB-backed session transaction boundary.`,
      );
    }

    if (!(params.runtime.sessions instanceof DbBackedSessionStore)) {
      throw new Error(
        'The DB-backed session transaction boundary requires the runtime to use DbBackedSessionStore.',
      );
    }

    const result = await this.unitOfWork.transaction((context) =>
      this.runInTransaction(context, params),
    );

    if (result.sessionSnapshot) {
      params.runtime.sessions.replaceSessionSnapshot(result.sessionSnapshot);
    }

    if (result.dispatchIdempotencyKey) {
      try {
        await this.outboxDispatcher.drainUnpublishedByIdempotencyKey(
          result.dispatchIdempotencyKey,
        );
      } catch (error) {
        console.error(
          '[session-transaction] failed to dispatch session outbox rows after commit',
          error,
        );
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
        sessionSnapshot: null,
      };
    }

    const runtimeSessions = params.runtime.sessions;

    if (!(runtimeSessions instanceof DbBackedSessionStore)) {
      throw new Error(
        'The DB-backed session transaction boundary requires the runtime to use DbBackedSessionStore.',
      );
    }

    const transactionSessions = runtimeSessions.forkForTransaction(
      context.sessions,
    );
    const transactionRuntime =
      params.runtime.withSessionStore(transactionSessions);
    const commandSessionId = getCommandSessionId(params.command);
    const initialSnapshot =
      params.command.type === 'create_session' || !commandSessionId
        ? null
        : transactionSessions.getSessionSnapshot(commandSessionId);
    const response = await params.execute(transactionRuntime);
    const nextSnapshot = this.getSessionSnapshotFromResponse(
      response as SessionMutationSuccessData,
    );
    const commandType = params.command
      .type as DurableSessionMutationCommandType;
    const sessionId = commandSessionId ?? nextSnapshot.session.id;
    const inserted =
      await context.commandIdempotency.insertCompletedCommandIdempotencyRecord({
        actorParticipantId: params.command.actor.participantId,
        category: params.category,
        commandId: params.command.commandId,
        commandType: params.command.type,
        fingerprint,
        idempotencyKey,
        response: this.clone(response),
        sessionId,
      });

    if (inserted) {
      const didMutate =
        initialSnapshot === null ||
        nextSnapshot.session.revision > initialSnapshot.session.revision;

      if (didMutate && this.supportsOutboxDispatch(commandType)) {
        const update = this.buildSessionStateUpdate(commandType, nextSnapshot);

        await this.persistOutboxRow(context, idempotencyKey, update);
      }

      return {
        dispatchIdempotencyKey:
          didMutate && this.supportsOutboxDispatch(commandType)
            ? idempotencyKey
            : null,
        response,
        sessionSnapshot: didMutate ? nextSnapshot : null,
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
      sessionSnapshot: null,
    };
  }

  private async persistOutboxRow(
    context: DndDatabaseUnitOfWorkContext,
    idempotencyKey: string,
    update: SessionStateUpdate,
  ): Promise<void> {
    const inserted = await context.outbox.insertCommandEventOutboxRecord({
      eventOrder: 0,
      eventType: this.getEventType(update),
      idempotencyKey,
      outboxId: `${idempotencyKey}:0`,
      payload: this.clone(update),
      sessionId: update.sessionId,
    });

    if (inserted) {
      return;
    }

    throw new Error(
      `Outbox row "${idempotencyKey}:0" was not inserted for session command "${idempotencyKey}".`,
    );
  }

  private buildSessionStateUpdate(
    commandType: DurableSessionMutationCommandType,
    state: SessionSnapshot,
  ): SessionStateUpdate {
    return {
      type: 'session_state',
      reason: this.getReason(commandType),
      revision: state.session.revision,
      sessionId: state.session.id,
      state: this.clone(state),
    };
  }

  private getReason(
    commandType: DurableSessionMutationCommandType,
  ): SessionStateUpdateReason {
    if (commandType === 'join_session') {
      return 'participant_joined';
    }

    if (commandType === 'assign_character_to_participant') {
      return 'participant_character_assigned';
    }

    return 'active_scene_changed';
  }

  private getSessionSnapshotFromResponse(
    response: SessionMutationSuccessData,
  ): SessionSnapshot {
    return this.clone(response.state);
  }

  private getEventType(
    update: SessionStateUpdate,
  ): CommandEventOutboxEventType {
    return update.type;
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
