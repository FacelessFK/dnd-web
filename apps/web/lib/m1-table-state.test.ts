import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DiceResolution,
  PlayerIntent,
  ResolutionRequest,
} from '@dnd/protocol';

import {
  createEmptyM1TableState,
  findResolutionForRequest,
  hasActiveCondition,
  mergeM1TableState,
  pendingRequestsFor,
} from './m1-table-state';

function request(
  id: string,
  overrides: Partial<ResolutionRequest> = {},
): ResolutionRequest {
  return {
    ability: 'dex',
    createdAt: '2026-07-31T12:00:00.000Z',
    dc: 15,
    id: `resolution_${id}`,
    kind: 'ability_check',
    requestedByParticipantId: 'dm-001',
    sessionId: 'ABC123',
    stance: 'normal',
    status: 'pending',
    targetParticipantId: 'player-001',
    ...overrides,
  };
}

function resolution(
  id: string,
  overrides: Partial<DiceResolution> = {},
): DiceResolution {
  return {
    ability: 'dex',
    actorParticipantId: 'player-001',
    commandId: 'cmd-1',
    critical: false,
    criticalMiss: false,
    dice: [12],
    id: `resolution_${id}`,
    kind: 'ability_check',
    modifierTotal: 2,
    modifiers: [],
    resolvedAt: '2026-07-31T12:00:05.000Z',
    rulesProfileId: 'dnd5e-2024-core',
    selectedDie: 12,
    sessionId: 'ABC123',
    stance: 'normal',
    total: 14,
    ...overrides,
  };
}

function intent(
  id: string,
  overrides: Partial<PlayerIntent> = {},
): PlayerIntent {
  return {
    authorParticipantId: 'player-001',
    createdAt: '2026-07-31T12:00:00.000Z',
    id: `intent_${id}`,
    sessionId: 'ABC123',
    status: 'pending',
    text: 'I hold the line.',
    updatedAt: '2026-07-31T12:00:00.000Z',
    ...overrides,
  };
}

test('an empty table has nothing in it', () => {
  assert.deepEqual(createEmptyM1TableState(), {
    intents: [],
    requests: [],
    resolutions: [],
  });
});

// A reconnect redelivers frames the client already has. Merging by ID is what
// makes that a no-op instead of a second copy of every roll.
test('receiving the same frame twice changes nothing', () => {
  const frame = {
    requests: [request('a')],
    resolutions: [resolution('r')],
  };
  const once = mergeM1TableState(createEmptyM1TableState(), frame);
  const twice = mergeM1TableState(once, frame);

  assert.deepEqual(twice, once);
  assert.equal(twice.requests.length, 1);
  assert.equal(twice.resolutions.length, 1);
});

test('a request that advanced status replaces the older copy', () => {
  const pending = mergeM1TableState(createEmptyM1TableState(), {
    requests: [request('a')],
  });
  const resolved = mergeM1TableState(pending, {
    requests: [
      request('a', { resolutionId: 'resolution_r', status: 'resolved' }),
    ],
  });

  assert.equal(resolved.requests.length, 1);
  assert.equal(resolved.requests[0]?.status, 'resolved');
});

test('a cancelled request is kept and marked, not dropped', () => {
  const merged = mergeM1TableState(
    mergeM1TableState(createEmptyM1TableState(), { requests: [request('a')] }),
    { requests: [request('a', { status: 'cancelled' })] },
  );

  assert.equal(merged.requests[0]?.status, 'cancelled');
});

// A reconnect can deliver the backlog out of order. An audit that reordered
// itself on reconnect would be unreadable.
test('entries are ordered by the server timestamps, not by arrival', () => {
  const merged = mergeM1TableState(createEmptyM1TableState(), {
    resolutions: [
      resolution('late', { resolvedAt: '2026-07-31T12:00:09.000Z' }),
      resolution('early', { resolvedAt: '2026-07-31T12:00:01.000Z' }),
    ],
  });

  assert.deepEqual(
    merged.resolutions.map((entry) => entry.id),
    ['resolution_early', 'resolution_late'],
  );
});

test('entries sharing a timestamp fall back to a stable order', () => {
  const merged = mergeM1TableState(createEmptyM1TableState(), {
    resolutions: [resolution('b'), resolution('a')],
  });

  assert.deepEqual(
    merged.resolutions.map((entry) => entry.id),
    ['resolution_a', 'resolution_b'],
  );
});

test('a slice that omits a list leaves that list untouched', () => {
  const seeded = mergeM1TableState(createEmptyM1TableState(), {
    intents: [intent('a')],
    requests: [request('a')],
  });
  const merged = mergeM1TableState(seeded, { requests: [request('b')] });

  assert.equal(merged.intents.length, 1, 'intents survived a resolution frame');
  assert.equal(merged.requests.length, 2);
});

test('an intent status update replaces rather than duplicates', () => {
  const merged = mergeM1TableState(
    mergeM1TableState(createEmptyM1TableState(), { intents: [intent('a')] }),
    {
      intents: [
        intent('a', {
          status: 'resolved',
          updatedAt: '2026-07-31T12:05:00.000Z',
        }),
      ],
    },
  );

  assert.equal(merged.intents.length, 1);
  assert.equal(merged.intents[0]?.status, 'resolved');
});

test('only pending requests addressed to the viewer are offered', () => {
  const table = mergeM1TableState(createEmptyM1TableState(), {
    requests: [
      request('mine'),
      request('theirs', { targetParticipantId: 'player-002' }),
      request('done', { status: 'resolved', resolutionId: 'resolution_r' }),
    ],
  });

  assert.deepEqual(
    pendingRequestsFor(table, 'player-001').map((entry) => entry.id),
    ['resolution_mine'],
  );
});

test('a request finds the roll that answered it', () => {
  const table = mergeM1TableState(createEmptyM1TableState(), {
    requests: [request('a')],
    resolutions: [resolution('r', { requestId: 'resolution_a' })],
  });

  assert.equal(
    findResolutionForRequest(table, 'resolution_a')?.id,
    'resolution_r',
  );
  assert.equal(findResolutionForRequest(table, 'resolution_missing'), null);
});

// Conditions are read from authoritative state, so a duplicate apply reads as
// one condition rather than two stacked ones.
test('a condition is present once however many times it was applied', () => {
  assert.equal(hasActiveCondition(['poisoned'], 'poisoned'), true);
  assert.equal(hasActiveCondition([], 'poisoned'), false);
  assert.equal(hasActiveCondition(undefined, 'poisoned'), false);
});
