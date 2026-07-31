import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DiceResolution,
  PlayerIntent,
  ResolutionRequest,
} from '@dnd/protocol';

import {
  MAX_RETAINED_RESOLUTIONS,
  SessionTableStateError,
  addPlayerIntent,
  addResolutionRequest,
  cancelResolutionRequest,
  createSessionTableState,
  projectTableStateForRole,
  recordResolution,
  requirePendingRequestFor,
  updatePlayerIntentStatus,
} from './session-table-state.js';

const sessionId = 'ABC123';
const requestId = 'resolution_11111111-1111-4111-8111-111111111111';
const resolutionId = 'resolution_22222222-2222-4222-8222-222222222222';
const intentId = 'intent_33333333-3333-4333-8333-333333333333';

function makeRequest(
  overrides: Partial<ResolutionRequest> = {},
): ResolutionRequest {
  return {
    ability: 'dex',
    createdAt: '2026-07-31T12:00:00.000Z',
    dc: 15,
    id: requestId,
    kind: 'ability_check',
    requestedByParticipantId: 'dm-001',
    sessionId,
    stance: 'normal',
    status: 'pending',
    targetParticipantId: 'player-001',
    ...overrides,
  };
}

function makeResolution(
  overrides: Partial<DiceResolution> = {},
): DiceResolution {
  return {
    ability: 'dex',
    actorParticipantId: 'player-001',
    commandId: 'web-submit-1',
    dc: 15,
    dice: [12],
    id: resolutionId,
    kind: 'ability_check',
    modifiers: [{ kind: 'ability', value: 3 }],
    modifierTotal: 3,
    resolvedAt: '2026-07-31T12:00:05.000Z',
    rulesProfileId: 'dnd5e-2024-core',
    selectedDie: 12,
    sessionId,
    stance: 'normal',
    success: true,
    total: 15,
    ...overrides,
  };
}

function makeIntent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
  return {
    authorParticipantId: 'player-001',
    createdAt: '2026-07-31T12:00:00.000Z',
    id: intentId,
    sessionId,
    status: 'pending',
    text: 'I search the altar.',
    updatedAt: '2026-07-31T12:00:00.000Z',
    ...overrides,
  };
}

test('a request is recorded as pending', () => {
  const state = addResolutionRequest(createSessionTableState(), makeRequest());

  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0]!.status, 'pending');
});

test('only the addressed seat can answer a request', () => {
  const state = addResolutionRequest(createSessionTableState(), makeRequest());

  assert.doesNotThrow(() =>
    requirePendingRequestFor(state, requestId, 'player-001'),
  );
  assert.throws(
    () => requirePendingRequestFor(state, requestId, 'player-002'),
    (error: SessionTableStateError) =>
      error.code === 'invalid_resolution_target',
  );
});

// Re-answering would let a player rebuild a failed roll until it succeeded,
// which is the entire reason the server rolls in the first place.
test('a resolved request cannot be answered again', () => {
  const resolved = recordResolution(
    addResolutionRequest(createSessionTableState(), makeRequest()),
    {
      request: makeRequest(),
      resolution: makeResolution(),
      resolvedAt: '2026-07-31T12:00:05.000Z',
    },
  );

  assert.equal(resolved.requests[0]!.status, 'resolved');
  assert.equal(resolved.requests[0]!.resolutionId, resolutionId);
  assert.throws(
    () => requirePendingRequestFor(resolved, requestId, 'player-001'),
    (error: SessionTableStateError) =>
      error.code === 'resolution_request_already_resolved',
  );
});

test('a cancelled request cannot be answered', () => {
  const cancelled = cancelResolutionRequest(
    addResolutionRequest(createSessionTableState(), makeRequest()),
    requestId,
  );

  assert.equal(cancelled.requests[0]!.status, 'cancelled');
  assert.throws(
    () => requirePendingRequestFor(cancelled, requestId, 'player-001'),
    (error: SessionTableStateError) =>
      error.code === 'resolution_request_already_resolved',
  );
  assert.throws(
    () => cancelResolutionRequest(cancelled, requestId),
    (error: SessionTableStateError) =>
      error.code === 'resolution_request_already_resolved',
  );
});

test('an unknown request is reported rather than ignored', () => {
  assert.throws(
    () => requirePendingRequestFor(createSessionTableState(), requestId, 'p'),
    (error: SessionTableStateError) =>
      error.code === 'resolution_request_not_found',
  );
});

