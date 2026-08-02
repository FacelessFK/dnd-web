import type {
  CommandEventOutboxEventType,
  DndDatabaseUnitOfWork,
  DndDatabaseUnitOfWorkContext,
} from '@dnd/db';
import { calculateMovementDistanceFeet } from '@dnd/rules';
import type {
  AuthoritativeSceneStateUpdate,
  CombatEvent,
  EncounterStateUpdate,
  MovementStateUpdate,
} from '@dnd/protocol';
import type { Encounter, Scene, SceneId, SessionId } from '@dnd/shared';

import {
  CommandIdempotencyError,
  createCommandFingerprint,
  createCommandIdempotencyKey,
  getCommandSessionId,
  type CommandIdempotencyCategory,
  type IdempotentCommand,
} from './command-idempotency-store.js';
import type { CommandEventOutboxDispatcherLike } from './command-event-outbox-dispatcher.js';
import { DbBackedCharacterRepository } from './db-character-repository.js';
import { DbBackedEncounterStore } from './db-encounter-store.js';
import { DbBackedSceneStore } from './db-scene-store.js';
import { acquireTransactionalIdempotencyClaim } from './db-transactional-idempotency-claim.js';
import type {
  InMemoryGameRuntime,
  PreparedMovementContext,
  RuntimeCharacterRepository,
} from './game-runtime.js';
import type { RuntimeSessionStore } from './session-store.js';

export const DURABLE_CROSS_STORE_COMBAT_COMMAND_TYPES = [
  'attack',
  'move_character_in_active_scene',
  'dm_combatant_attack',
] as const;

type TransactionalCommandParams = {
  category: CommandIdempotencyCategory;
  command: IdempotentCommand;
};

type CombatTransactionalPublication =
  | AuthoritativeSceneStateUpdate
  | CombatEvent
  | EncounterStateUpdate
  | MovementStateUpdate;

type TransactionalRunParams<TPrepared, TResponse> =
  TransactionalCommandParams & {
    execute: (
      runtime: InMemoryGameRuntime<
        RuntimeCharacterRepository,
        RuntimeSessionStore
      >,
      prepared: TPrepared,
    ) => Promise<TResponse | null>;
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
  dispatchIdempotencyKey: string | null;
  encounterCache: Map<SessionId, Encounter>;
  response: TResponse;
  sceneCache: Map<SceneId, Scene> | null;
};

type CachedResult<TResponse> = {
  encounterCache: Map<SessionId, Encounter>;
  response: TResponse;
  sceneCache: Map<SceneId, Scene> | null;
};

export class DbBackedCombatCommandTransactionBoundary {
  private readonly durableCommandTypes: ReadonlySet<string> = new Set(
    DURABLE_CROSS_STORE_COMBAT_COMMAND_TYPES,
  );

  constructor(
    private readonly unitOfWork: DndDatabaseUnitOfWork,
    private readonly outboxDispatcher: CommandEventOutboxDispatcherLike,
  ) {}

  supports(params: TransactionalCommandParams): boolean {
    if (!this.durableCommandTypes.has(params.command.type)) {
      return false;
    }

    switch (params.command.type) {
      case 'attack':
        return params.category === 'encounter';
      case 'dm_combatant_attack':
        return params.category === 'dm';
      case 'move_character_in_active_scene':
        return params.category === 'movement';
      default:
        return false;
    }
  }

