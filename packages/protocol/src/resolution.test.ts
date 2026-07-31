import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelResolutionRequestCommandSchema,
  diceResolutionSchema,
  modifierSourceSchema,
  requestResolutionCommandSchema,
  resolutionRequestSchema,
  resolutionStateUpdateSchema,
  submitResolutionCommandSchema,
} from './resolution.js';

const sessionId = 'ABC123';
const resolutionId = 'resolution_11111111-1111-4111-8111-111111111111';
const characterId = 'char_22222222-2222-4222-8222-222222222222';

function baseResolution() {
  return {
    id: resolutionId,
    kind: 'ability_check' as const,
    rulesProfileId: 'dnd5e-2024-core',
    sessionId,
    actorParticipantId: 'player-001',
    actorCharacterId: characterId,
    ability: 'dex' as const,
    stance: 'normal' as const,
    dice: [14],
    selectedDie: 14,
    modifiers: [{ kind: 'ability' as const, value: 3 }],
    modifierTotal: 3,
    total: 17,
    dc: 15,
    success: true,
    commandId: 'web-check-1',
    resolvedAt: '2026-07-31T12:00:00.000Z',
  };
}

test('a canonical resolution record round-trips', () => {
  const parsed = diceResolutionSchema.parse(baseResolution());

  assert.equal(parsed.kind, 'ability_check');
  assert.equal(parsed.total, 17);
  assert.equal(parsed.success, true);
});

// A saving throw recorded as an ability check is a corrupted audit trail, so
// `kind` is a closed set rather than free text.
test('resolution kind is a closed set', () => {
  for (const kind of ['ability_check', 'saving_throw', 'attack_roll']) {
    assert.equal(
      diceResolutionSchema.parse({ ...baseResolution(), kind }).kind,
      kind,
    );
  }

  assert.equal(
    diceResolutionSchema.safeParse({ ...baseResolution(), kind: 'check' })
      .success,
    false,
  );
});

test('advantage and disadvantage carry two dice, never more', () => {
  const advantage = diceResolutionSchema.parse({
    ...baseResolution(),
    stance: 'advantage',
    dice: [4, 18],
    selectedDie: 18,
  });

  assert.deepEqual(advantage.dice, [4, 18]);
  assert.equal(advantage.selectedDie, 18);

  assert.equal(
    diceResolutionSchema.safeParse({
      ...baseResolution(),
      dice: [1, 2, 3],
      stance: 'advantage',
    }).success,
    false,
  );
  assert.equal(
    diceResolutionSchema.safeParse({ ...baseResolution(), dice: [] }).success,
    false,
  );
});

test('dice faces outside 1-20 are rejected', () => {
  for (const face of [0, 21, 1.5]) {
    assert.equal(
      diceResolutionSchema.safeParse({
        ...baseResolution(),
        dice: [face],
        selectedDie: 14,
      }).success,
      false,
      `d20 face ${face} must be rejected`,
    );
  }
});

// The UI localizes from these keys, so they must stay canonical and closed. A
// localized label stored here would become an untranslatable canonical ID.
test('modifier sources are canonical keys, not display strings', () => {
  for (const kind of ['ability', 'proficiency', 'condition', 'gm_adjustment']) {
    assert.equal(modifierSourceSchema.parse({ kind, value: 2 }).kind, kind);
  }

  assert.equal(
    modifierSourceSchema.safeParse({ kind: 'Proficiency Bonus', value: 2 })
      .success,
    false,
  );
});

test('a resolution bounds its modifier list and values', () => {
  assert.equal(
    diceResolutionSchema.safeParse({
      ...baseResolution(),
      modifiers: Array.from({ length: 17 }, () => ({
        kind: 'ability' as const,
        value: 1,
      })),
    }).success,
    false,
  );
  assert.equal(
    modifierSourceSchema.safeParse({ kind: 'ability', value: 100 }).success,
    false,
  );
});

test('a request rejects an out-of-range DC', () => {
  const request = {
    sessionId,
    kind: 'ability_check' as const,
    targetParticipantId: 'player-001',
    ability: 'wis' as const,
    dc: 15,
    stance: 'normal' as const,
  };

  assert.equal(
    requestResolutionCommandSchema.safeParse({
      commandId: 'web-req-1',
      type: 'request_resolution',
      actor: { participantId: 'dm-001' },
      payload: request,
    }).success,
    true,
  );

  for (const dc of [0, 51]) {
    assert.equal(
      requestResolutionCommandSchema.safeParse({
        commandId: 'web-req-1',
        type: 'request_resolution',
        actor: { participantId: 'dm-001' },
        payload: { ...request, dc },
      }).success,
      false,
      `DC ${dc} must be rejected`,
    );
  }
});

test('a request defaults to a normal stance', () => {
  const parsed = requestResolutionCommandSchema.parse({
    commandId: 'web-req-2',
    type: 'request_resolution',
    actor: { participantId: 'dm-001' },
    payload: {
      sessionId,
      kind: 'saving_throw',
      targetParticipantId: 'player-001',
      ability: 'con',
      dc: 12,
    },
  });

  assert.equal(parsed.payload.stance, 'normal');
});

// An attack roll is not something a GM can demand through this command; it goes
// through the encounter attack flow with its own turn and reach gates.
test('a request accepts only checks and saves', () => {
  assert.equal(
    requestResolutionCommandSchema.safeParse({
      commandId: 'web-req-3',
      type: 'request_resolution',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        kind: 'attack_roll',
        targetParticipantId: 'player-001',
        ability: 'str',
        dc: 12,
      },
    }).success,
    false,
  );
});

test('GM prose fields are bounded', () => {
  const tooLong = 'x'.repeat(241);

  assert.equal(
    requestResolutionCommandSchema.safeParse({
      commandId: 'web-req-4',
      type: 'request_resolution',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        kind: 'ability_check',
        targetParticipantId: 'player-001',
        ability: 'str',
        dc: 12,
        reason: tooLong,
      },
    }).success,
    false,
  );
});

test('submit and cancel require a canonical resolution ID', () => {
  for (const schema of [
    submitResolutionCommandSchema,
    cancelResolutionRequestCommandSchema,
  ]) {
    assert.equal(
      schema.safeParse({
        commandId: 'web-sub-1',
        type:
          schema === submitResolutionCommandSchema
            ? 'submit_resolution'
            : 'cancel_resolution_request',
        actor: { participantId: 'player-001' },
        payload: { sessionId, requestId: 'not-a-resolution-id' },
      }).success,
      false,
    );
  }
});

test('a request record tracks its lifecycle status', () => {
  const parsed = resolutionRequestSchema.parse({
    id: resolutionId,
    sessionId,
    kind: 'saving_throw',
    status: 'pending',
    requestedByParticipantId: 'dm-001',
    targetParticipantId: 'player-001',
    ability: 'con',
    dc: 13,
    stance: 'disadvantage',
    createdAt: '2026-07-31T12:00:00.000Z',
  });

  assert.equal(parsed.status, 'pending');
  assert.equal(parsed.resolutionId, undefined);
});

test('the stream event carries the whole resolution state', () => {
  const parsed = resolutionStateUpdateSchema.parse({
    type: 'resolution_state',
    reason: 'resolution_submitted',
    sessionId,
    state: { requests: [], resolutions: [baseResolution()] },
  });

  assert.equal(parsed.state.resolutions.length, 1);
});
