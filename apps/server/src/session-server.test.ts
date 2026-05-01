import assert from 'node:assert/strict';
import type { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
  type ActiveEncounterRecordDatabase,
  type ActiveEncounterRecordDelete,
  type ActiveEncounterRecordRow,
  type ActiveEncounterRecordWrite,
  type CharacterRecordDatabase,
  type CharacterRecordRow,
  type CharacterRecordWrite,
  type CommandIdempotencyRecordDatabase,
  type CommandEventOutboxDatabase,
  type CommandEventOutboxRecordWrite,
  type CommandEventOutboxRow,
  type DndDatabaseUnitOfWork,
  type DndDatabaseUnitOfWorkContext,
  type CompletedCommandIdempotencyRecordRow,
  type CompletedCommandIdempotencyRecordWrite,
  type SceneRecordDatabase,
  type SceneRecordRow,
  type SceneRecordWrite,
  type SessionSnapshotDatabase,
  type SessionSnapshotRow,
  type SessionSnapshotWrite,
} from '@dnd/db';
import type { CharacterId, SessionId } from '@dnd/shared';

import {
  activeSceneStateCommandSuccessSchema,
  type CharacterCommandResponse,
  characterCommandSuccessSchema,
  type CharacterStateUpdate,
  dmCommandSchema,
  type DmCommandResponse,
  dmCommandSuccessSchema,
  type EncounterCommandResponse,
  type MovementStateUpdate,
  type MovementCommandResponse,
  type SceneCommandResponse,
  type SessionCommandResponse,
  characterCommandSchema,
  clientCommandSchema,
  encounterCommandSchema,
  encounterCommandSuccessSchema,
  movementCommandSchema,
  sceneCommandSchema,
  sessionStreamEventSchema,
  type SessionStreamEvent,
} from '@dnd/protocol';

import {
  InMemoryCommandIdempotencyStore,
  type CommandIdempotencyStore,
} from './command-idempotency-store.js';
import { CommandEventOutboxDispatcher } from './command-event-outbox-dispatcher.js';
import { InMemoryCharacterStore } from './character-store.js';
import { DbBackedCharacterRepository } from './db-character-repository.js';
import { DbBackedCharacterCommandTransactionBoundary } from './db-character-command-transaction.js';
import { DbBackedCombatCommandTransactionBoundary } from './db-combat-command-transaction.js';
import { DbBackedEncounterCommandTransactionBoundary } from './db-encounter-command-transaction.js';
import { DbBackedEncounterStore } from './db-encounter-store.js';
import { DbBackedSceneStore } from './db-scene-store.js';
import {
  InMemoryGameRuntime,
  type RuntimeCharacterRepository,
} from './game-runtime.js';
import { DbBackedSessionStore } from './db-session-store.js';
import { handleRequest } from './session-server.js';
import {
  InMemorySessionStore,
  type RuntimeSessionStore,
} from './session-store.js';

type JsonResponse<T> = {
  body: T;
  status: number;
};

async function postJson<TResponse>(
  runtime: InMemoryGameRuntime<RuntimeCharacterRepository, RuntimeSessionStore>,
  idempotency: CommandIdempotencyStore,
  path: string,
  body: unknown,
  characterCommandTransaction?: DbBackedCharacterCommandTransactionBoundary,
  encounterCommandTransaction?: DbBackedEncounterCommandTransactionBoundary,
  combatCommandTransaction?: DbBackedCombatCommandTransactionBoundary,
): Promise<JsonResponse<TResponse>> {
  const request = Readable.from([JSON.stringify(body)]) as Readable & {
    headers: IncomingHttpHeaders;
    method?: string;
    url?: string;
  };
  const response = createMockResponse();

  request.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1',
  };
  request.method = 'POST';
  request.url = path;

  await handleRequest(
    request as never,
    response as never,
    runtime,
    idempotency,
    characterCommandTransaction,
    encounterCommandTransaction,
    combatCommandTransaction,
  );

  return {
    status: response.statusCode,
    body: JSON.parse(response.body) as TResponse,
  };
}

function createMockResponse() {
  return {
    body: '',
    headers: new Map<string, string | number | readonly string[]>(),
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    end(chunk?: unknown) {
      if (chunk != null) {
        this.body += String(chunk);
      }

      this.writableEnded = true;
      return this;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      this.headers.set(name.toLowerCase(), value);
      return this;
    },
    write(chunk: unknown) {
      this.body += String(chunk);
      return true;
    },
    writeHead(
      statusCode: number,
      headers?: Record<string, string | number | readonly string[]>,
    ) {
      this.statusCode = statusCode;
      this.headersSent = true;

      if (headers) {
        for (const [name, value] of Object.entries(headers)) {
          this.setHeader(name, value);
        }
      }

      return this;
    },
  };
}

function subscribeToSessionEvents(
  runtime: InMemoryGameRuntime<RuntimeCharacterRepository, RuntimeSessionStore>,
  sessionId: string,
  onSend: (update: SessionStreamEvent) => void = () => undefined,
) {
  const updates: SessionStreamEvent[] = [];

  runtime.connectParticipant(sessionId, 'dm-001', {
    connectionId: `test-dm-stream-${sessionId}`,
    close: () => undefined,
    send: (update) => {
      onSend(update);
      updates.push(update);
    },
  });

  return updates;
}

class InMemoryCharacterRecordDatabase implements CharacterRecordDatabase {
  private readonly rows = new Map<CharacterId, CharacterRecordRow>();
  private clock = 0;

  get recordCount(): number {
    return this.rows.size;
  }

