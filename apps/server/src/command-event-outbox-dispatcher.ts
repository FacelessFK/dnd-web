import type {
  CommandEventOutboxDatabase,
  CommandEventOutboxRow,
} from '@dnd/db';
import type {
  CharacterStateUpdate,
  CombatEvent,
  EncounterStateUpdate,
  MovementStateUpdate,
  OutboxEventTypeCounts,
  OutboxStatusSuccess,
  SessionStateUpdate,
} from '@dnd/protocol';

import type { RuntimeSessionStore } from './session-store.js';

export interface CommandEventOutboxDispatcherLike {
  drainAllUnpublished(): Promise<void>;
  drainUnpublishedByIdempotencyKey(idempotencyKey: string): Promise<void>;
  getUnpublishedStatus(): Promise<OutboxStatusSuccess['data']>;
}

export class CommandEventOutboxDispatcher implements CommandEventOutboxDispatcherLike {
  private serializedDrains: Promise<void> = Promise.resolve();

  constructor(
    private readonly outbox: CommandEventOutboxDatabase,
    private readonly sessions: RuntimeSessionStore,
  ) {}

  async drainAllUnpublished(): Promise<void> {
    await this.enqueueDrain(async () => {
      await this.publishRows(
        await this.outbox.listUnpublishedCommandEventOutboxRecords(),
      );
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

  async getUnpublishedStatus(): Promise<OutboxStatusSuccess['data']> {
    const rows = await this.outbox.listUnpublishedCommandEventOutboxRecords();
    const eventTypeCounts = this.createEmptyEventTypeCounts();

    for (const row of rows) {
      if (!(row.eventType in eventTypeCounts)) {
        throw new Error(`Unsupported outbox event type "${row.eventType}".`);
      }

      const eventType = row.eventType as keyof OutboxEventTypeCounts;
      eventTypeCounts[eventType] += 1;
    }

    return {
      configured: true,
      eventTypeCounts,
      oldestCreatedAt:
        rows.length > 0
          ? rows
              .reduce((oldest, row) =>
                row.createdAt < oldest.createdAt ? row : oldest,
              )
              .createdAt.toISOString()
          : null,
      unpublishedCount: rows.length,
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
      this.publishRow(row);
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

  private publishRow(row: CommandEventOutboxRow): void {
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
      this.sessions.publishEncounterStateUpdate(
        this.clone(row.payload as EncounterStateUpdate),
      );
      return;
    }

    if (row.eventType === 'movement_state') {
      this.sessions.publishMovementStateUpdate(
        this.clone(row.payload as MovementStateUpdate),
      );
      return;
    }

    if (row.eventType === 'combat_event') {
      this.sessions.publishCombatEvent(this.clone(row.payload as CombatEvent));
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
      session_state: 0,
    };
  }
}
