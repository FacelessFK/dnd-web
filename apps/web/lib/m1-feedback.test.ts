import assert from 'node:assert/strict';
import test from 'node:test';

import type { CombatEvent, SessionStreamEvent } from '@dnd/protocol';

import { messages } from './i18n';
import {
  appendM1Feedback,
  describeM1Feedback,
  describeStreamStatus,
  m1FeedbackDismissDelayMs,
  M1_FEEDBACK_LIMIT,
} from './m1-feedback';

function combatEvent(overrides: Partial<CombatEvent> = {}): CombatEvent {
  return {
    attackerParticipantId: 'player-001',
    damage: 6,
    encounterId: 'encounter_11111111-1111-4111-8111-111111111111',
    hit: true,
    reason: 'attack_resolved',
    roll: { d20: 14, modifier: 4, total: 18 },
    sessionId: 'ABC123',
    targetArmorClass: 13,
    targetCombatantId: 'scene_entity_11111111-1111-4111-8111-111111111111',
    targetParticipantId: 'dm-001',
    type: 'combat_event',
    ...overrides,
  };
}

function resolutionEvent(
  reason: 'initial_sync' | 'resolution_requested' | 'resolution_submitted',
  success?: boolean,
): SessionStreamEvent {
  return {
    reason,
    sessionId: 'ABC123',
    state: {
      requests: [
        {
          ability: 'dex',
          createdAt: '2026-07-31T12:00:00.000Z',
          dc: 15,
          id: 'resolution_11111111-1111-4111-8111-111111111111',
          kind: 'ability_check',
          requestedByParticipantId: 'dm-001',
          sessionId: 'ABC123',
          stance: 'normal',
          status: reason === 'resolution_requested' ? 'pending' : 'resolved',
          targetParticipantId: 'player-001',
        },
      ],
      resolutions:
        reason !== 'resolution_requested'
          ? [
              {
                ability: 'dex',
                actorParticipantId: 'player-001',
                commandId: 'cmd-1',
                critical: false,
                criticalMiss: false,
                dc: 15,
                dice: [12],
                id: 'resolution_22222222-2222-4222-8222-222222222222',
                kind: 'ability_check',
                modifierTotal: 2,
                modifiers: [],
                resolvedAt: '2026-07-31T12:00:05.000Z',
                rulesProfileId: 'dnd5e-2024-core',
                selectedDie: 12,
                sessionId: 'ABC123',
                stance: 'normal',
                success,
                total: 14,
              },
            ]
          : [],
    },
    type: 'resolution_state',
  };
}

function intentEvent(
  reason: 'initial_sync' | 'intent_submitted' | 'intent_status_changed',
): SessionStreamEvent {
  return {
    reason,
    sessionId: 'ABC123',
    state: {
      intents: [
        {
          authorParticipantId: 'player-001',
          createdAt: '2026-07-31T12:00:00.000Z',
          id: 'intent_11111111-1111-4111-8111-111111111111',
          sessionId: 'ABC123',
          status: reason === 'intent_submitted' ? 'pending' : 'acknowledged',
          text: 'I sweep the rubble aside.',
          updatedAt: '2026-07-31T12:00:05.000Z',
        },
      ],
    },
    type: 'player_intent_state',
  };
}

function assertKeyExists(key: string): void {
  assert.ok(key in messages.en, `missing English copy for "${key}"`);
  assert.ok(key in messages.fa, `missing Persian copy for "${key}"`);
}

test('a hit, a critical, a miss and a critical miss each read differently', () => {
  const hit = describeM1Feedback(combatEvent());
  const critical = describeM1Feedback(
    combatEvent({ roll: { critical: true, d20: 20, modifier: 4, total: 24 } }),
  );
  const miss = describeM1Feedback(combatEvent({ damage: 0, hit: false }));
  const criticalMiss = describeM1Feedback(
    combatEvent({
      damage: 0,
      hit: false,
      roll: { criticalMiss: true, d20: 1, modifier: 4, total: 5 },
    }),
  );

  assert.equal(hit?.messageKey, 'runtime.m1.feedback.hit');
  assert.equal(hit?.values?.damage, '6');
  assert.equal(critical?.messageKey, 'runtime.m1.feedback.criticalHit');
  assert.equal(miss?.messageKey, 'runtime.m1.feedback.miss');
  assert.equal(criticalMiss?.messageKey, 'runtime.m1.feedback.criticalMiss');
});