  async upsertCharacterRecord(
    write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow> {
    const existing = this.rows.get(write.characterId);
    const now = this.nextTimestamp();
    const row: CharacterRecordRow = {
      characterId: write.characterId,
      record: this.clone(write.record),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.rows.set(write.characterId, this.clone(row));

    return this.clone(row);
  }

  async getCharacterRecord(
    characterId: CharacterId,
  ): Promise<CharacterRecordRow | null> {
    const row = this.rows.get(characterId);

    return row ? this.clone(row) : null;
  }

  async updateCharacterRecord(
    write: CharacterRecordWrite,
  ): Promise<CharacterRecordRow | null> {
    const existing = this.rows.get(write.characterId);

    if (!existing) {
      return null;
    }

    const row: CharacterRecordRow = {
      characterId: write.characterId,
      record: this.clone(write.record),
      createdAt: existing.createdAt,
      updatedAt: this.nextTimestamp(),
    };

    this.rows.set(write.characterId, this.clone(row));

    return this.clone(row);
  }

  cloneRows(): Map<CharacterId, CharacterRecordRow> {
    return new Map(
      [...this.rows.entries()].map(([key, row]) => [key, this.clone(row)]),
    );
  }

  replaceRows(rows: Map<CharacterId, CharacterRecordRow>): void {
    this.rows.clear();

    for (const [key, row] of rows.entries()) {
      this.rows.set(key, this.clone(row));
    }
  }

  private nextTimestamp(): Date {
    const timestamp = new Date(Date.UTC(2026, 3, 23, 0, 0, this.clock, 0));

    this.clock += 1;

    return timestamp;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

class InMemorySessionSnapshotDatabase implements SessionSnapshotDatabase {
  private readonly rows = new Map<SessionId, SessionSnapshotRow>();
  private clock = 0;

  async getSessionSnapshot(
    sessionId: SessionId,
  ): Promise<SessionSnapshotRow | null> {
    const row = this.rows.get(sessionId);

    return row ? this.clone(row) : null;
  }

  async listSessionSnapshots(): Promise<SessionSnapshotRow[]> {
    return [...this.rows.values()].map((row) => this.clone(row));
  }

  async upsertSessionSnapshot(
    write: SessionSnapshotWrite,
  ): Promise<SessionSnapshotRow> {
    const existing = this.rows.get(write.sessionId);
    const now = this.nextTimestamp();
    const row: SessionSnapshotRow = {
      sessionId: write.sessionId,
      snapshot: this.clone(write.snapshot),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.rows.set(write.sessionId, this.clone(row));

    return this.clone(row);
  }

  private nextTimestamp(): Date {
    const timestamp = new Date(Date.UTC(2026, 3, 23, 0, 10, this.clock, 0));

    this.clock += 1;

    return timestamp;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

class InMemorySceneRecordDatabase implements SceneRecordDatabase {
  private readonly rows = new Map<string, SceneRecordRow>();
  private clock = 0;

  async getSceneRecord(sceneId: string): Promise<SceneRecordRow | null> {
    const row = this.rows.get(sceneId);

    return row ? this.clone(row) : null;
  }

  async listSceneRecords(): Promise<SceneRecordRow[]> {
    return [...this.rows.values()].map((row) => this.clone(row));
  }

  async updateSceneRecord(
    write: SceneRecordWrite,
  ): Promise<SceneRecordRow | null> {
    const existing = this.rows.get(write.sceneId);

    if (!existing) {
      return null;
    }

    const row: SceneRecordRow = {
      sceneId: write.sceneId,
      sessionId: write.sessionId,
      record: this.clone(write.record),
      createdAt: existing.createdAt,
      updatedAt: this.nextTimestamp(),
    };

    this.rows.set(write.sceneId, this.clone(row));

    return this.clone(row);
  }

  async upsertSceneRecord(write: SceneRecordWrite): Promise<SceneRecordRow> {
    const existing = this.rows.get(write.sceneId);
    const now = this.nextTimestamp();
    const row: SceneRecordRow = {
      sceneId: write.sceneId,
      sessionId: write.sessionId,
      record: this.clone(write.record),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.rows.set(write.sceneId, this.clone(row));

    return this.clone(row);
  }

  private nextTimestamp(): Date {
    const timestamp = new Date(Date.UTC(2026, 3, 23, 0, 20, this.clock, 0));

    this.clock += 1;

    return timestamp;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

class InMemoryActiveEncounterRecordDatabase implements ActiveEncounterRecordDatabase {
  private readonly rows = new Map<string, ActiveEncounterRecordRow>();
  private clock = 0;

  async deleteActiveEncounterRecord(
    params: ActiveEncounterRecordDelete,
  ): Promise<ActiveEncounterRecordRow | null> {
    const existing = this.rows.get(params.sessionId);

    if (!existing || existing.encounterId !== params.encounterId) {
      return null;
    }

    this.rows.delete(params.sessionId);

    return this.clone(existing);
  }

  async getActiveEncounterRecordBySession(
    sessionId: string,
  ): Promise<ActiveEncounterRecordRow | null> {
    const row = this.rows.get(sessionId);

    return row ? this.clone(row) : null;
  }

  async insertActiveEncounterRecord(
    write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null> {
    if (this.rows.has(write.sessionId)) {
      return null;
    }

    const now = this.nextTimestamp();
    const row: ActiveEncounterRecordRow = {
      encounterId: write.encounterId,
      sessionId: write.sessionId,
      sceneId: write.sceneId,
      record: this.clone(write.record),
      createdAt: now,
      updatedAt: now,
    };

    this.rows.set(write.sessionId, this.clone(row));

    return this.clone(row);
  }

  async listActiveEncounterRecords(): Promise<ActiveEncounterRecordRow[]> {
    return [...this.rows.values()].map((row) => this.clone(row));
  }

  async updateActiveEncounterRecord(
    write: ActiveEncounterRecordWrite,
  ): Promise<ActiveEncounterRecordRow | null> {
    const existing = this.rows.get(write.sessionId);

    if (!existing) {
      return null;
    }

    const row: ActiveEncounterRecordRow = {
      encounterId: write.encounterId,
      sessionId: write.sessionId,
      sceneId: write.sceneId,
      record: this.clone(write.record),
      createdAt: existing.createdAt,
      updatedAt: this.nextTimestamp(),
    };

    this.rows.set(write.sessionId, this.clone(row));

    return this.clone(row);
  }

  cloneRows(): Map<string, ActiveEncounterRecordRow> {
    return new Map(
      [...this.rows.entries()].map(([key, row]) => [key, this.clone(row)]),
    );
  }

  replaceRows(rows: Map<string, ActiveEncounterRecordRow>): void {
    this.rows.clear();

    for (const [key, row] of rows.entries()) {
      this.rows.set(key, this.clone(row));
    }
  }

  private nextTimestamp(): Date {
    const timestamp = new Date(Date.UTC(2026, 3, 23, 0, 25, this.clock, 0));

    this.clock += 1;

    return timestamp;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

class InMemoryCommandIdempotencyRecordDatabase implements CommandIdempotencyRecordDatabase {
  private readonly rows = new Map<
    string,
    CompletedCommandIdempotencyRecordRow
  >();
  insertCount = 0;

  get recordCount(): number {
    return this.rows.size;
  }

  async getCompletedCommandIdempotencyRecord(
    idempotencyKey: string,
  ): Promise<CompletedCommandIdempotencyRecordRow | null> {
    const row = this.rows.get(idempotencyKey);

    return row ? this.clone(row) : null;
  }

  async insertCompletedCommandIdempotencyRecord(
    write: CompletedCommandIdempotencyRecordWrite,
  ): Promise<CompletedCommandIdempotencyRecordRow | null> {
    if (this.rows.has(write.idempotencyKey)) {
      return null;
    }

    const row: CompletedCommandIdempotencyRecordRow = {
      actorParticipantId: write.actorParticipantId,
      category: write.category,
      commandId: write.commandId,
      commandType: write.commandType,
      createdAt: new Date(Date.UTC(2026, 3, 23, 0, 0, this.insertCount, 0)),
      fingerprint: write.fingerprint,
      idempotencyKey: write.idempotencyKey,
      response: this.clone(write.response),
      sessionId: write.sessionId,
    };

    this.insertCount += 1;
    this.rows.set(write.idempotencyKey, this.clone(row));

    return this.clone(row);
  }

  cloneRows(): Map<string, CompletedCommandIdempotencyRecordRow> {
    return new Map(
      [...this.rows.entries()].map(([key, row]) => [key, this.clone(row)]),
    );
  }

  replaceRows(rows: Map<string, CompletedCommandIdempotencyRecordRow>): void {
    this.rows.clear();

    for (const [key, row] of rows.entries()) {
      this.rows.set(key, this.clone(row));
    }
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

class InMemoryCommandEventOutboxDatabase implements CommandEventOutboxDatabase {
  private readonly rows = new Map<string, CommandEventOutboxRow>();
  insertCount = 0;

  get recordCount(): number {
    return this.rows.size;
  }

  async insertCommandEventOutboxRecord(
    write: CommandEventOutboxRecordWrite,
  ): Promise<CommandEventOutboxRow | null> {
    if (this.rows.has(write.outboxId)) {
      return null;
    }

    for (const row of this.rows.values()) {
      if (
        row.idempotencyKey === write.idempotencyKey &&
        row.eventOrder === write.eventOrder
      ) {
        return null;
      }
    }

    const row: CommandEventOutboxRow = {
      createdAt: new Date(Date.UTC(2026, 3, 23, 0, 5, this.insertCount, 0)),
      eventOrder: write.eventOrder,
      eventType: write.eventType,
      idempotencyKey: write.idempotencyKey,
      outboxId: write.outboxId,
      payload: this.clone(write.payload),
      publishedAt: null,
      sessionId: write.sessionId,
    };

    this.insertCount += 1;
    this.rows.set(write.outboxId, this.clone(row));

    return this.clone(row);
  }

  async listUnpublishedCommandEventOutboxRecords(): Promise<
    CommandEventOutboxRow[]
  > {
    return [...this.rows.values()]
      .filter((row) => row.publishedAt === null)
      .sort((left, right) => {
        const createdAtDiff =
          left.createdAt.getTime() - right.createdAt.getTime();

        if (createdAtDiff !== 0) {
          return createdAtDiff;
        }

        const idempotencyDiff = left.idempotencyKey.localeCompare(
          right.idempotencyKey,
        );

        if (idempotencyDiff !== 0) {
          return idempotencyDiff;
        }

        const eventOrderDiff = left.eventOrder - right.eventOrder;

        if (eventOrderDiff !== 0) {
          return eventOrderDiff;
        }

        return left.outboxId.localeCompare(right.outboxId);
      })
      .map((row) => this.clone(row));
  }

  async listUnpublishedCommandEventOutboxRecordsByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CommandEventOutboxRow[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.idempotencyKey === idempotencyKey && row.publishedAt === null,
      )
      .sort((left, right) => {
        const eventOrderDiff = left.eventOrder - right.eventOrder;

        if (eventOrderDiff !== 0) {
          return eventOrderDiff;
        }

        return left.outboxId.localeCompare(right.outboxId);
      })
      .map((row) => this.clone(row));
  }

  async markCommandEventOutboxRecordPublished(
    outboxId: string,
  ): Promise<CommandEventOutboxRow | null> {
    const row = this.rows.get(outboxId);

    if (!row || row.publishedAt !== null) {
      return null;
    }

    const updated: CommandEventOutboxRow = {
      ...this.clone(row),
      publishedAt: new Date(Date.UTC(2026, 3, 23, 0, 6, this.insertCount, 0)),
    };

    this.rows.set(outboxId, this.clone(updated));

    return this.clone(updated);
  }

  cloneRows(): Map<string, CommandEventOutboxRow> {
    return new Map(
      [...this.rows.entries()].map(([key, row]) => [key, this.clone(row)]),
    );
  }

  replaceRows(rows: Map<string, CommandEventOutboxRow>): void {
    this.rows.clear();

    for (const [key, row] of rows.entries()) {
      this.rows.set(key, this.clone(row));
    }
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

class InMemoryDndDatabaseUnitOfWork implements DndDatabaseUnitOfWork {
  committedCount = 0;
  failBeforeCommit = false;
  private transactionQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly characters: InMemoryCharacterRecordDatabase,
    private readonly commandIdempotency: InMemoryCommandIdempotencyRecordDatabase,
    private readonly encounters: InMemoryActiveEncounterRecordDatabase = new InMemoryActiveEncounterRecordDatabase(),
    private readonly outbox: InMemoryCommandEventOutboxDatabase = new InMemoryCommandEventOutboxDatabase(),
  ) {}

  async transaction<T>(
    run: (context: DndDatabaseUnitOfWorkContext) => Promise<T>,
  ): Promise<T> {
    const previous = this.transactionQueue;
    let releaseQueue!: () => void;

    this.transactionQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    await previous;

    try {
      const transactionalCharacters = new InMemoryCharacterRecordDatabase();
      const transactionalCommandIdempotency =
        new InMemoryCommandIdempotencyRecordDatabase();
      const transactionalEncounters =
        new InMemoryActiveEncounterRecordDatabase();
      const transactionalOutbox = new InMemoryCommandEventOutboxDatabase();

      transactionalCharacters.replaceRows(this.characters.cloneRows());
      transactionalCommandIdempotency.replaceRows(
        this.commandIdempotency.cloneRows(),
      );
      transactionalEncounters.replaceRows(this.encounters.cloneRows());
      transactionalOutbox.replaceRows(this.outbox.cloneRows());

      const result = await run({
        characters: transactionalCharacters,
        commandIdempotency: transactionalCommandIdempotency,
        encounters: transactionalEncounters,
        outbox: transactionalOutbox,
      });

      if (this.failBeforeCommit) {
        throw new Error('Simulated transaction commit failure.');
      }

      this.characters.replaceRows(transactionalCharacters.cloneRows());
      this.commandIdempotency.replaceRows(
        transactionalCommandIdempotency.cloneRows(),
      );
      this.encounters.replaceRows(transactionalEncounters.cloneRows());
      this.outbox.replaceRows(transactionalOutbox.cloneRows());
      this.committedCount += 1;

      return result;
    } finally {
      releaseQueue();
    }
  }
}

function getEncounterUpdates(updates: SessionStreamEvent[]) {
  return updates.filter((update) => update.type === 'encounter_state');
}

function getCombatEvents(updates: SessionStreamEvent[]) {
  return updates.filter((update) => update.type === 'combat_event');
}

function getCharacterStateUpdates(
  updates: SessionStreamEvent[],
): CharacterStateUpdate[] {
  return updates.filter(
    (update): update is CharacterStateUpdate =>
      update.type === 'character_state',
  );
}

function getMovementUpdates(
  updates: SessionStreamEvent[],
): MovementStateUpdate[] {
  return updates.filter(
    (update): update is MovementStateUpdate => update.type === 'movement_state',
  );
}

function createCombatCommandTransactionHarness(
  runtime: InMemoryGameRuntime<RuntimeCharacterRepository, RuntimeSessionStore>,
  unitOfWork: InMemoryDndDatabaseUnitOfWork,
  outboxDatabase: InMemoryCommandEventOutboxDatabase = new InMemoryCommandEventOutboxDatabase(),
) {
  return {
    combatCommandTransaction: new DbBackedCombatCommandTransactionBoundary(
      unitOfWork,
      new CommandEventOutboxDispatcher(outboxDatabase, runtime.sessions),
    ),
    outboxDatabase,
  };
}

function setupEncounterForIdempotency(runtime: InMemoryGameRuntime) {
  const session = runtime.createSession({
    commandId: 'setup-create-session',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'dnd5e-2024-core',
    },
  });

  runtime.joinSession({
    commandId: 'setup-join-player-1',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });
  runtime.joinSession({
    commandId: 'setup-join-player-2',
    type: 'join_session',
    actor: {
      participantId: 'player-002',
      displayName: 'Player Two',
      role: 'player',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });

  const firstCharacter = createCharacterForIdempotency(
    runtime,
    session.sessionId,
    'player-001',
    {
      name: 'Aria',
      armorClass: 13,
      abilities: {
        str: 8,
        dex: 14,
        con: 13,
        int: 16,
        wis: 12,
        cha: 10,
      },
      hp: {
        max: 26,
        current: 26,
        temp: 0,
      },
    },
  );
  const secondCharacter = createCharacterForIdempotency(
    runtime,
    session.sessionId,
    'player-002',
    {
      name: 'Borin',
      armorClass: 16,
      abilities: {
        str: 16,
        dex: 12,
        con: 14,
        int: 10,
        wis: 10,
        cha: 8,
      },
      hp: {
        max: 34,
        current: 34,
        temp: 0,
      },
    },
  );

  assignCharacterForIdempotency(
    runtime,
    session.sessionId,
    'player-001',
    firstCharacter.character.id,
  );
  assignCharacterForIdempotency(
    runtime,
    session.sessionId,
    'player-002',
    secondCharacter.character.id,
  );

  const scene = runtime.createScene({
    commandId: 'setup-create-scene',
    type: 'create_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      scene: {
        name: 'Reliability Test Arena',
        grid: {
          width: 8,
          height: 8,
          cellSizeFeet: 5,
        },
      },
    },
  });

  runtime.activateSceneForSession({
    commandId: 'setup-activate-scene',
    type: 'activate_scene_for_session',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      sceneId: scene.id,
    },
  });
  placeCharacterForIdempotency(runtime, session.sessionId, 'player-001', {
    x: 0,
    y: 0,
  });
  placeCharacterForIdempotency(runtime, session.sessionId, 'player-002', {
    x: 1,
    y: 0,
  });

  runtime.startEncounter({
    commandId: 'setup-start-encounter',
    type: 'start_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });

  return {
    firstCharacterId: firstCharacter.character.id,
    secondCharacterId: secondCharacter.character.id,
    sessionId: session.sessionId,
  };
}

async function setupDurableEncounterForIdempotency(
  runtime: InMemoryGameRuntime<RuntimeCharacterRepository, RuntimeSessionStore>,
) {
  const session = await runtime.createSession({
    commandId: 'setup-create-session',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'dnd5e-2024-core',
    },
  });

  await runtime.joinSession({
    commandId: 'setup-join-player-1',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });
  await runtime.joinSession({
    commandId: 'setup-join-player-2',
    type: 'join_session',
    actor: {
      participantId: 'player-002',
      displayName: 'Player Two',
      role: 'player',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });

  const firstCharacter = await runtime.createCharacter({
    commandId: 'setup-create-character-player-001',
    type: 'create_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 5,
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 8,
          dex: 14,
          con: 13,
          int: 16,
          wis: 12,
          cha: 10,
        },
        hp: {
          max: 26,
          current: 26,
          temp: 0,
        },
        armorClass: 13,
        speed: 30,
        notes: null,
        meta: {},
      },
    },
  });
  const secondCharacter = await runtime.createCharacter({
    commandId: 'setup-create-character-player-002',
    type: 'create_character',
    actor: {
      participantId: 'player-002',
    },
    payload: {
      sessionId: session.sessionId,
      ownerParticipantId: 'player-002',
      character: {
        name: 'Borin',
        level: 5,
        className: 'Fighter',
        speciesOrRace: 'Human',
        background: 'Guard',
        abilities: {
          str: 16,
          dex: 12,
          con: 14,
          int: 10,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 34,
          current: 34,
          temp: 0,
        },
        armorClass: 16,
        speed: 30,
        notes: null,
        meta: {},
      },
    },
  });

  await runtime.assignCharacterToParticipant({
    commandId: 'setup-assign-character-player-001',
    type: 'assign_character_to_participant',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-001',
      characterId: firstCharacter.character.id,
    },
  });
  await runtime.assignCharacterToParticipant({
    commandId: 'setup-assign-character-player-002',
    type: 'assign_character_to_participant',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-002',
      characterId: secondCharacter.character.id,
    },
  });

  const scene = await runtime.createScene({
    commandId: 'setup-create-scene',
    type: 'create_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      scene: {
        name: 'Reliability Test Arena',
        grid: {
          width: 8,
          height: 8,
          cellSizeFeet: 5,
        },
      },
    },
  });

  await runtime.activateSceneForSession({
    commandId: 'setup-activate-scene',
    type: 'activate_scene_for_session',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
      sceneId: scene.id,
    },
  });
  await runtime.placeCharacterInActiveScene({
    commandId: 'setup-place-character-player-001',
    type: 'place_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-001',
      position: {
        x: 0,
        y: 0,
      },
    },
  });
  await runtime.placeCharacterInActiveScene({
    commandId: 'setup-place-character-player-002',
    type: 'place_character_in_active_scene',
    actor: {
      participantId: 'player-002',
    },
    payload: {
      sessionId: session.sessionId,
      participantId: 'player-002',
      position: {
        x: 1,
        y: 0,
      },
    },
  });

  await runtime.startEncounter({
    commandId: 'setup-start-encounter',
    type: 'start_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: session.sessionId,
    },
  });

  return {
    firstCharacterId: firstCharacter.character.id,
    secondCharacterId: secondCharacter.character.id,
    sessionId: session.sessionId,
  };
}

function createCharacterForIdempotency(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  overrides: {
    abilities: {
      cha: number;
      con: number;
      dex: number;
      int: number;
      str: number;
      wis: number;
    };
    armorClass: number;
    hp: {
      current: number;
      max: number;
      temp: number;
    };
    name: string;
  },
) {
  return runtime.createCharacter({
    commandId: `setup-create-character-${participantId}`,
    type: 'create_character',
    actor: {
      participantId,
    },
    payload: {
      sessionId,
      ownerParticipantId: participantId,
      character: {
        name: overrides.name,
        level: 5,
        className: 'Fighter',
        speciesOrRace: 'Human',
        background: 'Soldier',
        abilities: overrides.abilities,
        hp: overrides.hp,
        armorClass: overrides.armorClass,
        speed: 30,
        notes: null,
        meta: {},
      },
    },
  });
}

function assignCharacterForIdempotency(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  characterId: string,
) {
  runtime.assignCharacterToParticipant({
    commandId: `setup-assign-character-${participantId}`,
    type: 'assign_character_to_participant',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId,
      characterId,
    },
  });
}

function placeCharacterForIdempotency(
  runtime: InMemoryGameRuntime,
  sessionId: string,
  participantId: string,
  position: {
    x: number;
    y: number;
  },
) {
  runtime.placeCharacterInActiveScene({
    commandId: `setup-place-character-${participantId}`,
    type: 'place_character_in_active_scene',
    actor: {
      participantId,
    },
    payload: {
      sessionId,
      participantId,
      position,
    },
  });
}

test('invalid session IDs are rejected by command validation', () => {
  const result = clientCommandSchema.safeParse({
    commandId: 'invalid-join',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId: 'bad-id',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'sessionId']);
});

test('invalid rules profile IDs are rejected during session command validation', () => {
  const result = clientCommandSchema.safeParse({
    commandId: 'invalid-create',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'INVALID PROFILE',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'rulesProfileId']);
});

test('invalid ability score shapes are rejected for character creation', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'create-character-invalid-abilities',
    type: 'create_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 1,
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 0,
          dex: 14,
          con: 12,
          int: 16,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'character',
    'abilities',
    'str',
  ]);
});

