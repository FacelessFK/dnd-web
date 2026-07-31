import assert from 'node:assert/strict';
import test from 'node:test';

import {
  playerIntentSchema,
  submitPlayerIntentCommandSchema,
  updatePlayerIntentStatusCommandSchema,
} from './intent.js';
import { dmSetCombatantHiddenCommandSchema } from './dm.js';

const sessionId = 'ABC123';
const intentId = 'intent_33333333-3333-4333-8333-333333333333';
const combatantId = 'scene_entity_44444444-4444-4444-8444-444444444444';

test('an intent carries author, text and status', () => {
  const parsed = playerIntentSchema.parse({
    id: intentId,
    sessionId,
    authorParticipantId: 'player-001',
    text: 'I search the altar for a hidden catch.',
    status: 'pending',
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
  });

  assert.equal(parsed.status, 'pending');
  assert.equal(parsed.gmNote, undefined);
});

// Stored, streamed and rendered, so the length is bounded at the contract.
test('intent text is bounded and non-empty', () => {
  const submit = (text: string) =>
    submitPlayerIntentCommandSchema.safeParse({
      commandId: 'web-intent-1',
      type: 'submit_player_intent',
      actor: { participantId: 'player-001' },
      payload: { sessionId, text },
    }).success;

  assert.equal(submit('I try to pick the lock.'), true);
  assert.equal(submit('x'.repeat(280)), true);
  assert.equal(submit('x'.repeat(281)), false);
  assert.equal(submit('   '), false);
  assert.equal(submit(''), false);
});

// The GM resolves an intent; nothing lets a command push it back to `pending`,
// which would let a player's own submission overwrite a GM decision.
test('a status update accepts only GM outcomes', () => {
  const update = (status: string) =>
    updatePlayerIntentStatusCommandSchema.safeParse({
      commandId: 'web-intent-2',
      type: 'update_player_intent_status',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, intentId, status },
    }).success;

  assert.equal(update('acknowledged'), true);
  assert.equal(update('resolved'), true);
  assert.equal(update('dismissed'), true);
  assert.equal(update('pending'), false);
});

test('an intent ID must be canonical', () => {
  assert.equal(
    updatePlayerIntentStatusCommandSchema.safeParse({
      commandId: 'web-intent-3',
      type: 'update_player_intent_status',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, intentId: 'intent-1', status: 'resolved' },
    }).success,
    false,
  );
});

test('conceal and reveal is one boolean command over a canonical combatant', () => {
  for (const hidden of [true, false]) {
    assert.equal(
      dmSetCombatantHiddenCommandSchema.parse({
        commandId: 'web-hide-1',
        type: 'dm_set_combatant_hidden',
        actor: { participantId: 'dm-001' },
        payload: { sessionId, combatantId, hidden },
      }).payload.hidden,
      hidden,
    );
  }

  assert.equal(
    dmSetCombatantHiddenCommandSchema.safeParse({
      commandId: 'web-hide-2',
      type: 'dm_set_combatant_hidden',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, combatantId: 'scene_entity_nope', hidden: true },
    }).success,
    false,
  );
});
