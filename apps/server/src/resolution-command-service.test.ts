import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diceResolutionSchema,
  resolutionRequestSchema,
  type RequestResolutionCommand,
  type ResolutionRequest,
} from '@dnd/protocol';

import {
  buildResolutionRequest,
  createResolutionId,
  resolveResolutionRequest,
} from './resolution-command-service.js';

const CREATED_AT = '2026-07-31T12:00:00.000Z';
const RESOLVED_AT = '2026-07-31T12:00:30.000Z';

function createRequestCommand(
  payload: Partial<RequestResolutionCommand['payload']> = {},
): RequestResolutionCommand {
  return {
    commandId: 'cmd-request-1',
    type: 'request_resolution',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId: 'ABC123',
      kind: 'ability_check',
      targetParticipantId: 'player-001',
      ability: 'dex',
      dc: 15,
      stance: 'normal',
      ...payload,
    },
  };
}

function buildRequest(
  payload: Partial<RequestResolutionCommand['payload']> = {},
): ResolutionRequest {
  return buildResolutionRequest({
    command: createRequestCommand(payload),
    requestId: createResolutionId(),
    sessionId: 'ABC123',
    requestedByParticipantId: 'dm-001',
    targetParticipantId: 'player-001',
    targetCharacterId: 'char_00000000-0000-4000-8000-000000000001',
    createdAt: CREATED_AT,
  });
}

/** Rolls the faces given, in order, and refuses to be asked for more. */
function fixedRoller(...faces: number[]): () => number {
  const remaining = [...faces];

  return () => {
    const next = remaining.shift();

    if (next === undefined) {
      throw new Error(
        'The roller was asked for more dice than the test pinned.',
      );
    }

    return next;
  };
}

const ARIA = {
  abilities: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 },
  level: 5,
};

test('a generated resolution ID satisfies the protocol pattern', () => {
  assert.doesNotThrow(() =>
    resolutionRequestSchema.shape.id.parse(createResolutionId()),
  );
});

test('a new request is pending and carries no dice result', () => {
  const request = buildRequest();

  assert.doesNotThrow(() => resolutionRequestSchema.parse(request));
  assert.equal(request.status, 'pending');
  assert.equal(request.resolutionId, undefined);
  assert.equal(request.resolvedAt, undefined);
  assert.equal(request.requestedByParticipantId, 'dm-001');
  assert.equal(request.targetParticipantId, 'player-001');
});

test('a saving throw request stays a saving throw', () => {
  assert.equal(buildRequest({ kind: 'saving_throw' }).kind, 'saving_throw');
});

test('the GM reason and consequence are carried verbatim', () => {
  const request = buildRequest({
    reason: 'The floor gives way.',
    consequence: 'You fall into the cistern.',
  });

  assert.equal(request.reason, 'The floor gives way.');
  assert.equal(request.consequence, 'You fall into the cistern.');
});

test('a resolved check reports its dice, its sources and its outcome', () => {
  const request = buildRequest({ ability: 'dex', dc: 15 });
  const resolution = resolveResolutionRequest({
    request,
    actor: ARIA,
    actorParticipantId: 'player-001',
    actorCharacterId: 'char_00000000-0000-4000-8000-000000000001',
    rulesProfileId: 'dnd5e-2024-core',
    sessionId: 'ABC123',
    commandId: 'cmd-submit-1',
    resolutionId: createResolutionId(),
    resolvedAt: RESOLVED_AT,
    roller: fixedRoller(13),
  });

  assert.doesNotThrow(() => diceResolutionSchema.parse(resolution));
  assert.equal(resolution.kind, 'ability_check');
  assert.equal(resolution.stance, 'normal');
  assert.deepEqual(resolution.dice, [13]);
  assert.equal(resolution.selectedDie, 13);
  // dex 14 is a +2 modifier; 13 + 2 = 15, which ties the DC and therefore
  // succeeds - 5e compares "equals or exceeds".
  assert.deepEqual(resolution.modifiers, [
    { kind: 'ability', detail: 'dex', value: 2 },
  ]);
  assert.equal(resolution.total, 15);
  assert.equal(resolution.dc, 15);
  assert.equal(resolution.success, true);
  assert.equal(resolution.requestId, request.id);
  assert.equal(resolution.commandId, 'cmd-submit-1');
  assert.equal(resolution.resolvedAt, RESOLVED_AT);
});