test('invalid level ranges are rejected for character creation', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'create-character-invalid-level',
    type: 'create_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 21,
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 8,
          dex: 14,
          con: 12,
          int: 16,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'character',
    'level',
  ]);
});

test('invalid character IDs are rejected for character retrieval', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'get-character-invalid-id',
    type: 'get_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      characterId: 'character-1',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'characterId']);
});

test('invalid scene IDs are rejected for scene retrieval', () => {
  const result = sceneCommandSchema.safeParse({
    commandId: 'get-scene-invalid-id',
    type: 'get_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      sceneId: 'scene-one',
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'sceneId']);
});

test('invalid grid sizes are rejected for scene creation', () => {
  const result = sceneCommandSchema.safeParse({
    commandId: 'create-scene-invalid-grid',
    type: 'create_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      scene: {
        name: 'Broken Grid',
        grid: {
          width: 0,
          height: 8,
        },
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'scene',
    'grid',
    'width',
  ]);
});

test('invalid update payloads are rejected for character updates', () => {
  const result = characterCommandSchema.safeParse({
    commandId: 'update-character-invalid',
    type: 'update_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      characterId: 'char_11111111-1111-4111-8111-111111111111',
      character: {
        name: '',
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 8,
          dex: 14,
          con: 12,
          int: 16,
          wis: 10,
          cha: 8,
        },
        hp: {
          max: 8,
          current: 8,
          temp: 0,
        },
        armorClass: 12,
        speed: 30,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'character',
    'name',
  ]);
});

test('invalid movement target positions are rejected for movement commands', () => {
  const result = movementCommandSchema.safeParse({
    commandId: 'move-character-invalid-target',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      participantId: 'player-001',
      position: {
        x: -1,
        y: 0,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'position', 'x']);
});

test('active-scene state read commands are accepted by movement command validation', () => {
  const result = movementCommandSchema.safeParse({
    commandId: 'get-active-scene-state-1',
    type: 'get_active_scene_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });

  assert.equal(result.success, true);
});

test('encounter commands are accepted for narrow start/read/advance validation', () => {
  const startResult = encounterCommandSchema.safeParse({
    commandId: 'start-encounter-1',
    type: 'start_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const readResult = encounterCommandSchema.safeParse({
    commandId: 'get-encounter-state-1',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const advanceResult = encounterCommandSchema.safeParse({
    commandId: 'advance-turn-1',
    type: 'advance_turn',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const useActionResult = encounterCommandSchema.safeParse({
    commandId: 'use-action-1',
    type: 'use_action',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const useBonusActionResult = encounterCommandSchema.safeParse({
    commandId: 'use-bonus-action-1',
    type: 'use_bonus_action',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const useReactionResult = encounterCommandSchema.safeParse({
    commandId: 'use-reaction-1',
    type: 'use_reaction',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });
  const recordMovementUsageResult = encounterCommandSchema.safeParse({
    commandId: 'record-movement-usage-1',
    type: 'record_movement_usage',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      amountFeet: 10,
    },
  });
  const attackResult = encounterCommandSchema.safeParse({
    commandId: 'attack-1',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      targetParticipantId: 'player-002',
    },
  });

  assert.equal(startResult.success, true);
  assert.equal(readResult.success, true);
  assert.equal(advanceResult.success, true);
  assert.equal(useActionResult.success, true);
  assert.equal(useBonusActionResult.success, true);
  assert.equal(useReactionResult.success, true);
  assert.equal(recordMovementUsageResult.success, true);
  assert.equal(attackResult.success, true);
});

test('dm commands are accepted for narrow HP override validation', () => {
  const hpResult = dmCommandSchema.safeParse({
    commandId: 'dm-set-hp-1',
    type: 'dm_set_character_current_hp',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      participantId: 'player-001',
      characterId: 'char_11111111-1111-4111-8111-111111111111',
      currentHp: 12,
    },
  });
  const conditionsResult = dmCommandSchema.safeParse({
    commandId: 'dm-set-conditions-1',
    type: 'dm_set_character_active_conditions',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      participantId: 'player-001',
      characterId: 'char_11111111-1111-4111-8111-111111111111',
      activeConditions: ['prone', 'frightened'],
    },
  });
  const repositionResult = dmCommandSchema.safeParse({
    commandId: 'dm-reposition-1',
    type: 'dm_reposition_character_in_active_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      participantId: 'player-001',
      characterId: 'char_11111111-1111-4111-8111-111111111111',
      position: {
        x: 2,
        y: 3,
      },
    },
  });
  const turnUsageResult = dmCommandSchema.safeParse({
    commandId: 'dm-set-turn-usage-1',
    type: 'dm_set_current_turn_usage',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      turnUsage: {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: true,
        movementUsed: 30,
      },
    },
  });
  const currentTurnParticipantResult = dmCommandSchema.safeParse({
    commandId: 'dm-set-current-turn-1',
    type: 'dm_set_current_turn_participant',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      participantId: 'player-001',
    },
  });
  const endEncounterResult = dmCommandSchema.safeParse({
    commandId: 'dm-end-encounter-1',
    type: 'dm_end_active_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
    },
  });

  assert.equal(hpResult.success, true);
  assert.equal(conditionsResult.success, true);
  assert.equal(repositionResult.success, true);
  assert.equal(turnUsageResult.success, true);
  assert.equal(currentTurnParticipantResult.success, true);
  assert.equal(endEncounterResult.success, true);
});

test('invalid DM turn-usage override payloads are rejected during command validation', () => {
  const result = dmCommandSchema.safeParse({
    commandId: 'dm-set-turn-usage-invalid',
    type: 'dm_set_current_turn_usage',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId: 'ABC123',
      turnUsage: {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: -1,
      },
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, [
    'payload',
    'turnUsage',
    'movementUsed',
  ]);
});

test('invalid encounter movement-usage payloads are rejected during command validation', () => {
  const result = encounterCommandSchema.safeParse({
    commandId: 'record-movement-usage-invalid',
    type: 'record_movement_usage',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId: 'ABC123',
      amountFeet: 0,
    },
  });

  assert.equal(result.success, false);

  if (result.success) {
    return;
  }

  assert.deepEqual(result.error.issues[0]?.path, ['payload', 'amountFeet']);
});

test('server command paths can use the DB-backed character repository without public shape changes', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  let characterCommandTransaction =
    new DbBackedCharacterCommandTransactionBoundary(unitOfWork);
  const session = await postJson<SessionCommandResponse>(
    runtime,
    idempotency,
    '/api/session/command',
    {
      commandId: 'db-backed-runtime-create-session',
      type: 'create_session',
      actor: {
        participantId: 'dm-001',
        displayName: 'Dungeon Master',
        role: 'dm',
      },
      payload: {
        rulesProfileId: 'dnd5e-2024-core',
      },
    },
  );

  assert.equal(session.status, 200);
  assert.equal(session.body.ok, true);

  if (!session.body.ok) {
    return;
  }

  const sessionId = session.body.data.sessionId;
  const createCharacterCommand = {
    commandId: 'db-backed-runtime-create-character',
    type: 'create_character',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      ownerParticipantId: 'player-001',
      character: {
        name: 'Aria',
        level: 5,
        className: 'Wizard',
        speciesOrRace: 'Elf',
        background: 'Sage',
        abilities: {
          str: 8,
          dex: 14,
          con: 13,
          int: 16,
          wis: 12,
          cha: 10,
        },
        hp: {
          max: 26,
          current: 26,
          temp: 0,
        },
        armorClass: 13,
        speed: 30,
        notes: null,
        meta: {},
      },
    },
  };

  const failedBeforeJoin = await postJson<CharacterCommandResponse>(
    runtime,
    idempotency,
    '/api/characters/command',
    createCharacterCommand,
    characterCommandTransaction,
  );

  assert.equal(failedBeforeJoin.body.ok, false);
  assert.equal(idempotencyDatabase.recordCount, 0);

  await postJson<SessionCommandResponse>(
    runtime,
    idempotency,
    '/api/session/command',
    {
      commandId: 'db-backed-runtime-join-player',
      type: 'join_session',
      actor: {
        participantId: 'player-001',
        displayName: 'Player One',
        role: 'player',
      },
      payload: {
        sessionId,
      },
    },
  );

  const created = await postJson<CharacterCommandResponse>(
    runtime,
    idempotency,
    '/api/characters/command',
    createCharacterCommand,
    characterCommandTransaction,
  );
  characterCommandTransaction = new DbBackedCharacterCommandTransactionBoundary(
    unitOfWork,
  );
  const duplicateCreated = await postJson<CharacterCommandResponse>(
    runtime,
    idempotency,
    '/api/characters/command',
    createCharacterCommand,
    characterCommandTransaction,
  );
  const conflictingCreate = await postJson<CharacterCommandResponse>(
    runtime,
    idempotency,
    '/api/characters/command',
    {
      ...createCharacterCommand,
      payload: {
        ...createCharacterCommand.payload,
        character: {
          ...createCharacterCommand.payload.character,
          name: 'Conflicting Aria',
        },
      },
    },
    characterCommandTransaction,
  );

  assert.equal(created.status, 200);
  assert.equal(duplicateCreated.status, 200);
  assert.equal(conflictingCreate.status, 409);
  assert.equal(
    characterCommandSuccessSchema.safeParse(created.body).success,
    true,
  );
  assert.equal(created.body.ok, true);
  assert.deepEqual(duplicateCreated.body, created.body);
  assert.equal(conflictingCreate.body.ok, false);

  if (!conflictingCreate.body.ok) {
    assert.equal(conflictingCreate.body.error.code, 'command_id_conflict');
  }

  assert.equal(characterDatabase.recordCount, 1);
  assert.equal(idempotencyDatabase.recordCount, 1);

  if (!created.body.ok || !('character' in created.body.data)) {
    return;
  }

  const characterId = created.body.data.character.id;

  await postJson<CharacterCommandResponse>(
    runtime,
    idempotency,
    '/api/characters/command',
    {
      commandId: 'db-backed-runtime-finalize-character',
      type: 'finalize_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        characterId,
      },
    },
    characterCommandTransaction,
  );
  await postJson<CharacterCommandResponse>(
    runtime,
    idempotency,
    '/api/characters/command',
    {
      commandId: 'db-backed-runtime-assign-character',
      type: 'assign_character_to_participant',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        characterId,
      },
    },
  );

  const commitMarkers: number[] = [];
  const updates = subscribeToSessionEvents(runtime, sessionId, () => {
    commitMarkers.push(unitOfWork.committedCount);
  });
  const updateCountBeforeHp = updates.length;
  const markerCountBeforeHp = commitMarkers.length;
  const commitCountBeforeHp = unitOfWork.committedCount;
  const dmHpCommand = {
    commandId: 'db-backed-runtime-dm-hp',
    type: 'dm_set_character_current_hp',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId,
      currentHp: 5,
    },
  };
  const hpUpdate = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    dmHpCommand,
    characterCommandTransaction,
  );
  const updateCountAfterHp = updates.length;
  characterCommandTransaction = new DbBackedCharacterCommandTransactionBoundary(
    unitOfWork,
  );
  const duplicateHpUpdate = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    dmHpCommand,
    characterCommandTransaction,
  );
  const reread = await postJson<CharacterCommandResponse>(
    runtime,
    idempotency,
    '/api/characters/command',
    {
      commandId: 'db-backed-runtime-read-character',
      type: 'get_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        characterId,
      },
    },
  );
  const persistedRow = await characterDatabase.getCharacterRecord(characterId);
  const newUpdates = updates.slice(updateCountBeforeHp);
  const newCommitMarkers = commitMarkers.slice(markerCountBeforeHp);

  assert.equal(hpUpdate.status, 200);
  assert.equal(duplicateHpUpdate.status, 200);
  assert.equal(dmCommandSuccessSchema.safeParse(hpUpdate.body).success, true);
  assert.deepEqual(duplicateHpUpdate.body, hpUpdate.body);
  assert.equal(updates.length, updateCountAfterHp);
  assert.equal(reread.status, 200);
  assert.equal(reread.body.ok, true);
  assert.equal(persistedRow?.record.character.hp.current, 5);
  assert.equal(idempotencyDatabase.recordCount, 3);
  assert.deepEqual(
    newUpdates.map((update) => update.type),
    ['character_state'],
  );
  assert.deepEqual(newCommitMarkers, [commitCountBeforeHp + 1]);
  assert.equal(newUpdates[0]?.type, 'character_state');

  if (!reread.body.ok || !('character' in reread.body.data)) {
    return;
  }

  assert.equal(reread.body.data.character.hp.current, 5);

  if (newUpdates[0]?.type === 'character_state') {
    assert.equal(newUpdates[0].reason, 'dm_hp_changed');
    assert.equal(newUpdates[0].characterId, characterId);
    assert.equal(newUpdates[0].hp.current, 5);
  }

  const updateCountBeforeFailedCommit = updates.length;
  const recordCountBeforeFailedCommit = idempotencyDatabase.recordCount;
  const originalConsoleError = console.error;

  unitOfWork.failBeforeCommit = true;
  console.error = () => undefined;

  try {
    const failedCommit = await postJson<DmCommandResponse>(
      runtime,
      idempotency,
      '/api/dm/command',
      {
        commandId: 'db-backed-runtime-dm-conditions-commit-fails',
        type: 'dm_set_character_active_conditions',
        actor: {
          participantId: 'dm-001',
        },
        payload: {
          sessionId,
          participantId: 'player-001',
          characterId,
          activeConditions: ['prone'],
        },
      },
      characterCommandTransaction,
    );

    assert.equal(failedCommit.status, 500);
    assert.equal(failedCommit.body.ok, false);
  } finally {
    console.error = originalConsoleError;
    unitOfWork.failBeforeCommit = false;
  }

  assert.equal(updates.length, updateCountBeforeFailedCommit);
  assert.equal(idempotencyDatabase.recordCount, recordCountBeforeFailedCommit);
  assert.deepEqual(
    (await characterDatabase.getCharacterRecord(characterId))?.record.overlay
      .activeConditions,
    [],
  );
});

