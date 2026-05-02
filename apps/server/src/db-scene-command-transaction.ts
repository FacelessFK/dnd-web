import type {
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
} from '@dnd/db';
import type { Scene, SceneId } from '@dnd/shared';

import {
  CommandIdempotencyError,
  createCommandFingerprint,
  createCommandIdempotencyKey,
  getCommandSessionId,
  type CommandIdempotencyCategory,
  type IdempotentCommand,
} from './command-idempotency-store.js';
import { DbBackedSceneStore } from './db-scene-store.js';
import type {
  InMemoryGameRuntime,
  RuntimeCharacterRepository,
} from './game-runtime.js';
import type { RuntimeSessionStore } from './session-store.js';

export const DURABLE_SCENE_MUTATION_COMMAND_TYPES = [
  'create_scene',
  'place_entity_in_scene',
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
  response: TResponse;
  sceneCache: Map<SceneId, Scene> | null;
};

export class DbBackedSceneCommandTransactionBoundary {
  private readonly durableCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_SCENE_MUTATION_COMMAND_TYPES,
  );

  constructor(private readonly unitOfWork: DndDatabaseUnitOfWork) {}

  supports(params: TransactionalCommandParams): boolean {
    return (
      params.category === 'scene' &&
      this.durableCommandTypes.has(params.command.type)
    );
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
        response: this.clone(existing.response) as TResponse,
        sceneCache: null,
      };
    }

    const runtimeScenes = params.runtime.scenes;

    if (!(runtimeScenes instanceof DbBackedSceneStore)) {
      throw new Error(
        'The DB-backed scene transaction boundary requires the runtime to use DbBackedSceneStore.',
      );
    }

    const transactionScenes = runtimeScenes.forkForTransaction(context.scenes);
    const transactionRuntime =
      params.runtime.withSceneRepository(transactionScenes);
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
      response: this.clone(concurrentRecord.response) as TResponse,
      sceneCache: null,
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
