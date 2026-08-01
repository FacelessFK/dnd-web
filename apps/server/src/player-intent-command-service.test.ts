import assert from 'node:assert/strict';
import test from 'node:test';

import {
  playerIntentSchema,
  type SubmitPlayerIntentCommand,
} from '@dnd/protocol';

import {
  buildPlayerIntent,
  createPlayerIntentId,
} from './player-intent-command-service.js';

const CREATED_AT = '2026-07-31T12:00:00.000Z';

function createCommand(text: string): SubmitPlayerIntentCommand {
  return {
    commandId: 'cmd-intent-1',
    type: 'submit_player_intent',
    actor: { participantId: 'player-001' },
    payload: { sessionId: 'ABC123', text },
  };
}

function build(text: string, authorParticipantId = 'player-001') {
  return buildPlayerIntent({
    command: createCommand(text),
    intentId: createPlayerIntentId(),
    sessionId: 'ABC123',
    authorParticipantId,
    authorCharacterId: 'char_00000000-0000-4000-8000-000000000001',
    createdAt: CREATED_AT,
  });
}

test('a generated intent ID satisfies the protocol pattern', () => {
  assert.doesNotThrow(() =>
    playerIntentSchema.shape.id.parse(createPlayerIntentId()),
  );
});

test('a new intent is pending, attributed, and schema-valid', () => {
  const intent = build('I want to shove the brazier onto the webbing.');

  assert.doesNotThrow(() => playerIntentSchema.parse(intent));
  assert.equal(intent.status, 'pending');
  assert.equal(intent.authorParticipantId, 'player-001');
  assert.equal(intent.createdAt, CREATED_AT);
  assert.equal(intent.updatedAt, CREATED_AT);
  assert.equal(intent.gmNote, undefined);
});

// Authorship comes from the authenticated participant the runtime resolved.
// The payload has no author field to claim, and this is what keeps it that way.
test('the author is whoever the caller was resolved to be', () => {
  assert.equal(
    build('Anything.', 'player-002').authorParticipantId,
    'player-002',
  );
});

test('player prose is stored exactly as written', () => {
  const text = 'من می‌خواهم به سمت در بروم — <b>quickly</b> & quietly';

  assert.equal(build(text).text, text);
});

test('an intent carries nothing that could mutate game state', () => {
  const intent = build('I attack the dragon for 500 damage.');

  assert.deepEqual(Object.keys(intent).sort(), [
    'authorCharacterId',
    'authorParticipantId',
    'createdAt',
    'id',
    'sessionId',
    'status',
    'text',
    'updatedAt',
  ]);
});