test('db-backed character state can be reread after runtime reinitialization, while reconnect remains limited by non-durable session state', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
  );
  const runtimeBeforeRestart = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
  );
  const idempotencyBeforeRestart: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const transactionBeforeRestart =
    new DbBackedCharacterCommandTransactionBoundary(unitOfWork);

  const firstSession = await postJson<SessionCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/session/command',
    {
      commandId: 'restart-baseline-create-session-1',
      type: 'create_session',
      actor: {
        participantId: 'dm-001',
        displayName: 'Dungeon Master',
        role: 'dm',
      },
      payload: {
        rulesProfileId: 'dnd5e-2024-core',
      },
    },
  );

  assert.equal(firstSession.status, 200);
  assert.equal(firstSession.body.ok, true);

  if (!firstSession.body.ok) {
    return;
  }

  const firstSessionId = firstSession.body.data.sessionId;

  await postJson<SessionCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/session/command',
    {
      commandId: 'restart-baseline-join-player-1',
      type: 'join_session',
      actor: {
        participantId: 'player-001',
        displayName: 'Player One',
        role: 'player',
      },
      payload: {
        sessionId: firstSessionId,
      },
    },
  );

  const created = await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'restart-baseline-create-character-1',
      type: 'create_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId: firstSessionId,
        ownerParticipantId: 'player-001',
        character: {
          name: 'Aria',
          level: 5,
          className: 'Wizard',
          speciesOrRace: 'Elf',
          background: 'Sage',
          abilities: {
            str: 8,
            dex: 14,
            con: 13,
            int: 16,
            wis: 12,
            cha: 10,
          },
          hp: {
            max: 26,
            current: 26,
            temp: 0,
          },
          armorClass: 13,
          speed: 30,
          notes: 'Created before restart.',
          meta: {
            arcaneFocus: 'oak staff',
          },
        },
      },
    },
    transactionBeforeRestart,
  );

  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);

  if (!created.body.ok || !('character' in created.body.data)) {
    return;
  }

  const characterId = created.body.data.character.id;

  const updated = await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'restart-baseline-update-character-1',
      type: 'update_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId: firstSessionId,
        characterId,
        character: {
          name: 'Aria Restarted',
          level: 5,
          className: 'Wizard',
          speciesOrRace: 'Elf',
          background: 'Sage',
          abilities: {
            str: 8,
            dex: 14,
            con: 13,
            int: 16,
            wis: 12,
            cha: 10,
          },
          hp: {
            max: 26,
            current: 19,
            temp: 0,
          },
          armorClass: 13,
          speed: 30,
          notes: 'Persisted across restart.',
          meta: {
            arcaneFocus: 'oak staff',
            restartMarker: 'phase-10-slice-4',
          },
        },
      },
    },
    transactionBeforeRestart,
  );

  assert.equal(updated.status, 200);
  assert.equal(updated.body.ok, true);

  const runtimeAfterRestart = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
  );
  const idempotencyAfterRestart: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();

  const failedReconnect = await postJson<SessionCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/session/command',
    {
      commandId: 'restart-baseline-reconnect-old-session',
      type: 'reconnect_session',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId: firstSessionId,
      },
    },
  );

  assert.equal(failedReconnect.status, 404);
  assert.equal(failedReconnect.body.ok, false);

  if (!failedReconnect.body.ok) {
    assert.equal(failedReconnect.body.error.code, 'session_not_found');
  }

  const secondSession = await postJson<SessionCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/session/command',
    {
      commandId: 'restart-baseline-create-session-2',
      type: 'create_session',
      actor: {
        participantId: 'dm-001',
        displayName: 'Dungeon Master',
        role: 'dm',
      },
      payload: {
        rulesProfileId: 'dnd5e-2024-core',
      },
    },
  );

  assert.equal(secondSession.status, 200);
  assert.equal(secondSession.body.ok, true);

  if (!secondSession.body.ok) {
    return;
  }

  const secondSessionId = secondSession.body.data.sessionId;

  assert.notEqual(secondSessionId, firstSessionId);

  await postJson<SessionCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/session/command',
    {
      commandId: 'restart-baseline-join-player-2',
      type: 'join_session',
      actor: {
        participantId: 'player-001',
        displayName: 'Player One',
        role: 'player',
      },
      payload: {
        sessionId: secondSessionId,
      },
    },
  );

  const rereadAfterRestart = await postJson<CharacterCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/characters/command',
    {
      commandId: 'restart-baseline-read-character-after-restart',
      type: 'get_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId: secondSessionId,
        characterId,
      },
    },
  );

  assert.equal(rereadAfterRestart.status, 200);
  assert.equal(rereadAfterRestart.body.ok, true);

  if (
    !rereadAfterRestart.body.ok ||
    !('character' in rereadAfterRestart.body.data)
  ) {
    return;
  }

  assert.equal(rereadAfterRestart.body.data.character.name, 'Aria Restarted');
  assert.equal(rereadAfterRestart.body.data.character.hp.current, 19);
  assert.equal(
    rereadAfterRestart.body.data.character.notes,
    'Persisted across restart.',
  );
  assert.deepEqual(rereadAfterRestart.body.data.character.meta, {
    arcaneFocus: 'oak staff',
    restartMarker: 'phase-10-slice-4',
  });
});

test('db-backed session snapshots and scenes survive runtime reinitialization for reconnect and active-scene rereads, while live presence still resets', async () => {
  const sessionDatabase = new InMemorySessionSnapshotDatabase();
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const sceneDatabase = new InMemorySceneRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
  );
  const runtimeBeforeRestart = new InMemoryGameRuntime(
    await DbBackedSessionStore.fromDatabase(sessionDatabase),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    await DbBackedSceneStore.fromDatabase(sceneDatabase),
  );
  const idempotencyBeforeRestart: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const transactionBeforeRestart =
    new DbBackedCharacterCommandTransactionBoundary(unitOfWork);

  const createdSession = await postJson<SessionCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/session/command',
    {
      commandId: 'session-durability-create-session-1',
      type: 'create_session',
      actor: {
        participantId: 'dm-001',
        displayName: 'Dungeon Master',
        role: 'dm',
      },
      payload: {
        rulesProfileId: 'dnd5e-2024-core',
      },
    },
  );

  assert.equal(createdSession.status, 200);
  assert.equal(createdSession.body.ok, true);

  if (!createdSession.body.ok) {
    return;
  }

  const sessionId = createdSession.body.data.sessionId;

  await postJson<SessionCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/session/command',
    {
      commandId: 'session-durability-join-player-1',
      type: 'join_session',
      actor: {
        participantId: 'player-001',
        displayName: 'Player One',
        role: 'player',
      },
      payload: {
        sessionId,
      },
    },
  );

  runtimeBeforeRestart.connectParticipant(sessionId, 'player-001', {
    connectionId: 'session-durability-live-player-001',
    close: () => undefined,
    send: () => undefined,
  });

  const createdCharacter = await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'session-durability-create-character-1',
      type: 'create_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        ownerParticipantId: 'player-001',
        character: {
          name: 'Aria Durable Session',
          level: 5,
          className: 'Wizard',
          speciesOrRace: 'Elf',
          background: 'Sage',
          abilities: {
            str: 8,
            dex: 14,
            con: 13,
            int: 16,
            wis: 12,
            cha: 10,
          },
          hp: {
            max: 26,
            current: 26,
            temp: 0,
          },
          armorClass: 13,
          speed: 30,
        },
      },
    },
    transactionBeforeRestart,
  );

  assert.equal(createdCharacter.status, 200);
  assert.equal(createdCharacter.body.ok, true);

  if (
    !createdCharacter.body.ok ||
    !('character' in createdCharacter.body.data)
  ) {
    return;
  }

  const characterId = createdCharacter.body.data.character.id;

  await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'session-durability-finalize-character-1',
      type: 'finalize_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        characterId,
      },
    },
    transactionBeforeRestart,
  );

  await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'session-durability-assign-character-1',
      type: 'assign_character_to_participant',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        characterId,
      },
    },
  );

  const createdScene = await postJson<SceneCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/scenes/command',
    {
      commandId: 'session-durability-create-scene-1',
      type: 'create_scene',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        scene: {
          name: 'Restart Test Room',
          grid: {
            width: 8,
            height: 8,
            cellSizeFeet: 5,
          },
        },
      },
    },
  );

  assert.equal(createdScene.status, 200);
  assert.equal(createdScene.body.ok, true);

  if (!createdScene.body.ok || !('scene' in createdScene.body.data)) {
    return;
  }

  const sceneId = createdScene.body.data.scene.id;

  const createdSecondScene = await postJson<SceneCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/scenes/command',
    {
      commandId: 'session-durability-create-scene-2',
      type: 'create_scene',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        scene: {
          name: 'Restart Switch Room',
          grid: {
            width: 8,
            height: 8,
            cellSizeFeet: 5,
          },
        },
      },
    },
  );

  assert.equal(createdSecondScene.status, 200);
  assert.equal(createdSecondScene.body.ok, true);

  if (
    !createdSecondScene.body.ok ||
    !('scene' in createdSecondScene.body.data)
  ) {
    return;
  }

  const secondSceneId = createdSecondScene.body.data.scene.id;

  await postJson<SceneCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/scenes/command',
    {
      commandId: 'session-durability-activate-scene-1',
      type: 'activate_scene_for_session',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        sceneId,
      },
    },
  );

  const placedCharacter = await postJson<MovementCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/movement/command',
    {
      commandId: 'session-durability-place-character-1',
      type: 'place_character_in_active_scene',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        position: {
          x: 2,
          y: 3,
        },
      },
    },
  );

  assert.equal(placedCharacter.status, 200);
  assert.equal(placedCharacter.body.ok, true);

  const runtimeAfterRestart = new InMemoryGameRuntime(
    await DbBackedSessionStore.fromDatabase(sessionDatabase),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    await DbBackedSceneStore.fromDatabase(sceneDatabase),
  );
  const idempotencyAfterRestart: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();

  const reconnect = await postJson<SessionCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/session/command',
    {
      commandId: 'session-durability-reconnect-1',
      type: 'reconnect_session',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
      },
    },
  );

  assert.equal(reconnect.status, 200);
  assert.equal(reconnect.body.ok, true);

  if (!reconnect.body.ok) {
    return;
  }

  const reconnectedPlayer = reconnect.body.data.state.participants.find(
    (participant) => participant.id === 'player-001',
  );

  assert.equal(reconnect.body.data.sessionId, sessionId);
  assert.equal(reconnect.body.data.state.session.activeSceneId, sceneId);
  assert.equal(reconnectedPlayer?.characterId, characterId);
  assert.equal(reconnectedPlayer?.connectionStatus, 'disconnected');

  const rereadCharacter = await postJson<CharacterCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/characters/command',
    {
      commandId: 'session-durability-read-character-after-restart',
      type: 'get_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        characterId,
      },
    },
  );

  assert.equal(rereadCharacter.status, 200);
  assert.equal(rereadCharacter.body.ok, true);

  const rereadScene = await postJson<SceneCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/scenes/command',
    {
      commandId: 'session-durability-read-scene-after-restart',
      type: 'get_scene',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        sceneId,
      },
    },
  );

  assert.equal(rereadScene.status, 200);
  assert.equal(rereadScene.body.ok, true);

  const activeSceneReadAfterRestart = await postJson<MovementCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/movement/command',
    {
      commandId: 'session-durability-read-active-scene-after-restart',
      type: 'get_active_scene_state',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
      },
    },
  );

  assert.equal(activeSceneReadAfterRestart.status, 200);
  assert.equal(activeSceneReadAfterRestart.body.ok, true);

  if (
    rereadScene.body.ok &&
    'scene' in rereadScene.body.data &&
    activeSceneReadAfterRestart.body.ok &&
    'placedCharacters' in activeSceneReadAfterRestart.body.data
  ) {
    const playerPlacement =
      activeSceneReadAfterRestart.body.data.placedCharacters.find(
        (placement) => placement.participantId === 'player-001',
      );

    assert.equal(rereadScene.body.data.scene.id, sceneId);
    assert.equal(activeSceneReadAfterRestart.body.data.activeSceneId, sceneId);
    assert.equal(playerPlacement?.position.x, 2);
    assert.equal(playerPlacement?.position.y, 3);
  }

  const activatePersistedSceneAfterRestart =
    await postJson<SceneCommandResponse>(
      runtimeAfterRestart,
      idempotencyAfterRestart,
      '/api/scenes/command',
      {
        commandId: 'session-durability-activate-persisted-scene-after-restart',
        type: 'activate_scene_for_session',
        actor: {
          participantId: 'dm-001',
        },
        payload: {
          sessionId,
          sceneId: secondSceneId,
        },
      },
    );

  assert.equal(activatePersistedSceneAfterRestart.status, 200);
  assert.equal(activatePersistedSceneAfterRestart.body.ok, true);

  if (
    activatePersistedSceneAfterRestart.body.ok &&
    'state' in activatePersistedSceneAfterRestart.body.data
  ) {
    assert.equal(
      activatePersistedSceneAfterRestart.body.data.state.session.activeSceneId,
      secondSceneId,
    );
  }
});

