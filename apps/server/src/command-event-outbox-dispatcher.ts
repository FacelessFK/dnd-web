import type {
  CommandEventOutboxDatabase,
  CommandEventOutboxRow,
} from '@dnd/db';
import type {
  AuthoritativeSceneStateUpdate,
  CharacterStateUpdate,
  CombatEvent,
  EncounterStateUpdate,
  MovementStateUpdate,
  OutboxEventTypeCounts,
  OutboxStatusSuccess,
  PlayerIntentStateUpdate,
  ResolutionStateUpdate,
  SessionStateUpdate,
} from '@dnd/protocol';

import type { SceneEntityId, SessionId } from '@dnd/shared';

import type { SceneVisibilityContext } from './session-event-fanout.js';
import type { RuntimeSessionStore } from './session-store.js';

export interface CommandEventOutboxDispatcherLike {
  drainAllUnpublished(): Promise<void>;
  drainUnpublishedByIdempotencyKey(idempotencyKey: string): Promise<void>;
  getUnpublishedStatus(): Promise<OutboxStatusSuccess['data']>;
}

/**
 * How many unpublished rows one drain pass reads at a time.
 *
 * Draining loops over pages instead of selecting the whole backlog, so a
 * backlog that grew while the process was down cannot be loaded into memory all
 * at once.
 */
const DRAIN_PAGE_SIZE = 500;

export class CommandEventOutboxDispatcher implements CommandEventOutboxDispatcherLike {
  private serializedDrains: Promise<void> = Promise.resolve();

  constructor(
    private readonly outbox: CommandEventOutboxDatabase,
    private readonly sessions: RuntimeSessionStore,
    /**
     * Resolves which combatants are concealed for a session, so replayed rows
     * are projected per role exactly like a live publish.
     *
     * Outbox rows store the authoritative payload, which is correct - the row
     * is a durable record, not a per-viewer message - so concealment has to be
     * applied at delivery. The default conceals nothing, which is right only
     * for callers with no scene access, such as tests.
     */
    private readonly resolveConcealedCombatantIds: (
      sessionId: SessionId,
    ) => ReadonlySet<SceneEntityId> = () => new Set<SceneEntityId>(),
    /**
     * Resolves which cells each player's characters occupy, so a replayed scene
     * row is fogged per viewer exactly like a live publish.
     *
     * Async because reading character records is a database round trip in the
     * mode this dispatcher exists for. The default resolves no observers, which
     * projects every player an empty view - the fail-closed direction, and the
     * right answer for a caller with no character access, such as a test.
     */
    private readonly resolveSceneVisibility: (
      sessionId: SessionId,
      projectedAt: string,
    ) => SceneVisibilityContext | Promise<SceneVisibilityContext> = (
      _sessionId,
      projectedAt,
    ) => ({
      projectedAt,
      observersByParticipant: new Map(),
    }),
  ) {}

  async drainAllUnpublished(): Promise<void> {
    await this.enqueueDrain(async () => {
      // Each pass marks what it publishes, so the next page is always fresh
      // unpublished rows. A short page means an interrupted drain has published
      // less to redo, and a huge backlog never becomes one huge result set.
      for (;;) {
        const rows =
          await this.outbox.listUnpublishedCommandEventOutboxRecords(
            DRAIN_PAGE_SIZE,
          );

        if (rows.length === 0) {
          return;
        }

        await this.publishRows(rows);

        if (rows.length < DRAIN_PAGE_SIZE) {
          return;
        }
      }
    });
  }

  async drainUnpublishedByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<void> {
    await this.enqueueDrain(async () => {
      await this.publishRows(
        await this.outbox.listUnpublishedCommandEventOutboxRecordsByIdempotencyKey(
          idempotencyKey,
        ),
      );
    });
  }

