import type {
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
} from '@dnd/db';
import type { EncounterStateUpdate } from '@dnd/protocol';
import type { Scene, SceneId } from '@dnd/shared';

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
import { DbBackedSceneStore } from './db-scene-store.js';
import type {
  InMemoryGameRuntime,
  RuntimeCharacterRepository,
} from './game-runtime.js';
import type { RuntimeSessionStore } from './session-store.js';

export const DURABLE_SCENE_MUTATION_COMMAND_TYPES = [
  'create_scene',
  'place_entity_in_scene',
  'update_scene_entity',
  'reposition_scene_entity',
  'delete_scene_entity',
  'create_scene_transition',
  'update_scene_transition',
  'delete_scene_transition',
] as const;

export const DURABLE_DM_SCENE_MUTATION_COMMAND_TYPES = [
  'dm_create_combatant_in_active_scene',
  'dm_reposition_combatant_in_active_scene',
  'dm_set_combatant_current_hp',
  // Concealment is a scene write, so it belongs to this boundary. Unlike the
  // others it also republishes the encounter - the encounter did not change,
  // but what each role may see of it did - so that event has to become an
  // outbox row inside the same transaction as the flag it reports.
  'dm_set_combatant_hidden',
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
  dispatchIdempotencyKey: string | null;
  response: TResponse;
  sceneCache: Map<SceneId, Scene> | null;
};

export class DbBackedSceneCommandTransactionBoundary {
  private readonly durableCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_SCENE_MUTATION_COMMAND_TYPES,
  );
  private readonly durableDmCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_DM_SCENE_MUTATION_COMMAND_TYPES,
  );

  constructor(
    private readonly unitOfWork: DndDatabaseUnitOfWork,
    private readonly outboxDispatcher?: CommandEventOutboxDispatcherLike,
  ) {}

  supports(params: TransactionalCommandParams): boolean {
    if (this.durableCommandTypes.has(params.command.type)) {
      return params.category === 'scene';
    }

    if (this.durableDmCommandTypes.has(params.command.type)) {
      return params.category === 'dm';
    }

    return false;
  }

  async run<TResponse>(
    params: TransactionalRunParams<TResponse>,
  ): Promise<TResponse> {
    if (!this.supports(params)) {
      throw new Error(
        `Command "${params.command.type}" is not supported by the DB-backed scene transaction boundary.`,
      );
    }

    if (!(params.runtime.scenes instanceof DbBackedSceneStore)) {
      throw new Error(
        'The DB-backed scene transaction boundary requires the runtime to use DbBackedSceneStore.',
      );
    }

    const result = await this.unitOfWork.transaction((context) =>
      this.runInTransaction(context, params),
    );

    if (result.sceneCache) {
      params.runtime.scenes.replaceScenes(result.sceneCache);
    }

    if (result.dispatchIdempotencyKey && this.outboxDispatcher) {
      try {
        await this.outboxDispatcher.drainUnpublishedByIdempotencyKey(
          result.dispatchIdempotencyKey,
        );
      } catch (error) {
        console.error(
          '[scene-transaction] failed to dispatch scene outbox rows after commit',
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
        sceneCache: null,
      };
    }

    const runtimeScenes = params.runtime.scenes;

    if (!(runtimeScenes instanceof DbBackedSceneStore)) {
      throw new Error(
        'The DB-backed scene transaction boundary requires the runtime to use DbBackedSceneStore.',
      );
    }

    const encounterStateUpdates: EncounterStateUpdate[] = [];
    const transactionScenes = runtimeScenes.forkForTransaction(context.scenes);
    const transactionRuntime = params.runtime.withSceneRepository(
      transactionScenes,
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
      await this.persistOutboxRows(
        context,
        idempotencyKey,
        encounterStateUpdates,
      );

      return {
        dispatchIdempotencyKey: encounterStateUpdates.length
          ? idempotencyKey
          : null,
        response,
        sceneCache: transactionScenes.cloneScenes(),
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
      sceneCache: null,
    };
  }

  private async persistOutboxRows(
    context: DndDatabaseUnitOfWorkContext,
    idempotencyKey: string,
    updates: EncounterStateUpdate[],
  ): Promise<void> {
    for (const [eventOrder, update] of updates.entries()) {
      const inserted = await context.outbox.insertCommandEventOutboxRecord({
        eventOrder,
        eventType: update.type,
        idempotencyKey,
        outboxId: `${idempotencyKey}:${eventOrder}`,
        payload: this.clone(update),
        sessionId: update.sessionId,
      });

      if (inserted) {
        continue;
      }

      throw new Error(
        `Outbox row "${idempotencyKey}:${eventOrder}" was not inserted for scene command "${idempotencyKey}".`,
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