test('db-backed active encounters can be reread after restart when durable session, scene, and character state are injected too', async () => {
  const sessionDatabase = new InMemorySessionSnapshotDatabase();
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const sceneDatabase = new InMemorySceneRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
  );
  const runtimeBeforeRestart = new InMemoryGameRuntime(
    await DbBackedSessionStore.fromDatabase(sessionDatabase),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    await DbBackedSceneStore.fromDatabase(sceneDatabase),
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotencyBeforeRestart: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const transactionBeforeRestart =
    new DbBackedCharacterCommandTransactionBoundary(unitOfWork);

  const createdSession = await postJson<SessionCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/session/command',
    {
      commandId: 'encounter-durability-create-session-1',
      type: 'create_session',
      actor: {
        participantId: 'dm-001',
        displayName: 'Dungeon Master',
        role: 'dm',
      },
      payload: {
        rulesProfileId: 'dnd5e-2024-core',
      },
    },
  );

  assert.equal(createdSession.status, 200);
  assert.equal(createdSession.body.ok, true);

  if (!createdSession.body.ok) {
    return;
  }

  const sessionId = createdSession.body.data.sessionId;

  await postJson<SessionCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/session/command',
    {
      commandId: 'encounter-durability-join-player-1',
      type: 'join_session',
      actor: {
        participantId: 'player-001',
        displayName: 'Player One',
        role: 'player',
      },
      payload: {
        sessionId,
      },
    },
  );

  await postJson<SessionCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/session/command',
    {
      commandId: 'encounter-durability-join-player-2',
      type: 'join_session',
      actor: {
        participantId: 'player-002',
        displayName: 'Player Two',
        role: 'player',
      },
      payload: {
        sessionId,
      },
    },
  );

  const createdFirstCharacter = await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'encounter-durability-create-character-1',
      type: 'create_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        ownerParticipantId: 'player-001',
        character: {
          name: 'Aria Encounter Durable',
          level: 5,
          className: 'Wizard',
          speciesOrRace: 'Elf',
          background: 'Sage',
          abilities: {
            str: 8,
            dex: 14,
            con: 13,
            int: 16,
            wis: 12,
            cha: 10,
          },
          hp: {
            max: 26,
            current: 26,
            temp: 0,
          },
          armorClass: 13,
          speed: 30,
        },
      },
    },
    transactionBeforeRestart,
  );

  const createdSecondCharacter = await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'encounter-durability-create-character-2',
      type: 'create_character',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
        ownerParticipantId: 'player-002',
        character: {
          name: 'Borin Encounter Durable',
          level: 5,
          className: 'Fighter',
          speciesOrRace: 'Dwarf',
          background: 'Guard',
          abilities: {
            str: 16,
            dex: 12,
            con: 14,
            int: 10,
            wis: 10,
            cha: 8,
          },
          hp: {
            max: 34,
            current: 34,
            temp: 0,
          },
          armorClass: 16,
          speed: 30,
        },
      },
    },
    transactionBeforeRestart,
  );

  assert.equal(createdFirstCharacter.status, 200);
  assert.equal(createdSecondCharacter.status, 200);
  assert.equal(createdFirstCharacter.body.ok, true);
  assert.equal(createdSecondCharacter.body.ok, true);

  if (
    !createdFirstCharacter.body.ok ||
    !('character' in createdFirstCharacter.body.data) ||
    !createdSecondCharacter.body.ok ||
    !('character' in createdSecondCharacter.body.data)
  ) {
    return;
  }

  const firstCharacterId = createdFirstCharacter.body.data.character.id;
  const secondCharacterId = createdSecondCharacter.body.data.character.id;

  await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'encounter-durability-finalize-character-1',
      type: 'finalize_character',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        characterId: firstCharacterId,
      },
    },
    transactionBeforeRestart,
  );

  await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'encounter-durability-finalize-character-2',
      type: 'finalize_character',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
        characterId: secondCharacterId,
      },
    },
    transactionBeforeRestart,
  );

  await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'encounter-durability-assign-character-1',
      type: 'assign_character_to_participant',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        characterId: firstCharacterId,
      },
    },
  );

  await postJson<CharacterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/characters/command',
    {
      commandId: 'encounter-durability-assign-character-2',
      type: 'assign_character_to_participant',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        participantId: 'player-002',
        characterId: secondCharacterId,
      },
    },
  );

  const createdScene = await postJson<SceneCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/scenes/command',
    {
      commandId: 'encounter-durability-create-scene-1',
      type: 'create_scene',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        scene: {
          name: 'Durable Encounter Arena',
          grid: {
            width: 8,
            height: 8,
            cellSizeFeet: 5,
          },
        },
      },
    },
  );

  assert.equal(createdScene.status, 200);
  assert.equal(createdScene.body.ok, true);

  if (!createdScene.body.ok || !('scene' in createdScene.body.data)) {
    return;
  }

  const sceneId = createdScene.body.data.scene.id;

  await postJson<SceneCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/scenes/command',
    {
      commandId: 'encounter-durability-activate-scene-1',
      type: 'activate_scene_for_session',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        sceneId,
      },
    },
  );

  await postJson<MovementCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/movement/command',
    {
      commandId: 'encounter-durability-place-character-1',
      type: 'place_character_in_active_scene',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        position: {
          x: 0,
          y: 0,
        },
      },
    },
  );

  await postJson<MovementCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/movement/command',
    {
      commandId: 'encounter-durability-place-character-2',
      type: 'place_character_in_active_scene',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
        participantId: 'player-002',
        position: {
          x: 1,
          y: 0,
        },
      },
    },
  );

  const startedEncounter = await postJson<EncounterCommandResponse>(
    runtimeBeforeRestart,
    idempotencyBeforeRestart,
    '/api/encounters/command',
    {
      commandId: 'encounter-durability-start-encounter-1',
      type: 'start_encounter',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
      },
    },
  );

  assert.equal(startedEncounter.status, 200);
  assert.equal(startedEncounter.body.ok, true);

  if (
    !startedEncounter.body.ok ||
    !('encounter' in startedEncounter.body.data)
  ) {
    return;
  }

  const encounterId = startedEncounter.body.data.encounter.id;

  const runtimeAfterRestart = new InMemoryGameRuntime(
    await DbBackedSessionStore.fromDatabase(sessionDatabase),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    await DbBackedSceneStore.fromDatabase(sceneDatabase),
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotencyAfterRestart: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();

  const reconnect = await postJson<SessionCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/session/command',
    {
      commandId: 'encounter-durability-reconnect-after-restart',
      type: 'reconnect_session',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
      },
    },
  );

  assert.equal(reconnect.status, 200);
  assert.equal(reconnect.body.ok, true);

  if (!reconnect.body.ok) {
    return;
  }

  const reconnectedPlayer = reconnect.body.data.state.participants.find(
    (participant) => participant.id === 'player-001',
  );

  assert.equal(reconnectedPlayer?.connectionStatus, 'disconnected');

  const rereadEncounter = await postJson<EncounterCommandResponse>(
    runtimeAfterRestart,
    idempotencyAfterRestart,
    '/api/encounters/command',
    {
      commandId: 'encounter-durability-read-after-restart',
      type: 'get_encounter_state',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
      },
    },
  );

  assert.equal(rereadEncounter.status, 200);
  assert.equal(rereadEncounter.body.ok, true);

  if (rereadEncounter.body.ok && 'encounter' in rereadEncounter.body.data) {
    assert.equal(rereadEncounter.body.data.encounter.id, encounterId);
    assert.equal(rereadEncounter.body.data.encounter.sessionId, sessionId);
    assert.equal(rereadEncounter.body.data.encounter.sceneId, sceneId);
    assert.equal(rereadEncounter.body.data.encounter.status, 'active');
    assert.equal(rereadEncounter.body.data.encounter.roundNumber, 1);
    assert.equal(rereadEncounter.body.data.encounter.currentTurnIndex, 0);
    assert.equal(rereadEncounter.body.data.encounter.participants.length, 2);
  }
});

test('db-backed encounter transaction boundary returns cached success on duplicate retry and emits encounter_state only after commit', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new InMemoryCharacterStore(),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  let encounterCommandTransaction =
    new DbBackedEncounterCommandTransactionBoundary(unitOfWork);
  const { sessionId } = await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const command = {
    commandId: 'transactional-advance-turn-1',
    type: 'advance_turn',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  };
  const commitMarkers: number[] = [];

  runtime.connectParticipant(sessionId, 'player-001', {
    connectionId: 'transactional-advance-turn-marker',
    close: () => undefined,
    send: () => {
      commitMarkers.push(unitOfWork.committedCount);
    },
  });

  const markerCountBefore = commitMarkers.length;
  const encounterUpdateCountBefore = getEncounterUpdates(updates).length;
  const commitCountBefore = unitOfWork.committedCount;
  const first = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
    undefined,
    encounterCommandTransaction,
  );

  encounterCommandTransaction = new DbBackedEncounterCommandTransactionBoundary(
    unitOfWork,
  );

  const second = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
    undefined,
    encounterCommandTransaction,
  );
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdateCountBefore,
  );
  const newCommitMarkers = commitMarkers.slice(markerCountBefore);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(idempotencyDatabase.recordCount, 1);
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'turn_advanced');
  assert.deepEqual(newCommitMarkers, [commitCountBefore + 1]);

  if (first.body.ok && 'encounter' in first.body.data) {
    const reread = runtime.getEncounterState({
      commandId: 'transactional-advance-turn-reread',
      type: 'get_encounter_state',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
      },
    });

    assert.equal(
      reread.currentTurnIndex,
      first.body.data.encounter.currentTurnIndex,
    );
    assert.equal(reread.roundNumber, first.body.data.encounter.roundNumber);
  }
});

test('transactional encounter command ID conflicts still reject conflicting fingerprints without mutation or SSE', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new InMemoryCharacterStore(),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const encounterCommandTransaction =
    new DbBackedEncounterCommandTransactionBoundary(unitOfWork);
  const { sessionId } = await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const firstCommand = {
    commandId: 'transactional-dm-turn-usage-conflict-1',
    type: 'dm_set_current_turn_usage',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      turnUsage: {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: 20,
      },
    },
  };
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      ...firstCommand.payload,
      turnUsage: {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: 25,
      },
    },
  };

  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    firstCommand,
    undefined,
    encounterCommandTransaction,
  );
  const encounterUpdatesBeforeConflict = getEncounterUpdates(updates).length;
  const conflict = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    conflictingCommand,
    undefined,
    encounterCommandTransaction,
  );
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-dm-turn-usage-conflict-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);

  if (!conflict.body.ok) {
    assert.equal(conflict.body.error.code, 'command_id_conflict');
  }

  assert.deepEqual(encounter.currentTurnUsage, {
    actionUsed: true,
    bonusActionUsed: false,
    reactionUsed: false,
    movementUsed: 20,
  });
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdatesBeforeConflict,
  );
  assert.equal(idempotencyDatabase.recordCount, 1);
});

test('failed transactional encounter commands do not persist durable success records', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new InMemoryCharacterStore(),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const encounterCommandTransaction =
    new DbBackedEncounterCommandTransactionBoundary(unitOfWork);
  const { sessionId } = await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const encounterBefore = runtime.getEncounterState({
    commandId: 'transactional-dm-current-turn-invalid-before',
    type: 'get_encounter_state',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  });

  const failed = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    {
      commandId: 'transactional-dm-current-turn-invalid-1',
      type: 'dm_set_current_turn_participant',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
        participantId: 'player-999',
      },
    },
    undefined,
    encounterCommandTransaction,
  );
  const encounterAfter = runtime.getEncounterState({
    commandId: 'transactional-dm-current-turn-invalid-after',
    type: 'get_encounter_state',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.notEqual(failed.status, 200);
  assert.equal(failed.body.ok, false);
  assert.equal(idempotencyDatabase.recordCount, 0);
  assert.equal(getEncounterUpdates(updates).length, 0);
  assert.equal(encounterAfter.id, encounterBefore.id);
  assert.equal(
    encounterAfter.currentTurnIndex,
    encounterBefore.currentTurnIndex,
  );
  assert.deepEqual(
    encounterAfter.currentTurnUsage,
    encounterBefore.currentTurnUsage,
  );
});

test('transactional DM encounter end removes future active reads while publishing the final ended snapshot after commit', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new InMemoryCharacterStore(),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const encounterCommandTransaction =
    new DbBackedEncounterCommandTransactionBoundary(unitOfWork);
  const { sessionId } = await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const commitMarkers: number[] = [];

  runtime.connectParticipant(sessionId, 'player-001', {
    connectionId: 'transactional-dm-end-encounter-marker',
    close: () => undefined,
    send: () => {
      commitMarkers.push(unitOfWork.committedCount);
    },
  });

  const markerCountBefore = commitMarkers.length;
  const commitCountBefore = unitOfWork.committedCount;
  const command = {
    commandId: 'transactional-dm-end-encounter-1',
    type: 'dm_end_active_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  };

  const ended = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
    undefined,
    encounterCommandTransaction,
  );
  const reread = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    {
      commandId: 'transactional-dm-end-encounter-read-after',
      type: 'get_encounter_state',
      actor: {
        participantId: 'dm-001',
      },
      payload: {
        sessionId,
      },
    },
  );
  const encounterUpdates = getEncounterUpdates(updates);
  const newCommitMarkers = commitMarkers.slice(markerCountBefore);
  const persistedEncounter =
    await encounterDatabase.getActiveEncounterRecordBySession(sessionId);

  assert.equal(ended.status, 200);
  assert.equal(ended.body.ok, true);
  assert.equal(runtime.encounters.findEncounterBySession(sessionId), null);
  assert.equal(persistedEncounter, null);
  assert.equal(reread.status, 409);
  assert.equal(reread.body.ok, false);
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'encounter_ended');
  assert.deepEqual(newCommitMarkers, [commitCountBefore + 1]);

  if (ended.body.ok && 'encounter' in ended.body.data) {
    assert.equal(ended.body.data.encounter.status, 'ended');
  }

  if (!reread.body.ok) {
    assert.equal(reread.body.error.code, 'no_active_encounter');
  }
});