  /**
   * Reports backlog size from a grouped aggregate rather than by counting rows
   * in memory.
   *
   * This endpoint is reachable over HTTP, so the old implementation - select
   * every unpublished row, then count and scan them here - got heavier exactly
   * when the backlog it reports on got worse, and could be triggered repeatedly
   * from outside.
   */
  async getUnpublishedStatus(): Promise<OutboxStatusSuccess['data']> {
    const backlog = await this.outbox.getUnpublishedCommandEventOutboxBacklog();
    const eventTypeCounts = this.createEmptyEventTypeCounts();

    for (const [eventType, rowCount] of Object.entries(
      backlog.countsByEventType,
    )) {
      if (!(eventType in eventTypeCounts)) {
        throw new Error(`Unsupported outbox event type "${eventType}".`);
      }

      eventTypeCounts[eventType as keyof OutboxEventTypeCounts] = rowCount ?? 0;
    }

    return {
      configured: true,
      eventTypeCounts,
      oldestCreatedAt: backlog.oldestCreatedAt
        ? backlog.oldestCreatedAt.toISOString()
        : null,
      unpublishedCount: backlog.totalCount,
    };
  }

  private enqueueDrain(run: () => Promise<void>): Promise<void> {
    const queued = this.serializedDrains.then(run, run);

    this.serializedDrains = queued.then(
      () => undefined,
      () => undefined,
    );

    return queued;
  }

  private async publishRows(rows: CommandEventOutboxRow[]): Promise<void> {
    for (const row of rows) {
      await this.publishRow(row);
      const published = await this.outbox.markCommandEventOutboxRecordPublished(
        row.outboxId,
      );

      if (published) {
        continue;
      }

      throw new Error(
        `Outbox row "${row.outboxId}" was published but could not be marked as published.`,
      );
    }
  }

  private async publishRow(row: CommandEventOutboxRow): Promise<void> {
    if (row.eventType === 'session_state') {
      this.sessions.publishSessionStateUpdate(
        this.clone(row.payload as SessionStateUpdate),
      );
      return;
    }

    if (row.eventType === 'character_state') {
      this.sessions.publishCharacterStateUpdate(
        this.clone(row.payload as CharacterStateUpdate),
      );
      return;
    }

    if (row.eventType === 'encounter_state') {
      const update = this.clone(row.payload as EncounterStateUpdate);

      this.sessions.publishEncounterStateUpdate(
        update,
        this.resolveConcealedCombatantIds(update.sessionId),
      );
      return;
    }

    // The stored payload is the authoritative scene, which is correct for a
    // durable record: the row describes what happened, not what any particular
    // seat was allowed to see. Fog and concealment are applied by the store on
    // the way to each subscriber, exactly as they are on the live path.
    //
    // A row written before `view` existed carries no discriminant. It is still
    // an authoritative scene - that is the only kind of scene the outbox has
    // ever stored - so it is stamped rather than trusted.
    if (row.eventType === 'scene_state') {
      const update: AuthoritativeSceneStateUpdate = {
        ...this.clone(row.payload as AuthoritativeSceneStateUpdate),
        view: 'authoritative',
      };
      const projectedAt = new Date().toISOString();

      this.sessions.publishSceneStateUpdate(
        update,
        await this.resolveSceneVisibility(update.sessionId, projectedAt),
      );
      return;
    }

    if (row.eventType === 'movement_state') {
      this.sessions.publishMovementStateUpdate(
        this.clone(row.payload as MovementStateUpdate),
      );
      return;
    }

    if (row.eventType === 'resolution_state') {
      const update = this.clone(row.payload as ResolutionStateUpdate);

      this.sessions.publishResolutionStateUpdate({
        reason: update.reason,
        requests: update.state.requests,
        resolutions: update.state.resolutions,
        sessionId: update.sessionId,
      });
      return;
    }

    if (row.eventType === 'player_intent_state') {
      const update = this.clone(row.payload as PlayerIntentStateUpdate);

      this.sessions.publishPlayerIntentStateUpdate({
        intents: update.state.intents,
        reason: update.reason,
        sessionId: update.sessionId,
      });
      return;
    }

    if (row.eventType === 'combat_event') {
      const event = this.clone(row.payload as CombatEvent);

      this.sessions.publishCombatEvent(
        event,
        this.resolveConcealedCombatantIds(event.sessionId),
      );
      return;
    }

    throw new Error(`Unsupported outbox event type "${row.eventType}".`);
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }

  private createEmptyEventTypeCounts(): OutboxEventTypeCounts {
    return {
      character_state: 0,
      combat_event: 0,
      encounter_state: 0,
      movement_state: 0,
      player_intent_state: 0,
      resolution_state: 0,
      scene_state: 0,
      session_state: 0,
    };
  }
}