test('a resolution reports its outcome and its total', () => {
  const success = describeM1Feedback(
    resolutionEvent('resolution_submitted', true),
  );
  const failure = describeM1Feedback(
    resolutionEvent('resolution_submitted', false),
  );

  assert.equal(success?.messageKey, 'runtime.m1.feedback.resolutionSuccess');
  assert.equal(success?.values?.total, '14');
  assert.equal(failure?.messageKey, 'runtime.m1.feedback.resolutionFailure');
});

test('a request announces itself', () => {
  assert.equal(
    describeM1Feedback(resolutionEvent('resolution_requested'))?.messageKey,
    'runtime.m1.feedback.resolutionRequested',
  );
});

test('an initial sync restores the table without announcing anything', () => {
  // The frames a subscriber gets on connect carry records it has already seen.
  // Announcing the newest one would tell someone who just refreshed that an old
  // roll had only now landed, and would repeat that on every reconnect - the
  // feedback list starts empty each page load, so dedupe cannot catch it.
  // Both frames carry a record that WOULD be announced under any other reason,
  // so this proves the reason is what suppresses it, not an empty payload.
  assert.equal(
    describeM1Feedback(resolutionEvent('resolution_submitted', true))
      ?.messageKey,
    'runtime.m1.feedback.resolutionSuccess',
  );
  assert.equal(describeM1Feedback(resolutionEvent('initial_sync', true)), null);
  assert.ok(describeM1Feedback(intentEvent('intent_status_changed')));
  assert.equal(describeM1Feedback(intentEvent('initial_sync')), null);
});

test('an event with no moment worth announcing produces nothing', () => {
  assert.equal(
    describeM1Feedback({
      activeSceneId: 'scene_11111111-1111-4111-8111-111111111111',
      characterId: 'char_11111111-1111-4111-8111-111111111111',
      footprint: { height: 1, width: 1 },
      participantId: 'player-001',
      position: { x: 1, y: 1 },
      reason: 'character_moved',
      sessionId: 'ABC123',
      type: 'movement_state',
    } as unknown as SessionStreamEvent),
    null,
  );
});

// A reconnect redelivers terminal frames. A second "critical hit" banner for
// one attack is a lie about what happened.
test('the same underlying fact never shows twice', () => {
  const item = describeM1Feedback(combatEvent());
  const once = appendM1Feedback([], item);
  const twice = appendM1Feedback(once, describeM1Feedback(combatEvent()));

  assert.equal(once.length, 1);
  assert.equal(twice.length, 1);
});

test('a different attack is a different callout', () => {
  const first = appendM1Feedback([], describeM1Feedback(combatEvent()));
  const second = appendM1Feedback(
    first,
    describeM1Feedback(combatEvent({ damage: 9 })),
  );

  assert.equal(second.length, 2);
});

test('a burst keeps the most recent callouts, not the first ones', () => {
  let items = appendM1Feedback([], describeM1Feedback(combatEvent()));

  for (let index = 1; index <= M1_FEEDBACK_LIMIT + 2; index += 1) {
    items = appendM1Feedback(
      items,
      describeM1Feedback(combatEvent({ damage: index })),
    );
  }

  assert.equal(items.length, M1_FEEDBACK_LIMIT);
  assert.equal(
    items.at(-1)?.values?.damage,
    String(M1_FEEDBACK_LIMIT + 2),
    'the newest callout survived',
  );
});

// Someone who asked for less motion did not ask for less information.
test('reduced motion schedules no dismissal at all', () => {
  assert.equal(m1FeedbackDismissDelayMs(true), null);
  assert.ok((m1FeedbackDismissDelayMs(false) ?? 0) > 0);
});

test('stream status maps to distinct bilingual copy', () => {
  const connected = describeStreamStatus('connected', false);
  const recovered = describeStreamStatus('connected', true);
  const reconnecting = describeStreamStatus('reconnecting', false);
  const idle = describeStreamStatus('idle', false);

  for (const described of [connected, recovered, reconnecting, idle]) {
    assertKeyExists(described.messageKey);
  }

  assert.notEqual(connected.messageKey, recovered.messageKey);
  assert.equal(reconnecting.tone, 'warning');
  assert.equal(idle.tone, 'danger');
});

test('every feedback key a stream event can emit resolves in both locales', () => {
  const events: SessionStreamEvent[] = [
    combatEvent(),
    combatEvent({ damage: 0, hit: false }),
    resolutionEvent('resolution_requested'),
    resolutionEvent('resolution_submitted', true),
  ];

  for (const event of events) {
    const described = describeM1Feedback(event);

    assert.ok(described, `expected feedback for ${event.type}`);
    assertKeyExists(described.messageKey);
  }
});