test('db-backed combat transaction boundary commits attack damage, encounter usage, and durable success only after commit', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
    () => 20,
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  const { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { secondCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const commitMarkers: number[] = [];

  runtime.connectParticipant(sessionId, 'player-001', {
    connectionId: 'transactional-attack-marker',
    close: () => undefined,
    send: () => {
      commitMarkers.push(unitOfWork.committedCount);
    },
  });

  const markerCountBefore = commitMarkers.length;
  const attack = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    {
      commandId: 'transactional-attack-1',
      type: 'attack',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        targetParticipantId: 'player-002',
      },
    },
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const target = await runtime.characters.getCharacter(secondCharacterId);
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-attack-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });
  const encounterUpdates = getEncounterUpdates(updates);
  const combatEvents = getCombatEvents(updates);

  assert.equal(attack.status, 200);
  assert.equal(attack.body.ok, true);
  assert.equal(idempotencyDatabase.recordCount, 1);
  assert.equal(outboxDatabase.recordCount, 2);
  assert.equal(target.character.hp.current, 33);
  assert.equal(encounter.currentTurnUsage.actionUsed, true);
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'action_used');
  assert.equal(combatEvents.length, 1);
  assert.equal(combatEvents[0]?.reason, 'attack_resolved');
  assert.deepEqual(commitMarkers.slice(markerCountBefore), [
    unitOfWork.committedCount,
    unitOfWork.committedCount,
  ]);

  if (attack.body.ok && 'encounter' in attack.body.data) {
    assert.equal(attack.body.data.encounter.currentTurnUsage.actionUsed, true);
  }

  assert.equal(combatEvents[0]?.targetCharacterId, secondCharacterId);
  assert.deepEqual(combatEvents[0]?.targetHp, {
    previous: 34,
    current: 33,
  });
  assert.equal(
    (await outboxDatabase.listUnpublishedCommandEventOutboxRecords()).length,
    0,
  );
});

test('transactional attack duplicate retry returns cached durable success without rerolling, redamaging, or republishing', async () => {
  let rollCount = 0;
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
    () => {
      rollCount += 1;
      return 20;
    },
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  let { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { secondCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const command = {
    commandId: 'transactional-attack-retry-1',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      targetParticipantId: 'player-002',
    },
  };
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const combatEventsBefore = getCombatEvents(updates).length;
  const first = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
    undefined,
    undefined,
    combatCommandTransaction,
  );

  ({ combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  ));

  const second = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const target = await runtime.characters.getCharacter(secondCharacterId);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(rollCount, 1);
  assert.equal(target.character.hp.current, 33);
  assert.equal(idempotencyDatabase.recordCount, 1);
  assert.equal(outboxDatabase.recordCount, 2);
  assert.equal(getEncounterUpdates(updates).length - encounterUpdatesBefore, 1);
  assert.equal(getCombatEvents(updates).length - combatEventsBefore, 1);
  assert.equal(
    (await outboxDatabase.listUnpublishedCommandEventOutboxRecords()).length,
    0,
  );
});

test('failed transactional attack does not persist a durable success record', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
    () => 20,
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  const { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { firstCharacterId, secondCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const failed = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    {
      commandId: 'transactional-attack-failure-1',
      type: 'attack',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        targetParticipantId: 'player-001',
      },
    },
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const attacker = await runtime.characters.getCharacter(firstCharacterId);
  const target = await runtime.characters.getCharacter(secondCharacterId);
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-attack-failure-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.notEqual(failed.status, 200);
  assert.equal(failed.body.ok, false);
  assert.equal(idempotencyDatabase.recordCount, 0);
  assert.equal(outboxDatabase.recordCount, 0);
  assert.equal(attacker.character.hp.current, 26);
  assert.equal(target.character.hp.current, 34);
  assert.equal(encounter.currentTurnUsage.actionUsed, false);
  assert.equal(getEncounterUpdates(updates).length, 0);
  assert.equal(getCombatEvents(updates).length, 0);

  if (!failed.body.ok) {
    assert.equal(failed.body.error.code, 'self_target_not_allowed');
  }
});

test('transactional attack command ID conflicts still reject conflicting fingerprints without mutation or SSE', async () => {
  let rollCount = 0;
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
    () => {
      rollCount += 1;
      return 20;
    },
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  const { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { secondCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const firstCommand = {
    commandId: 'transactional-attack-conflict-1',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      targetParticipantId: 'player-002',
    },
  };
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      ...firstCommand.payload,
      targetParticipantId: 'player-999',
    },
  };

  const first = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    firstCommand,
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const encounterUpdatesBeforeConflict = getEncounterUpdates(updates).length;
  const combatEventsBeforeConflict = getCombatEvents(updates).length;
  const conflict = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    conflictingCommand,
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const target = await runtime.characters.getCharacter(secondCharacterId);
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-attack-conflict-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  assert.equal(rollCount, 1);
  assert.equal(target.character.hp.current, 33);
  assert.equal(encounter.currentTurnUsage.actionUsed, true);
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdatesBeforeConflict,
  );
  assert.equal(getCombatEvents(updates).length, combatEventsBeforeConflict);
  assert.equal(idempotencyDatabase.recordCount, 1);
  assert.equal(outboxDatabase.recordCount, 2);

  if (!conflict.body.ok) {
    assert.equal(conflict.body.error.code, 'command_id_conflict');
  }
});

test('db-backed combat transaction boundary commits encounter-aware movement atomically when movement usage is spent', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  const { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { firstCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const commitMarkers: number[] = [];

  runtime.connectParticipant(sessionId, 'player-001', {
    connectionId: 'transactional-movement-marker',
    close: () => undefined,
    send: () => {
      commitMarkers.push(unitOfWork.committedCount);
    },
  });

  const updateCountBefore = updates.length;
  const markerCountBefore = commitMarkers.length;
  const moved = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    {
      commandId: 'transactional-movement-1',
      type: 'move_character_in_active_scene',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        position: {
          x: 1,
          y: 1,
        },
      },
    },
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const updatedRecord = await runtime.characters.getCharacter(firstCharacterId);
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-movement-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(moved.status, 200);
  assert.equal(moved.body.ok, true);
  assert.equal(idempotencyDatabase.recordCount, 1);
  assert.equal(outboxDatabase.recordCount, 2);
  assert.equal(updatedRecord.overlay.position?.x, 1);
  assert.equal(updatedRecord.overlay.position?.y, 1);
  assert.equal(encounter.currentTurnUsage.movementUsed, 10);
  assert.deepEqual(
    updates.slice(updateCountBefore).map((update) => update.type),
    ['encounter_state', 'movement_state'],
  );
  assert.equal(getEncounterUpdates(updates).at(-1)?.reason, 'movement_used');
  assert.equal(getMovementUpdates(updates).at(-1)?.reason, 'character_moved');
  assert.deepEqual(commitMarkers.slice(markerCountBefore), [
    unitOfWork.committedCount,
    unitOfWork.committedCount,
  ]);

  if (moved.body.ok && 'character' in moved.body.data) {
    assert.equal(moved.body.data.overlay.position?.x, 1);
    assert.equal(moved.body.data.overlay.position?.y, 1);
  }

  assert.equal(
    (await outboxDatabase.listUnpublishedCommandEventOutboxRecords()).length,
    0,
  );
});

test('transactional encounter-aware movement duplicate retry returns cached durable success without reapplying mutation or republishing', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  let { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { firstCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const movementUpdatesBefore = getMovementUpdates(updates).length;
  const command = {
    commandId: 'transactional-movement-retry-1',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      position: {
        x: 1,
        y: 1,
      },
    },
  } as const;

  const first = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    command,
    undefined,
    undefined,
    combatCommandTransaction,
  );

  ({ combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  ));

  const second = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    command,
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const updatedRecord = await runtime.characters.getCharacter(firstCharacterId);
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-movement-retry-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(updatedRecord.overlay.position?.x, 1);
  assert.equal(updatedRecord.overlay.position?.y, 1);
  assert.equal(encounter.currentTurnUsage.movementUsed, 10);
  assert.equal(idempotencyDatabase.recordCount, 1);
  assert.equal(outboxDatabase.recordCount, 2);
  assert.equal(getEncounterUpdates(updates).length - encounterUpdatesBefore, 1);
  assert.equal(getMovementUpdates(updates).length - movementUpdatesBefore, 1);
  assert.equal(
    (await outboxDatabase.listUnpublishedCommandEventOutboxRecords()).length,
    0,
  );
});

test('failed transactional encounter-aware movement does not persist a durable success record', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  const { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { firstCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const failed = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    {
      commandId: 'transactional-movement-failure-1',
      type: 'move_character_in_active_scene',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        position: {
          x: 1,
          y: 0,
        },
      },
    },
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const updatedRecord = await runtime.characters.getCharacter(firstCharacterId);
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-movement-failure-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.notEqual(failed.status, 200);
  assert.equal(failed.body.ok, false);
  assert.equal(idempotencyDatabase.recordCount, 0);
  assert.equal(outboxDatabase.recordCount, 0);
  assert.equal(updatedRecord.overlay.position?.x, 0);
  assert.equal(updatedRecord.overlay.position?.y, 0);
  assert.equal(encounter.currentTurnUsage.movementUsed, 0);
  assert.equal(getEncounterUpdates(updates).length, 0);
  assert.equal(getMovementUpdates(updates).length, 0);

  if (!failed.body.ok) {
    assert.equal(failed.body.error.code, 'movement_destination_blocked');
  }
});

test('transactional encounter-aware movement command ID conflicts still reject conflicting fingerprints without mutation or SSE', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  const { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { firstCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const firstCommand = {
    commandId: 'transactional-movement-conflict-1',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      position: {
        x: 1,
        y: 1,
      },
    },
  } as const;
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      ...firstCommand.payload,
      position: {
        x: 0,
        y: 1,
      },
    },
  } as const;

  const first = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    firstCommand,
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const encounterUpdatesBeforeConflict = getEncounterUpdates(updates).length;
  const movementUpdatesBeforeConflict = getMovementUpdates(updates).length;
  const conflict = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    conflictingCommand,
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const updatedRecord = await runtime.characters.getCharacter(firstCharacterId);
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-movement-conflict-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  assert.equal(updatedRecord.overlay.position?.x, 1);
  assert.equal(updatedRecord.overlay.position?.y, 1);
  assert.equal(encounter.currentTurnUsage.movementUsed, 10);
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdatesBeforeConflict,
  );
  assert.equal(
    getMovementUpdates(updates).length,
    movementUpdatesBeforeConflict,
  );
  assert.equal(idempotencyDatabase.recordCount, 1);
  assert.equal(outboxDatabase.recordCount, 2);

  if (!conflict.body.ok) {
    assert.equal(conflict.body.error.code, 'command_id_conflict');
  }
});

test('zero-cost encounter movement remains on the existing non-transactional path', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  const { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { firstCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const updateCountBefore = updates.length;

  const moved = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    {
      commandId: 'transactional-movement-zero-cost-1',
      type: 'move_character_in_active_scene',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        position: {
          x: 0,
          y: 0,
        },
      },
    },
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const updatedRecord = await runtime.characters.getCharacter(firstCharacterId);
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-movement-zero-cost-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(moved.status, 200);
  assert.equal(moved.body.ok, true);
  assert.equal(idempotencyDatabase.recordCount, 0);
  assert.equal(outboxDatabase.recordCount, 0);
  assert.equal(updatedRecord.overlay.position?.x, 0);
  assert.equal(updatedRecord.overlay.position?.y, 0);
  assert.equal(encounter.currentTurnUsage.movementUsed, 0);
  assert.deepEqual(
    updates.slice(updateCountBefore).map((update) => update.type),
    ['movement_state'],
  );
});

test('no-active-encounter movement remains on the existing non-transactional path', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  const { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { firstCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);

  await runtime.dmEndActiveEncounter({
    commandId: 'transactional-movement-end-before-move',
    type: 'dm_end_active_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  });

  const updates = subscribeToSessionEvents(runtime, sessionId);
  const updateCountBefore = updates.length;
  const moved = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    {
      commandId: 'transactional-movement-no-encounter-1',
      type: 'move_character_in_active_scene',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        position: {
          x: 0,
          y: 1,
        },
      },
    },
    undefined,
    undefined,
    combatCommandTransaction,
  );
  const updatedRecord = await runtime.characters.getCharacter(firstCharacterId);

  assert.equal(moved.status, 200);
  assert.equal(moved.body.ok, true);
  assert.equal(idempotencyDatabase.recordCount, 0);
  assert.equal(outboxDatabase.recordCount, 0);
  assert.equal(runtime.encounters.findEncounterBySession(sessionId), null);
  assert.equal(updatedRecord.overlay.position?.x, 0);
  assert.equal(updatedRecord.overlay.position?.y, 1);
  assert.deepEqual(
    updates.slice(updateCountBefore).map((update) => update.type),
    ['movement_state'],
  );
});

test('default in-memory movement behavior remains unchanged without the DB-backed combat transaction boundary', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { firstCharacterId, sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const updateCountBefore = updates.length;

  const moved = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    {
      commandId: 'in-memory-movement-baseline-1',
      type: 'move_character_in_active_scene',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
        participantId: 'player-001',
        position: {
          x: 1,
          y: 1,
        },
      },
    },
  );
  const updatedRecord = runtime.characters.getCharacter(firstCharacterId);
  const encounter = runtime.getEncounterState({
    commandId: 'in-memory-movement-baseline-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(moved.status, 200);
  assert.equal(moved.body.ok, true);
  assert.equal(updatedRecord.overlay.position?.x, 1);
  assert.equal(updatedRecord.overlay.position?.y, 1);
  assert.equal(encounter.currentTurnUsage.movementUsed, 10);
  assert.deepEqual(
    updates.slice(updateCountBefore).map((update) => update.type),
    ['encounter_state', 'movement_state'],
  );
});

