/**
 * Persistence-specific behaviour, against a real PostgreSQL.
 *
 * Deliberately not a copy of the in-memory suite. Everything about *what* the
 * M1 rules are is already proved without a database in `session-table-state`,
 * `session-m1-table-http` and their neighbours. What only Postgres can answer
 * is whether the constraints hold, whether a transaction that fails leaves
 * nothing behind, and whether a record written as jsonb comes back as the same
 * protocol object.
 *
 * Not part of `pnpm test`: the file is `.dbtest.ts`, which the default glob
 * does not match. Run it with `pnpm --filter @dnd/server test:db` and a
 * `DATABASE_URL`, which is what the PostgreSQL CI job does. A skipped database
 * test that reported success would be worse than no test.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';

import {
  createNodePostgresDndDatabaseConnection,
  DrizzleDndDatabaseUnitOfWork,
  DrizzleSessionSeatOwnershipDatabase,
  DrizzleSessionTableStateDatabase,
  type DndDatabase,
} from '@dnd/db';
import type {
  DiceResolution,
  PlayerIntent,
  ResolutionRequest,
} from '@dnd/protocol';

import {
  DbBackedSessionTableStateStore,
  loadSessionTableState,
} from './db-session-table-state-store.js';
import { MAX_RETAINED_RESOLUTIONS } from './session-table-state.js';

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required for the M1 persistence tests. These are not skippable: run them with a migrated database or do not run this file.',
  );
}

let connection: ReturnType<typeof createNodePostgresDndDatabaseConnection>;
let db: DndDatabase;
const createdSessionIds: string[] = [];

before(() => {
  connection = createNodePostgresDndDatabaseConnection(databaseUrl);
  db = connection.db;
});

after(async () => {
  // Each test owns a unique session ID, so cleanup is scoped rather than a
  // truncate that would wipe a developer's local table.
  for (const sessionId of createdSessionIds) {
    await db.execute(
      `delete from session_dice_resolutions where session_id = '${sessionId}'`,
    );
    await db.execute(
      `delete from session_resolution_requests where session_id = '${sessionId}'`,
    );
    await db.execute(
      `delete from session_player_intents where session_id = '${sessionId}'`,
    );
  }

  await connection.close();
});

function newSessionId(): string {
  const sessionId = `T${randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase()}`;

  createdSessionIds.push(sessionId);

  return sessionId;
}

function makeRequest(
  sessionId: string,
  overrides: Partial<ResolutionRequest> = {},
): ResolutionRequest {
  return {
    ability: 'dex',
    createdAt: new Date().toISOString(),
    dc: 14,
    id: `resolution_${randomUUID()}`,
    kind: 'ability_check',
    requestedByParticipantId: 'dm-001',
    sessionId,
    stance: 'normal',
    status: 'pending',
    targetCharacterId: `char_${randomUUID()}`,
    targetParticipantId: 'player-001',
    ...overrides,
  };
}

function makeResolution(
  sessionId: string,
  request: ResolutionRequest,
  overrides: Partial<DiceResolution> = {},
): DiceResolution {
  return {
    ability: 'dex',
    actorCharacterId: request.targetCharacterId,
    actorParticipantId: 'player-001',
    commandId: `cmd-${randomUUID()}`,
    critical: false,
    criticalMiss: false,
    dc: request.dc,
    dice: [11],
    id: `resolution_${randomUUID()}`,
    kind: 'ability_check',
    modifierTotal: 2,
    modifiers: [{ detail: 'dex', kind: 'ability', value: 2 }],
    requestId: request.id,
    resolvedAt: new Date().toISOString(),
    rulesProfileId: 'dnd5e-2024-core',
    selectedDie: 11,
    sessionId,
    stance: 'normal',
    success: false,
    total: 13,
    ...overrides,
  };
}

function makeIntent(
  sessionId: string,
  overrides: Partial<PlayerIntent> = {},
): PlayerIntent {
  const now = new Date().toISOString();

  return {
    authorParticipantId: 'player-001',
    createdAt: now,
    id: `intent_${randomUUID()}`,
    sessionId,
    status: 'pending',
    text: 'من به سمت در می‌روم.',
    updatedAt: now,
    ...overrides,
  };
}

async function writeState(
  sessionId: string,
  state: {
    intents?: PlayerIntent[];
    requests?: ResolutionRequest[];
    resolutions?: DiceResolution[];
  },
): Promise<void> {
  const store = await DbBackedSessionTableStateStore.fromDatabase(
    new DrizzleSessionTableStateDatabase(db),
  );

  store.set(sessionId, {
    intents: state.intents ?? [],
    requests: state.requests ?? [],
    resolutions: state.resolutions ?? [],
  });

  await store.flushPendingWrites();
}

test('a request, a roll and an intent round-trip through jsonb as protocol objects', async () => {
  const sessionId = newSessionId();
  const request = makeRequest(sessionId);
  const resolution = makeResolution(sessionId, request);
  const resolvedRequest: ResolutionRequest = {
    ...request,
    resolutionId: resolution.id,
    resolvedAt: resolution.resolvedAt,
    status: 'resolved',
  };
  const intent = makeIntent(sessionId);

  await writeState(sessionId, {
    intents: [intent],
    requests: [resolvedRequest],
    resolutions: [resolution],
  });

  const loaded = await loadSessionTableState(
    new DrizzleSessionTableStateDatabase(db),
    sessionId,
  );

  assert.deepEqual(loaded.requests, [resolvedRequest]);
  assert.deepEqual(loaded.resolutions, [resolution]);
  assert.deepEqual(loaded.intents, [intent]);
  assert.equal(
    loaded.intents[0]?.text,
    intent.text,
    'Persian prose survives the round trip byte for byte',
  );
});

// The state layer refuses a second roll first. This asserts the database would
// refuse it too, which is what makes the rule survive a bug above it.
test('the database refuses a second roll for one request', async () => {
  const sessionId = newSessionId();
  const request = makeRequest(sessionId);
  const first = makeResolution(sessionId, request);

  await writeState(sessionId, { requests: [request], resolutions: [first] });

  const database = new DrizzleSessionTableStateDatabase(db);

  await assert.rejects(
    () =>
      database.insertSessionDiceResolution({
        actorCharacterId: null,
        actorParticipantId: 'player-001',
        commandId: 'cmd-second',
        kind: 'ability_check',
        requestId: request.id,
        resolution: { id: 'second' },
        resolutionId: `resolution_${randomUUID()}`,
        resolvedAt: new Date(),
        rulesProfileId: 'dnd5e-2024-core',
        sessionId,
      }),
    /duplicate key|unique/i,
  );
});

test('a resolved request must carry a resolution ID and an unresolved one must not', async () => {
  const sessionId = newSessionId();
  const database = new DrizzleSessionTableStateDatabase(db);
  const request = makeRequest(sessionId);

  await assert.rejects(
    () =>
      database.upsertSessionResolutionRequest({
        createdAt: new Date(),
        kind: request.kind,
        request: { ...request, status: 'resolved' } as never,
        requestId: request.id,
        requestedByParticipantId: request.requestedByParticipantId,
        resolutionId: null,
        sessionId,
        status: 'resolved',
        targetCharacterId: null,
        targetParticipantId: request.targetParticipantId,
      }),
    /session_resolution_requests_resolved_has_resolution/,
  );

  await assert.rejects(
    () =>
      database.upsertSessionResolutionRequest({
        createdAt: new Date(),
        kind: request.kind,
        request: request as never,
        requestId: request.id,
        requestedByParticipantId: request.requestedByParticipantId,
        resolutionId: `resolution_${randomUUID()}`,
        sessionId,
        status: 'cancelled',
        targetCharacterId: null,
        targetParticipantId: request.targetParticipantId,
      }),
    /session_resolution_requests_resolved_has_resolution/,
    'a cancelled request cannot carry a dice result',
  );
});

test('an unknown resolution kind is refused by the check constraint', async () => {
  const sessionId = newSessionId();
  const request = makeRequest(sessionId);

  await assert.rejects(
    () =>
      new DrizzleSessionTableStateDatabase(db).upsertSessionResolutionRequest({
        createdAt: new Date(),
        kind: 'vibes_check',
        request: request as never,
        requestId: request.id,
        requestedByParticipantId: 'dm-001',
        resolutionId: null,
        sessionId,
        status: 'pending',
        targetCharacterId: null,
        targetParticipantId: 'player-001',
      }),
    /session_resolution_requests_kind_check/,
  );
});

test('audit reads are bounded to the retained working set, newest last', async () => {
  const sessionId = newSessionId();
  const overflow = MAX_RETAINED_RESOLUTIONS + 5;
  const requests: ResolutionRequest[] = [];
  const resolutions: DiceResolution[] = [];
  const base = Date.now();

  for (let index = 0; index < overflow; index += 1) {
    const request = makeRequest(sessionId, {
      createdAt: new Date(base + index).toISOString(),
    });

    requests.push(request);
    resolutions.push(
      makeResolution(sessionId, request, {
        resolvedAt: new Date(base + index).toISOString(),
        total: index,
      }),
    );
  }

  await writeState(sessionId, { requests, resolutions });

  const loaded = await loadSessionTableState(
    new DrizzleSessionTableStateDatabase(db),
    sessionId,
  );

  assert.equal(loaded.resolutions.length, MAX_RETAINED_RESOLUTIONS);
  assert.equal(
    loaded.resolutions.at(-1)?.total,
    overflow - 1,
    'the newest roll is last, so the working set is the recent one',
  );
  assert.ok(
    (loaded.resolutions[0]?.total ?? 0) > 0,
    'the oldest rolls fell out of the working set rather than the database',
  );
});

// Atomicity through the real transaction, not a mock of one. A failure after
// the writes must leave the table exactly as it was.
test('a failed transaction leaves no M1 rows behind', async () => {
  const sessionId = newSessionId();
  const unitOfWork = new DrizzleDndDatabaseUnitOfWork(db);
  const request = makeRequest(sessionId);
  const intent = makeIntent(sessionId);

  await assert.rejects(
    () =>
      unitOfWork.transaction(async (context) => {
        const store = await DbBackedSessionTableStateStore.fromDatabase(
          context.tableState,
        );

        store.set(sessionId, {
          intents: [intent],
          requests: [request],
          resolutions: [],
        });

        await store.flushPendingWrites();

        throw new Error('Simulated failure after the M1 writes.');
      }),
    /Simulated failure/,
  );

  const loaded = await loadSessionTableState(
    new DrizzleSessionTableStateDatabase(db),
    sessionId,
  );

  assert.deepEqual(loaded.requests, []);
  assert.deepEqual(loaded.intents, []);
});

test('a committed transaction keeps every M1 row it wrote', async () => {
  const sessionId = newSessionId();
  const unitOfWork = new DrizzleDndDatabaseUnitOfWork(db);
  const request = makeRequest(sessionId);
  const intent = makeIntent(sessionId);

  await unitOfWork.transaction(async (context) => {
    const store = await DbBackedSessionTableStateStore.fromDatabase(
      context.tableState,
    );

    store.set(sessionId, {
      intents: [intent],
      requests: [request],
      resolutions: [],
    });

    await store.flushPendingWrites();
  });

  const loaded = await loadSessionTableState(
    new DrizzleSessionTableStateDatabase(db),
    sessionId,
  );

  assert.deepEqual(loaded.requests, [request]);
  assert.deepEqual(loaded.intents, [intent]);
});

// The seat claim is conditional in SQL rather than a read-then-write, so two
// processes racing for one chair cannot both believe they won.
test('a seat claim refuses a second account at the database', async () => {
  const seats = new DrizzleSessionSeatOwnershipDatabase(db);
  const sessionId = newSessionId();
  const ownerId = `user_${randomUUID()}`;
  const intruderId = `user_${randomUUID()}`;

  await db.execute(
    `insert into auth_users (user_id, email, display_name, owner_participant_id, password_hash)
     values ('${ownerId}', '${`seat-${randomUUID()}@example.test`}', 'Seat Owner', '${`owner_${randomUUID()}`}', 'x')`,
  );
  await db.execute(
    `insert into auth_users (user_id, email, display_name, owner_participant_id, password_hash)
     values ('${intruderId}', '${`seat-${randomUUID()}@example.test`}', 'Seat Intruder', '${`owner_${randomUUID()}`}', 'x')`,
  );

  try {
    const claimed = await seats.claimSessionSeatOwnership({
      boundAt: new Date(),
      participantId: 'player-001',
      sessionId,
      userId: ownerId,
    });

    assert.equal(claimed?.userId, ownerId);

    const reaffirmed = await seats.claimSessionSeatOwnership({
      boundAt: new Date(),
      participantId: 'player-001',
      sessionId,
      userId: ownerId,
    });

    assert.equal(reaffirmed?.userId, ownerId, 'the owner may re-affirm');

    const stolen = await seats.claimSessionSeatOwnership({
      boundAt: new Date(),
      participantId: 'player-001',
      sessionId,
      userId: intruderId,
    });

    assert.equal(stolen, null, 'a second account updates no row');
    assert.equal(
      (await seats.getSessionSeatOwnership(sessionId, 'player-001'))?.userId,
      ownerId,
      'the binding still names the original owner',
    );
  } finally {
    await db.execute(
      `delete from auth_users where user_id in ('${ownerId}', '${intruderId}')`,
    );
  }
});

test('deleting the owning account releases its seats', async () => {
  const seats = new DrizzleSessionSeatOwnershipDatabase(db);
  const sessionId = newSessionId();
  const userId = `user_${randomUUID()}`;

  await db.execute(
    `insert into auth_users (user_id, email, display_name, owner_participant_id, password_hash)
     values ('${userId}', '${`seat-${randomUUID()}@example.test`}', 'Cascade Owner', '${`owner_${randomUUID()}`}', 'x')`,
  );
  await seats.claimSessionSeatOwnership({
    boundAt: new Date(),
    participantId: 'dm-001',
    sessionId,
    userId,
  });

  await db.execute(`delete from auth_users where user_id = '${userId}'`);

  assert.equal(
    await seats.getSessionSeatOwnership(sessionId, 'dm-001'),
    null,
    'the seat binding cascaded with the account',
  );
});