test('a saving throw is recorded as a saving throw, not a check', () => {
  const resolution = resolveResolutionRequest({
    request: buildRequest({ kind: 'saving_throw', ability: 'con', dc: 12 }),
    actor: ARIA,
    actorParticipantId: 'player-001',
    rulesProfileId: 'dnd5e-2024-core',
    sessionId: 'ABC123',
    commandId: 'cmd-submit-2',
    resolutionId: createResolutionId(),
    resolvedAt: RESOLVED_AT,
    roller: fixedRoller(11),
  });

  assert.equal(resolution.kind, 'saving_throw');
});

test('poisoned drags an ability check to the lower of two dice', () => {
  const resolution = resolveResolutionRequest({
    request: buildRequest({ ability: 'dex', dc: 15 }),
    actor: { ...ARIA, activeConditions: ['poisoned'] },
    actorParticipantId: 'player-001',
    rulesProfileId: 'dnd5e-2024-core',
    sessionId: 'ABC123',
    commandId: 'cmd-submit-3',
    resolutionId: createResolutionId(),
    resolvedAt: RESOLVED_AT,
    roller: fixedRoller(18, 4),
  });

  assert.equal(resolution.stance, 'disadvantage');
  assert.deepEqual(resolution.dice, [18, 4]);
  assert.equal(resolution.selectedDie, 4);
  assert.deepEqual(resolution.stanceSources, [
    { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
  ]);
  assert.equal(resolution.success, false);
});

test('poisoned does not touch a saving throw', () => {
  const resolution = resolveResolutionRequest({
    request: buildRequest({ kind: 'saving_throw', ability: 'con', dc: 10 }),
    actor: { ...ARIA, activeConditions: ['poisoned'] },
    actorParticipantId: 'player-001',
    rulesProfileId: 'dnd5e-2024-core',
    sessionId: 'ABC123',
    commandId: 'cmd-submit-4',
    resolutionId: createResolutionId(),
    resolvedAt: RESOLVED_AT,
    // One face only: a second draw would mean two dice were rolled.
    roller: fixedRoller(9),
  });

  assert.equal(resolution.stance, 'normal');
  assert.deepEqual(resolution.dice, [9]);
  assert.equal(resolution.stanceSources, undefined);
});

// The GM asking for advantage is the independent source that proves stances
// fold rather than accumulate, on the path a real command takes.
test('a GM asking for advantage on a poisoned character produces a normal roll', () => {
  const resolution = resolveResolutionRequest({
    request: buildRequest({ stance: 'advantage' }),
    actor: { ...ARIA, activeConditions: ['poisoned'] },
    actorParticipantId: 'player-001',
    rulesProfileId: 'dnd5e-2024-core',
    sessionId: 'ABC123',
    commandId: 'cmd-submit-5',
    resolutionId: createResolutionId(),
    resolvedAt: RESOLVED_AT,
    roller: fixedRoller(7),
  });

  assert.equal(resolution.stance, 'normal');
  assert.deepEqual(resolution.dice, [7]);
  assert.deepEqual(resolution.stanceSources, [
    { kind: 'gm_request', stance: 'advantage' },
    { kind: 'condition', detail: 'poisoned', stance: 'disadvantage' },
  ]);
});

test('duplicate poisoned tags roll no extra dice', () => {
  const resolution = resolveResolutionRequest({
    request: buildRequest(),
    actor: { ...ARIA, activeConditions: ['poisoned', 'poisoned', 'poisoned'] },
    actorParticipantId: 'player-001',
    rulesProfileId: 'dnd5e-2024-core',
    sessionId: 'ABC123',
    commandId: 'cmd-submit-6',
    resolutionId: createResolutionId(),
    resolvedAt: RESOLVED_AT,
    roller: fixedRoller(15, 6),
  });

  assert.deepEqual(resolution.dice, [15, 6]);
  assert.equal(resolution.stanceSources?.length, 1);
});

test('the resolution path never reaches for Math.random', () => {
  const original = Math.random;
  Math.random = () => {
    throw new Error('Math.random must not be reachable from a resolution.');
  };

  try {
    assert.doesNotThrow(() =>
      resolveResolutionRequest({
        request: buildRequest(),
        actor: ARIA,
        actorParticipantId: 'player-001',
        rulesProfileId: 'dnd5e-2024-core',
        sessionId: 'ABC123',
        commandId: 'cmd-submit-7',
        resolutionId: createResolutionId(),
        resolvedAt: RESOLVED_AT,
        roller: fixedRoller(12),
      }),
    );
  } finally {
    Math.random = original;
  }
});