test('concurrent duplicate transactional encounter-aware movement retries do not double-apply mutation or republish', async () => {
  const characterDatabase = new InMemoryCharacterRecordDatabase();
  const encounterDatabase = new InMemoryActiveEncounterRecordDatabase();
  const idempotencyDatabase = new InMemoryCommandIdempotencyRecordDatabase();
  const unitOfWork = new InMemoryDndDatabaseUnitOfWork(
    characterDatabase,
    idempotencyDatabase,
    encounterDatabase,
  );
  const runtime = new InMemoryGameRuntime(
    new InMemorySessionStore(),
    undefined,
    new DbBackedCharacterRepository(characterDatabase),
    undefined,
    await DbBackedEncounterStore.fromDatabase(encounterDatabase),
  );
  const idempotency: CommandIdempotencyStore =
    new InMemoryCommandIdempotencyStore();
  const outboxDatabase = new InMemoryCommandEventOutboxDatabase();
  const { combatCommandTransaction } = createCombatCommandTransactionHarness(
    runtime,
    unitOfWork,
    outboxDatabase,
  );
  const { firstCharacterId, sessionId } =
    await setupDurableEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const movementUpdatesBefore = getMovementUpdates(updates).length;
  const command = {
    commandId: 'transactional-movement-concurrent-1',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      position: {
        x: 1,
        y: 1,
      },
    },
  };

  const [first, second] = await Promise.all([
    postJson<MovementCommandResponse>(
      runtime,
      idempotency,
      '/api/movement/command',
      command,
      undefined,
      undefined,
      combatCommandTransaction,
    ),
    postJson<MovementCommandResponse>(
      runtime,
      idempotency,
      '/api/movement/command',
      command,
      undefined,
      undefined,
      combatCommandTransaction,
    ),
  ]);
  const updatedRecord = await runtime.characters.getCharacter(firstCharacterId);
  const encounter = await runtime.getEncounterState({
    commandId: 'transactional-movement-concurrent-reread',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(updatedRecord.overlay.position?.x, 1);
  assert.equal(updatedRecord.overlay.position?.y, 1);
  assert.equal(encounter.currentTurnUsage.movementUsed, 10);
  assert.equal(idempotencyDatabase.recordCount, 1);
  assert.equal(outboxDatabase.recordCount, 2);
  assert.equal(getEncounterUpdates(updates).length - encounterUpdatesBefore, 1);
  assert.equal(getMovementUpdates(updates).length - movementUpdatesBefore, 1);
  assert.equal(
    (await outboxDatabase.listUnpublishedCommandEventOutboxRecords()).length,
    0,
  );
});

test('encounter success payloads are validated as authoritative turn-order responses', () => {
  const result = encounterCommandSuccessSchema.safeParse({
    ok: true,
    data: {
      encounter: {
        id: 'encounter_11111111-1111-4111-8111-111111111111',
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        status: 'active',
        participants: [
          {
            characterId: 'char_11111111-1111-4111-8111-111111111111',
            participantId: 'player-001',
            initiative: 2,
          },
        ],
        currentTurnIndex: 0,
        roundNumber: 1,
        currentTurnUsage: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          movementUsed: 0,
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    },
  });

  assert.equal(result.success, true);
});

test('duplicate mutating encounter commands return cached success without duplicate SSE', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const command = {
    commandId: 'idempotent-use-action-1',
    type: 'use_action',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  };
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const first = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
  );
  const second = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
  );
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdatesBefore,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'action_used');
});

test('duplicate attack commands do not reroll, double damage, or duplicate SSE', async () => {
  let rollCount = 0;
  const runtime = new InMemoryGameRuntime<InMemoryCharacterStore>(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => {
      rollCount += 1;
      return 20;
    },
  );
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { secondCharacterId, sessionId } =
    setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const command = {
    commandId: 'idempotent-attack-1',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      targetParticipantId: 'player-002',
    },
  };
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const combatEventsBefore = getCombatEvents(updates).length;
  const first = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
  );
  const second = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    command,
  );
  const target = runtime.characters.getCharacter(secondCharacterId);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(rollCount, 1);
  assert.equal(target.character.hp.current, 33);
  assert.equal(getEncounterUpdates(updates).length - encounterUpdatesBefore, 1);
  assert.equal(getCombatEvents(updates).length - combatEventsBefore, 1);
});

test('duplicate DM HP override commands return cached success without duplicate character_state', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { firstCharacterId, sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const command = {
    commandId: 'idempotent-dm-set-hp-1',
    type: 'dm_set_character_current_hp',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId: firstCharacterId,
      currentHp: 12,
    },
  };
  const characterUpdatesBefore = getCharacterStateUpdates(updates).length;
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const second = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const character = runtime.characters.getCharacter(firstCharacterId);
  const characterUpdates = getCharacterStateUpdates(updates).slice(
    characterUpdatesBefore,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(character.character.hp.current, 12);
  assert.equal(characterUpdates.length, 1);
  assert.equal(characterUpdates[0]?.reason, 'dm_hp_changed');
  assert.equal(characterUpdates[0]?.characterId, firstCharacterId);
  assert.equal(characterUpdates[0]?.hp.current, 12);
});

test('DM HP override command ID conflicts do not mutate HP or emit SSE', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { firstCharacterId, sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const firstCommand = {
    commandId: 'conflicting-dm-set-hp-1',
    type: 'dm_set_character_current_hp',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId: firstCharacterId,
      currentHp: 12,
    },
  };
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      ...firstCommand.payload,
      currentHp: 10,
    },
  };
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    firstCommand,
  );
  const characterUpdatesBeforeConflict =
    getCharacterStateUpdates(updates).length;
  const conflict = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    conflictingCommand,
  );
  const character = runtime.characters.getCharacter(firstCharacterId);

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  if (conflict.body.ok) {
    return;
  }
  assert.equal(conflict.body.error.code, 'command_id_conflict');
  assert.equal(character.character.hp.current, 12);
  assert.equal(
    getCharacterStateUpdates(updates).length,
    characterUpdatesBeforeConflict,
  );
});

test('duplicate DM condition tag commands return cached success without duplicate character_state', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { firstCharacterId, sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const command = {
    commandId: 'idempotent-dm-set-conditions-1',
    type: 'dm_set_character_active_conditions',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId: firstCharacterId,
      activeConditions: ['prone', 'frightened'],
    },
  };
  const characterUpdatesBefore = getCharacterStateUpdates(updates).length;
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const second = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const character = runtime.characters.getCharacter(firstCharacterId);
  const characterUpdates = getCharacterStateUpdates(updates).slice(
    characterUpdatesBefore,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.deepEqual(character.overlay.activeConditions, ['prone', 'frightened']);
  assert.equal(characterUpdates.length, 1);
  assert.equal(characterUpdates[0]?.reason, 'dm_conditions_changed');
  assert.deepEqual(characterUpdates[0]?.activeConditions, [
    'prone',
    'frightened',
  ]);
});

test('DM condition tag command ID conflicts do not mutate conditions or emit SSE', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { firstCharacterId, sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const firstCommand = {
    commandId: 'conflicting-dm-set-conditions-1',
    type: 'dm_set_character_active_conditions',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId: firstCharacterId,
      activeConditions: ['prone'],
    },
  };
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      ...firstCommand.payload,
      activeConditions: ['frightened'],
    },
  };
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    firstCommand,
  );
  const characterUpdatesBeforeConflict =
    getCharacterStateUpdates(updates).length;
  const conflict = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    conflictingCommand,
  );
  const character = runtime.characters.getCharacter(firstCharacterId);

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  if (conflict.body.ok) {
    return;
  }
  assert.equal(conflict.body.error.code, 'command_id_conflict');
  assert.deepEqual(character.overlay.activeConditions, ['prone']);
  assert.equal(
    getCharacterStateUpdates(updates).length,
    characterUpdatesBeforeConflict,
  );
});

test('duplicate DM reposition commands return cached success without duplicate movement_state', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { firstCharacterId, sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const command = {
    commandId: 'idempotent-dm-reposition-1',
    type: 'dm_reposition_character_in_active_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId: firstCharacterId,
      position: {
        x: 2,
        y: 2,
      },
    },
  };
  const movementUpdatesBefore = getMovementUpdates(updates).length;
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const second = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const movementUpdates = getMovementUpdates(updates).slice(
    movementUpdatesBefore,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(movementUpdates.length, 1);
  assert.equal(movementUpdates[0]?.reason, 'dm_character_repositioned');
  assert.deepEqual(movementUpdates[0]?.position, {
    x: 2,
    y: 2,
  });
});

test('DM reposition command ID conflicts do not mutate position or emit SSE', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { firstCharacterId, sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const firstCommand = {
    commandId: 'conflicting-dm-reposition-1',
    type: 'dm_reposition_character_in_active_scene',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      characterId: firstCharacterId,
      position: {
        x: 2,
        y: 2,
      },
    },
  };
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      ...firstCommand.payload,
      position: {
        x: 3,
        y: 3,
      },
    },
  };
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    firstCommand,
  );
  const movementUpdatesBeforeConflict = getMovementUpdates(updates).length;
  const conflict = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    conflictingCommand,
  );
  const character = runtime.characters.getCharacter(firstCharacterId);

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  if (conflict.body.ok) {
    return;
  }
  assert.equal(conflict.body.error.code, 'command_id_conflict');
  assert.deepEqual(character.overlay.position, {
    sceneId:
      runtime.sessions.getSessionSnapshot(sessionId).session.activeSceneId,
    x: 2,
    y: 2,
  });
  assert.equal(
    getMovementUpdates(updates).length,
    movementUpdatesBeforeConflict,
  );
});

test('duplicate DM turn usage override commands return cached success without duplicate encounter_state', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const command = {
    commandId: 'idempotent-dm-turn-usage-1',
    type: 'dm_set_current_turn_usage',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      turnUsage: {
        actionUsed: true,
        bonusActionUsed: true,
        reactionUsed: false,
        movementUsed: 25,
      },
    },
  };
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const second = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdatesBefore,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'dm_turn_usage_changed');

  if (!first.body.ok || !('encounter' in first.body.data)) {
    return;
  }

  assert.deepEqual(first.body.data.encounter.currentTurnUsage, {
    actionUsed: true,
    bonusActionUsed: true,
    reactionUsed: false,
    movementUsed: 25,
  });
});

test('DM turn usage override command ID conflicts do not mutate usage or emit SSE', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const firstCommand = {
    commandId: 'conflicting-dm-turn-usage-1',
    type: 'dm_set_current_turn_usage',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      turnUsage: {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: 25,
      },
    },
  };
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      ...firstCommand.payload,
      turnUsage: {
        actionUsed: true,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: 30,
      },
    },
  };
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    firstCommand,
  );
  const encounterUpdatesBeforeConflict = getEncounterUpdates(updates).length;
  const conflict = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    conflictingCommand,
  );
  const encounter = runtime.getEncounterState({
    commandId: 'read-after-dm-turn-usage-conflict',
    type: 'get_encounter_state',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  if (conflict.body.ok) {
    return;
  }
  assert.equal(conflict.body.error.code, 'command_id_conflict');
  assert.deepEqual(encounter.currentTurnUsage, {
    actionUsed: true,
    bonusActionUsed: false,
    reactionUsed: false,
    movementUsed: 25,
  });
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdatesBeforeConflict,
  );
});

test('duplicate DM current turn participant commands return cached success without duplicate encounter_state', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const encounter = runtime.getEncounterState({
    commandId: 'read-before-dm-current-turn-idempotency',
    type: 'get_encounter_state',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  });
  const currentParticipant =
    encounter.participants[encounter.currentTurnIndex]!;
  const requestedParticipant = encounter.participants.find(
    (participant) =>
      participant.participantId !== currentParticipant.participantId,
  )!;

  const command = {
    commandId: 'idempotent-dm-current-turn-1',
    type: 'dm_set_current_turn_participant',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId: requestedParticipant.participantId,
    },
  };
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const second = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdatesBefore,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'dm_current_turn_changed');

  if (!first.body.ok || !('encounter' in first.body.data)) {
    return;
  }

  assert.equal(
    first.body.data.encounter.participants[
      first.body.data.encounter.currentTurnIndex
    ]?.participantId,
    requestedParticipant.participantId,
  );
});

test('DM current turn participant command ID conflicts do not mutate turn or emit SSE', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);
  const encounter = runtime.getEncounterState({
    commandId: 'read-before-dm-current-turn-conflict',
    type: 'get_encounter_state',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  });
  const currentParticipant =
    encounter.participants[encounter.currentTurnIndex]!;
  const requestedParticipant = encounter.participants.find(
    (participant) =>
      participant.participantId !== currentParticipant.participantId,
  )!;

  const firstCommand = {
    commandId: 'conflicting-dm-current-turn-1',
    type: 'dm_set_current_turn_participant',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
      participantId: requestedParticipant.participantId,
    },
  };
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      ...firstCommand.payload,
      participantId: currentParticipant.participantId,
    },
  };
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    firstCommand,
  );
  const encounterUpdatesBeforeConflict = getEncounterUpdates(updates).length;
  const conflict = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    conflictingCommand,
  );
  const updatedEncounter = runtime.getEncounterState({
    commandId: 'read-after-dm-current-turn-conflict',
    type: 'get_encounter_state',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  if (conflict.body.ok) {
    return;
  }
  assert.equal(conflict.body.error.code, 'command_id_conflict');
  assert.equal(
    updatedEncounter.participants[updatedEncounter.currentTurnIndex]
      ?.participantId,
    requestedParticipant.participantId,
  );
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdatesBeforeConflict,
  );
});