  async run<TPrepared, TResponse>(
    params: TransactionalRunParams<TPrepared, TResponse>,
  ): Promise<TResponse | null> {
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

    if (
      this.commandRequiresSceneRepository(params.command) &&
      !(params.runtime.scenes instanceof DbBackedSceneStore)
    ) {
      throw new Error(
        'The DB-backed combat transaction boundary requires the runtime to use DbBackedSceneStore for combatant-targeting attacks.',
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

      if (
        cached.sceneCache &&
        params.runtime.scenes instanceof DbBackedSceneStore
      ) {
        params.runtime.scenes.replaceScenes(cached.sceneCache);
      }

      return this.clone(cached.response);
    }

    const prepared = await params.prepare(params.runtime);

    if (!(await this.shouldClaimAndExecute(params, prepared))) {
      return null;
    }

    const result = await this.unitOfWork.transaction((context) =>
      this.runInTransaction(
        context,
        params,
        prepared,
        idempotencyKey,
        fingerprint,
      ),
    );

    if (!result) {
      return null;
    }

    params.runtime.encounters.replaceEncountersBySession(result.encounterCache);

    if (
      result.sceneCache &&
      params.runtime.scenes instanceof DbBackedSceneStore
    ) {
      params.runtime.scenes.replaceScenes(result.sceneCache);
    }

    if (!result.dispatchIdempotencyKey) {
      return this.clone(result.response);
    }

    try {
      await this.outboxDispatcher.drainUnpublishedByIdempotencyKey(
        result.dispatchIdempotencyKey,
      );
    } catch (error) {
      console.error(
        '[combat-transaction] failed to dispatch covered combat outbox rows after commit',
        error,
      );
    }

    return this.clone(result.response);
  }

  private async shouldClaimAndExecute<TPrepared, TResponse>(
    params: TransactionalRunParams<TPrepared, TResponse>,
    prepared: TPrepared,
  ): Promise<boolean> {
    if (params.command.type !== 'move_character_in_active_scene') {
      return true;
    }

    const movement = prepared as PreparedMovementContext;
    const encounter = params.runtime.encounters.findEncounterBySession(
      movement.snapshot.session.id,
    );

    if (!encounter) {
      return false;
    }

    const characterId = movement.participant.characterId;

    if (!characterId) {
      return true;
    }

    const record = await params.runtime.characters.getCharacter(characterId);
    const currentPlacement = record.overlay.position;

    if (
      !currentPlacement ||
      currentPlacement.sceneId !== movement.activeSceneId
    ) {
      return true;
    }

    return (
      calculateMovementDistanceFeet(
        {
          x: currentPlacement.x,
          y: currentPlacement.y,
        },
        movement.targetPosition,
        movement.scene.grid.cellSizeFeet,
      ) > 0
    );
  }

  private commandRequiresSceneRepository(command: IdempotentCommand): boolean {
    return (
      command.type === 'attack' && Boolean(command.payload?.targetCombatantId)
    );
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
    const scenes = await DbBackedSceneStore.fromDatabase(context.scenes);

    return {
      encounterCache: encounters.cloneEncountersBySession(),
      response: this.clone(existing.response) as TResponse,
      sceneCache: scenes.cloneScenes(),
    };
  }

  private async runInTransaction<TPrepared, TResponse>(
    context: DndDatabaseUnitOfWorkContext,
    params: TransactionalRunParams<TPrepared, TResponse>,
    prepared: TPrepared,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<TransactionalRunResult<TResponse> | null> {
    const claim = await acquireTransactionalIdempotencyClaim<TResponse>({
      category: params.category,
      claims: context.commandIdempotencyClaims,
      command: params.command,
      completed: context.commandIdempotency,
      fingerprint,
      idempotencyKey,
    });

    if (claim.kind === 'cached') {
      const encounters = await DbBackedEncounterStore.fromDatabase(
        context.encounters,
      );
      const scenes = await DbBackedSceneStore.fromDatabase(context.scenes);

      return {
        dispatchIdempotencyKey: null,
        encounterCache: encounters.cloneEncountersBySession(),
        response: this.clone(claim.response),
        sceneCache: scenes.cloneScenes(),
      };
    }

    const publications: CombatTransactionalPublication[] = [];
    const encounters = await DbBackedEncounterStore.fromDatabase(
      context.encounters,
    );
    const scenes =
      params.runtime.scenes instanceof DbBackedSceneStore
        ? params.runtime.scenes.forkForTransaction(context.scenes)
        : null;
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
        movementStateUpdateSink: (update) => {
          publications.push(this.clone(update));
        },
        // See the character boundary: the fog announcement a move triggers has
        // to commit with the move.
        sceneStateUpdateSink: (update) => {
          publications.push(this.clone(update));
        },
        scenes: scenes ?? undefined,
      },
    );
    const response = await params.execute(transactionRuntime, prepared);

    if (response === null) {
      return null;
    }

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
      await this.persistOutboxRows(context, idempotencyKey, publications);

      return {
        dispatchIdempotencyKey: idempotencyKey,
        encounterCache: encounters.cloneEncountersBySession(),
        response,
        sceneCache: scenes?.cloneScenes() ?? null,
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
      encounterCache: encounters.cloneEncountersBySession(),
      response: this.clone(concurrentRecord.response) as TResponse,
      sceneCache: scenes?.cloneScenes() ?? null,
    };
  }

  private async persistOutboxRows(
    context: DndDatabaseUnitOfWorkContext,
    idempotencyKey: string,
    publications: CombatTransactionalPublication[],
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
        `Outbox row "${idempotencyKey}:${eventOrder}" was not inserted for combat command "${idempotencyKey}".`,
      );
    }
  }

  private getEventType(
    publication: CombatTransactionalPublication,
  ): CommandEventOutboxEventType {
    return publication.type;
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