test('checks and saves stay semantically distinct in stored state', () => {
  const state = addResolutionRequest(
    addResolutionRequest(createSessionTableState(), makeRequest()),
    makeRequest({
      id: 'resolution_44444444-4444-4444-8444-444444444444',
      kind: 'saving_throw',
    }),
  );

  assert.deepEqual(
    state.requests.map((request) => request.kind),
    ['ability_check', 'saving_throw'],
  );
});

test('an intent moves through GM outcomes and keeps its note', () => {
  const state = updatePlayerIntentStatus(
    addPlayerIntent(createSessionTableState(), makeIntent()),
    {
      gmNote: 'You find a catch.',
      intentId,
      status: 'resolved',
      updatedAt: '2026-07-31T12:01:00.000Z',
    },
  );

  assert.equal(state.intents[0]!.status, 'resolved');
  assert.equal(state.intents[0]!.gmNote, 'You find a catch.');
  assert.equal(
    state.intents[0]!.text,
    'I search the altar.',
    'author text is untouched',
  );
});

test('an unknown intent is reported', () => {
  assert.throws(
    () =>
      updatePlayerIntentStatus(createSessionTableState(), {
        intentId,
        status: 'resolved',
        updatedAt: '2026-07-31T12:01:00.000Z',
      }),
    (error: SessionTableStateError) => error.code === 'player_intent_not_found',
  );
});

// ------------------------------------------------------------- projection

test('the DM sees the whole table', () => {
  const state = addPlayerIntent(
    addResolutionRequest(createSessionTableState(), makeRequest()),
    makeIntent(),
  );
  const projected = projectTableStateForRole(state, 'dm', 'dm-001');

  assert.equal(projected.requests.length, 1);
  assert.equal(projected.intents.length, 1);
});

// A request addressed elsewhere carries a DC and a GM reason that telegraphs
// what is coming, so it is withheld from seats it was not sent to.
test('a player sees only requests addressed to them', () => {
  const state = addResolutionRequest(
    addResolutionRequest(createSessionTableState(), makeRequest()),
    makeRequest({
      id: 'resolution_55555555-5555-4555-8555-555555555555',
      reason: 'The floor gives way under Borin',
      targetParticipantId: 'player-002',
    }),
  );
  const projected = projectTableStateForRole(state, 'player', 'player-001');

  assert.equal(projected.requests.length, 1);
  assert.equal(projected.requests[0]!.targetParticipantId, 'player-001');
  assert.equal(
    JSON.stringify(projected).includes('The floor gives way under Borin'),
    false,
    "another seat's GM reason must not leak",
  );
});

test('a player sees only their own intents', () => {
  const state = addPlayerIntent(
    addPlayerIntent(createSessionTableState(), makeIntent()),
    makeIntent({
      authorParticipantId: 'player-002',
      id: 'intent_66666666-6666-4666-8666-666666666666',
      text: 'I whisper to the guard captain.',
    }),
  );
  const projected = projectTableStateForRole(state, 'player', 'player-001');

  assert.equal(projected.intents.length, 1);
  assert.equal(
    JSON.stringify(projected).includes('I whisper to the guard captain'),
    false,
  );
});

// A die landing on the table is heard by everyone; hiding other seats' results
// would make the shared audit useless.
test('resolved rolls are public to every seat', () => {
  const state = recordResolution(
    addResolutionRequest(createSessionTableState(), makeRequest()),
    {
      request: makeRequest(),
      resolution: makeResolution({ actorParticipantId: 'player-002' }),
      resolvedAt: '2026-07-31T12:00:05.000Z',
    },
  );
  const projected = projectTableStateForRole(state, 'player', 'player-001');

  assert.equal(projected.resolutions.length, 1);
});

test('a projection is a copy, so a client view cannot mutate the table', () => {
  const state = addResolutionRequest(createSessionTableState(), makeRequest());
  const projected = projectTableStateForRole(state, 'dm', 'dm-001');

  projected.requests[0]!.dc = 1;

  assert.equal(state.requests[0]!.dc, 15);
});

test('retained history is bounded', () => {
  let state = createSessionTableState();

  for (let index = 0; index < MAX_RETAINED_RESOLUTIONS + 25; index += 1) {
    state = {
      ...state,
      resolutions: [...state.resolutions, makeResolution()],
    };
    state = recordResolution(addResolutionRequest(state, makeRequest()), {
      request: makeRequest(),
      resolution: makeResolution(),
      resolvedAt: '2026-07-31T12:00:05.000Z',
    });
  }

  assert.ok(
    state.resolutions.length <= MAX_RETAINED_RESOLUTIONS,
    `expected at most ${MAX_RETAINED_RESOLUTIONS}, got ${state.resolutions.length}`,
  );
});