test('duplicate DM encounter end commands return cached success without duplicate encounter_state', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const command = {
    commandId: 'idempotent-dm-end-encounter-1',
    type: 'dm_end_active_encounter',
    actor: {
      participantId: 'dm-001',
    },
    payload: {
      sessionId,
    },
  };
  const encounterUpdatesBefore = getEncounterUpdates(updates).length;
  const first = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const second = await postJson<DmCommandResponse>(
    runtime,
    idempotency,
    '/api/dm/command',
    command,
  );
  const encounterUpdates = getEncounterUpdates(updates).slice(
    encounterUpdatesBefore,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(encounterUpdates.length, 1);
  assert.equal(encounterUpdates[0]?.reason, 'encounter_ended');

  if (!first.body.ok || !('encounter' in first.body.data)) {
    return;
  }

  assert.equal(first.body.data.encounter.status, 'ended');
});

test('command ID conflicts are rejected without runtime mutation or SSE', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);
  const updates = subscribeToSessionEvents(runtime, sessionId);

  const firstCommand = {
    commandId: 'conflicting-record-movement-1',
    type: 'record_movement_usage',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      amountFeet: 5,
    },
  };
  const conflictingCommand = {
    ...firstCommand,
    payload: {
      sessionId,
      amountFeet: 10,
    },
  };
  const first = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    firstCommand,
  );
  const encounterUpdatesBeforeConflict = getEncounterUpdates(updates).length;
  const conflict = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    conflictingCommand,
  );
  const encounter = runtime.getEncounterState({
    commandId: 'read-after-conflict',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });

  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  if (conflict.body.ok) {
    return;
  }
  assert.equal(conflict.body.error.code, 'command_id_conflict');
  assert.equal(encounter.currentTurnUsage.movementUsed, 5);
  assert.equal(
    getEncounterUpdates(updates).length,
    encounterUpdatesBeforeConflict,
  );
});

test('read commands are not cached as idempotent mutations', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { sessionId } = setupEncounterForIdempotency(runtime);

  const readCommand = {
    commandId: 'repeat-read-encounter-1',
    type: 'get_encounter_state',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  };
  const firstRead = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    readCommand,
  );

  await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    {
      commandId: 'mutate-between-repeat-reads',
      type: 'use_action',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
      },
    },
  );

  const secondRead = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    readCommand,
  );

  assert.equal(firstRead.status, 200);
  assert.equal(secondRead.status, 200);
  assert.equal(firstRead.body.ok, true);
  assert.equal(secondRead.body.ok, true);
  if (!firstRead.body.ok || !secondRead.body.ok) {
    return;
  }
  assert.equal(
    firstRead.body.data.encounter.currentTurnUsage.actionUsed,
    false,
  );
  assert.equal(
    secondRead.body.data.encounter.currentTurnUsage.actionUsed,
    true,
  );
});

test('reconnect returns the current session snapshot with active scene and character assignments', async () => {
  const runtime = new InMemoryGameRuntime();
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { firstCharacterId, secondCharacterId, sessionId } =
    setupEncounterForIdempotency(runtime);

  const reconnect = await postJson<SessionCommandResponse>(
    runtime,
    idempotency,
    '/api/session/command',
    {
      commandId: 'reconnect-snapshot-consistency-1',
      type: 'reconnect_session',
      actor: {
        participantId: 'player-001',
      },
      payload: {
        sessionId,
      },
    },
  );

  assert.equal(reconnect.status, 200);
  assert.equal(reconnect.body.ok, true);

  if (!reconnect.body.ok) {
    return;
  }

  const playerOne = reconnect.body.data.state.participants.find(
    (participant) => participant.id === 'player-001',
  );
  const playerTwo = reconnect.body.data.state.participants.find(
    (participant) => participant.id === 'player-002',
  );

  assert.equal(reconnect.body.data.sessionId, sessionId);
  assert.equal(reconnect.body.data.participantId, 'player-001');
  assert.ok(reconnect.body.data.streamPath.includes(sessionId));
  assert.ok(reconnect.body.data.streamPath.includes('player-001'));
  assert.notEqual(reconnect.body.data.state.session.activeSceneId, null);
  assert.equal(playerOne?.characterId, firstCharacterId);
  assert.equal(playerTwo?.characterId, secondCharacterId);
});

test('reconnecting participants can recover movement, encounter, and character HP through read models', async () => {
  const runtime = new InMemoryGameRuntime<InMemoryCharacterStore>(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => 20,
  );
  const idempotency = new InMemoryCommandIdempotencyStore();
  const { secondCharacterId, sessionId } =
    setupEncounterForIdempotency(runtime);

  runtime.moveCharacterInActiveScene({
    commandId: 'reconnect-move-before-read',
    type: 'move_character_in_active_scene',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      participantId: 'player-001',
      position: {
        x: 1,
        y: 1,
      },
    },
  });
  runtime.attack({
    commandId: 'reconnect-attack-before-read',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      targetParticipantId: 'player-002',
    },
  });

  await postJson<SessionCommandResponse>(
    runtime,
    idempotency,
    '/api/session/command',
    {
      commandId: 'reconnect-before-read-models',
      type: 'reconnect_session',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
      },
    },
  );

  const activeSceneRead = await postJson<MovementCommandResponse>(
    runtime,
    idempotency,
    '/api/movement/command',
    {
      commandId: 'read-active-scene-after-reconnect',
      type: 'get_active_scene_state',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
      },
    },
  );
  const encounterRead = await postJson<EncounterCommandResponse>(
    runtime,
    idempotency,
    '/api/encounters/command',
    {
      commandId: 'read-encounter-after-reconnect',
      type: 'get_encounter_state',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
      },
    },
  );
  const characterRead = await postJson<CharacterCommandResponse>(
    runtime,
    idempotency,
    '/api/characters/command',
    {
      commandId: 'read-character-hp-after-reconnect',
      type: 'get_character',
      actor: {
        participantId: 'player-002',
      },
      payload: {
        sessionId,
        characterId: secondCharacterId,
      },
    },
  );

  assert.equal(activeSceneRead.status, 200);
  assert.equal(activeSceneRead.body.ok, true);
  assert.equal(encounterRead.status, 200);
  assert.equal(encounterRead.body.ok, true);
  assert.equal(characterRead.status, 200);
  assert.equal(characterRead.body.ok, true);

  if (
    !activeSceneRead.body.ok ||
    !encounterRead.body.ok ||
    !characterRead.body.ok
  ) {
    return;
  }

  assert.ok('placedCharacters' in activeSceneRead.body.data);
  assert.ok('character' in characterRead.body.data);

  const playerOnePlacement = activeSceneRead.body.data.placedCharacters.find(
    (placement) => placement.participantId === 'player-001',
  );
  const playerTwoPlacement = activeSceneRead.body.data.placedCharacters.find(
    (placement) => placement.participantId === 'player-002',
  );

  assert.deepEqual(playerOnePlacement?.position, {
    x: 1,
    y: 1,
  });
  assert.deepEqual(playerTwoPlacement?.position, {
    x: 1,
    y: 0,
  });
  assert.equal(encounterRead.body.data.encounter.currentTurnIndex, 0);
  assert.equal(encounterRead.body.data.encounter.roundNumber, 1);
  assert.equal(encounterRead.body.data.encounter.participants.length, 2);
  assert.equal(
    encounterRead.body.data.encounter.currentTurnUsage.actionUsed,
    true,
  );
  assert.equal(
    encounterRead.body.data.encounter.currentTurnUsage.movementUsed,
    10,
  );
  assert.equal(characterRead.body.data.character.hp.current, 33);
});

test('reconnected SSE subscribers receive current session state without combat event replay', () => {
  const runtime = new InMemoryGameRuntime<InMemoryCharacterStore>(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => 20,
  );
  const { firstCharacterId, sessionId } = setupEncounterForIdempotency(runtime);
  const liveUpdates: SessionStreamEvent[] = [];
  const reconnectUpdates: SessionStreamEvent[] = [];

  runtime.connectParticipant(sessionId, 'player-001', {
    connectionId: 'player-001-live-stream',
    close: () => undefined,
    send: (update) => {
      liveUpdates.push(update);
    },
  });
  runtime.attack({
    commandId: 'attack-before-sse-reconnect',
    type: 'attack',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
      targetParticipantId: 'player-002',
    },
  });

  assert.equal(
    liveUpdates.some((update) => update.type === 'combat_event'),
    true,
  );

  runtime.reconnectSession({
    commandId: 'reconnect-before-sse-resubscribe',
    type: 'reconnect_session',
    actor: {
      participantId: 'player-001',
    },
    payload: {
      sessionId,
    },
  });
  runtime.connectParticipant(sessionId, 'player-001', {
    connectionId: 'player-001-reconnected-stream',
    close: () => undefined,
    send: (update) => {
      reconnectUpdates.push(update);
    },
  });

  assert.equal(reconnectUpdates.length, 1);
  assert.equal(reconnectUpdates[0]?.type, 'session_state');
  assert.equal(reconnectUpdates[0]?.reason, 'initial_sync');

  if (reconnectUpdates[0]?.type !== 'session_state') {
    return;
  }

  const playerOne = reconnectUpdates[0].state.participants.find(
    (participant) => participant.id === 'player-001',
  );

  assert.equal(reconnectUpdates[0].state.session.id, sessionId);
  assert.notEqual(reconnectUpdates[0].state.session.activeSceneId, null);
  assert.equal(playerOne?.characterId, firstCharacterId);
  assert.equal(
    reconnectUpdates.some((update) => update.type === 'combat_event'),
    false,
  );
});

test('connected subscribers receive synchronized session state updates', () => {
  const store = new InMemorySessionStore();
  const created = store.createSession({
    commandId: 'create-1',
    type: 'create_session',
    actor: {
      participantId: 'dm-001',
      displayName: 'Dungeon Master',
      role: 'dm',
    },
    payload: {
      rulesProfileId: 'dnd5e-2024-core',
    },
  });
  const receivedUpdates: SessionStreamEvent[] = [];

  store.connectParticipant(created.sessionId, 'dm-001', {
    connectionId: 'dm-connection-1',
    close: () => undefined,
    send: (update) => {
      receivedUpdates.push(update);
    },
  });

  store.joinSession({
    commandId: 'join-1',
    type: 'join_session',
    actor: {
      participantId: 'player-001',
      displayName: 'Player One',
      role: 'player',
    },
    payload: {
      sessionId: created.sessionId,
    },
  });

  const latestUpdate = receivedUpdates.at(-1);

  assert.ok(latestUpdate);
  assert.equal(latestUpdate?.type, 'session_state');

  if (!latestUpdate || latestUpdate.type !== 'session_state') {
    return;
  }

  assert.equal(latestUpdate.reason, 'participant_joined');
  assert.equal(latestUpdate.state.participants.length, 2);
  assert.equal(
    latestUpdate.state.participants.find(
      (participant) => participant.id === 'player-001',
    )?.connectionStatus,
    'disconnected',
  );
  assert.equal(latestUpdate.revision, 3);
});

test('movement session-stream updates are validated as a narrow realtime payload', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'movement_state',
    reason: 'character_moved',
    sessionId: 'ABC123',
    activeSceneId: 'scene_11111111-1111-4111-8111-111111111111',
    participantId: 'player-001',
    characterId: 'char_11111111-1111-4111-8111-111111111111',
    position: {
      x: 2,
      y: 3,
    },
    footprint: {
      width: 1,
      height: 1,
    },
  });

  assert.equal(result.success, true);
});

test('encounter session-stream updates are validated as authoritative realtime payloads', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'encounter_state',
    reason: 'turn_advanced',
    sessionId: 'ABC123',
    encounter: {
      id: 'encounter_11111111-1111-4111-8111-111111111111',
      sessionId: 'ABC123',
      sceneId: 'scene_11111111-1111-4111-8111-111111111111',
      status: 'active',
      participants: [
        {
          characterId: 'char_11111111-1111-4111-8111-111111111111',
          participantId: 'player-001',
          initiative: 2,
        },
      ],
      currentTurnIndex: 0,
      roundNumber: 2,
      currentTurnUsage: {
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        movementUsed: 0,
      },
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:01:00.000Z',
    },
  });

  assert.equal(result.success, true);
});

test('combat session-stream updates are validated as authoritative attack payloads', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'combat_event',
    reason: 'attack_resolved',
    sessionId: 'ABC123',
    encounterId: 'encounter_11111111-1111-4111-8111-111111111111',
    attackerParticipantId: 'player-001',
    attackerCharacterId: 'char_11111111-1111-4111-8111-111111111111',
    targetParticipantId: 'player-002',
    targetCharacterId: 'char_22222222-2222-4222-8222-222222222222',
    roll: {
      d20: 14,
      modifier: 2,
      total: 16,
    },
    targetArmorClass: 16,
    hit: true,
    damage: 1,
    targetHp: {
      previous: 10,
      current: 9,
    },
  });

  assert.equal(result.success, true);
});

test('character session-stream updates are validated as authoritative HP payloads', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'character_state',
    reason: 'dm_hp_changed',
    sessionId: 'ABC123',
    participantId: 'player-001',
    characterId: 'char_11111111-1111-4111-8111-111111111111',
    hp: {
      max: 26,
      current: 12,
      temp: 0,
    },
  });

  assert.equal(result.success, true);
});

test('character session-stream updates validate condition tag payloads', () => {
  const result = sessionStreamEventSchema.safeParse({
    type: 'character_state',
    reason: 'dm_conditions_changed',
    sessionId: 'ABC123',
    participantId: 'player-001',
    characterId: 'char_11111111-1111-4111-8111-111111111111',
    hp: {
      max: 26,
      current: 12,
      temp: 0,
    },
    activeConditions: ['prone', 'frightened'],
  });

  assert.equal(result.success, true);
});

test('active-scene state success payloads are validated as a narrow read model', () => {
  const result = activeSceneStateCommandSuccessSchema.safeParse({
    ok: true,
    data: {
      sessionId: 'ABC123',
      activeSceneId: 'scene_11111111-1111-4111-8111-111111111111',
      placedCharacters: [
        {
          characterId: 'char_11111111-1111-4111-8111-111111111111',
          participantId: 'player-001',
          position: {
            x: 2,
            y: 3,
          },
          footprint: {
            width: 1,
            height: 1,
          },
        },
      ],
    },
  });

  assert.equal(result.success, true);
});
