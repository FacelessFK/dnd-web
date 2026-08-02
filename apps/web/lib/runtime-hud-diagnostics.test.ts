import assert from 'node:assert/strict';
import test from 'node:test';

import type { SessionStreamEvent } from '@dnd/protocol';

import { messages } from './i18n';
import { containsInternalIdentifier } from './runtime-shell-view';
import {
  EMPTY_RUNTIME_EVENT_LABELS,
  type RuntimeEventLabels,
} from './runtime-event-labels';
import {
  selectRuntimeFeedEntries,
  type RuntimeLogEntry,
} from './runtime-hud-diagnostics';

/**
 * A translator over the real catalogue.
 *
 * Real, not a stub: a stub would keep passing while a key was missing from a
 * locale, and the point of most of these tests is the finished sentence in both
 * languages. A missing key fails here rather than rendering `{placeholder}`.
 */
function translator(locale: 'en' | 'fa') {
  return ((key: string, values?: Record<string, string>) => {
    const template = (messages[locale] as Record<string, string>)[key];

    assert.ok(template, `missing ${locale} message for ${key}`);

    return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
      values && name in values ? values[name]! : `{${name}}`,
    );
  }) as never;
}

const translate = translator('en');
const translateFa = translator('fa');

function movementEvent(): SessionStreamEvent {
  return {
    participantId: 'player-001',
    position: { x: 3, y: 4 },
    reason: 'character_moved',
    sceneId: 'scene_5f0d0c1a-0000-4000-8000-000000000001',
    sessionId: 'ABC123',
    type: 'movement_state',
  } as unknown as SessionStreamEvent;
}

function entry(id: string, payload: unknown): RuntimeLogEntry {
  return { at: '10:00:00', id, label: 'movement_state', payload };
}

test('the feed carries summaries and never the payload they came from', () => {
  const entries = [entry('a', movementEvent())];
  const [summarized] = selectRuntimeFeedEntries(
    entries,
    translate,
    EMPTY_RUNTIME_EVENT_LABELS,
  );

  assert.ok(summarized);
  assert.equal(summarized.id, 'a');
  assert.equal(summarized.at, '10:00:00');
  assert.ok(summarized.summary.title.length > 0);

  // The whole reason the feed is safe for a player: a frame goes in, a title,
  // a detail and a tone come out, and nothing carries the raw event forward.
  assert.equal('payload' in summarized, false);
});

test('a non-stream ledger entry never reaches the feed', () => {
  // The ledger also records command responses, which are protocol payloads with
  // no player-safe summary. Dropping them here is what keeps the same list
  // usable by the debug panel and by the player's event feed.
  const entries = [
    entry('command', { commandId: 'cmd_1', ok: true }),
    entry('stream', movementEvent()),
  ];

  const feed = selectRuntimeFeedEntries(
    entries,
    translate,
    EMPTY_RUNTIME_EVENT_LABELS,
  );

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, 'stream');
});

test('the feed is bounded and keeps the newest entries', () => {
  // The ledger is newest-first, so the slice must keep the head. An unbounded
  // feed grows once per frame for as long as the table is open.
  const entries = Array.from({ length: 40 }, (_unused, index) =>
    entry(`e${index}`, movementEvent()),
  );

  const feed = selectRuntimeFeedEntries(
    entries,
    translate,
    EMPTY_RUNTIME_EVENT_LABELS,
  );

  assert.equal(feed.length, 8);
  assert.equal(feed[0]?.id, 'e0');
  assert.equal(feed.at(-1)?.id, 'e7');
});

test('nothing a player reads in the feed is an internal identifier', () => {
  const feed = selectRuntimeFeedEntries(
    [entry('a', movementEvent())],
    translate,
    EMPTY_RUNTIME_EVENT_LABELS,
  );

  for (const item of feed) {
    for (const value of [item.summary.title, item.summary.detail]) {
      assert.equal(
        containsInternalIdentifier(value),
        false,
        `feed text leaked an identifier: ${value}`,
      );
    }
  }
});

// --- the event-feed identifier leak ------------------------------------------
//
// The M2 acceptance forbids a seat ID on a player surface, and the feed rendered
// one: "player-001 was repositioned by the DM to 2,2". The unit tests agreed it
// was clean, because `containsInternalIdentifier` did not know the participant
// pattern the harness did. Both halves of that are covered below - the sentence
// the feed now produces, and the predicate that would have caught the old one.

const ownSeat = 'player-001';
const otherSeat = 'player-002';
const ownCharacterId = 'character_11111111-1111-4111-8111-111111111111';
const otherCharacterId = 'character_22222222-2222-4222-8222-222222222222';
const visibleCombatantId = 'scene_entity_33333333-3333-4333-8333-333333333333';
const hiddenCombatantId = 'scene_entity_44444444-4444-4444-8444-444444444444';

/**
 * The directory a seated player would hold: their own character, one other
 * player, one visible creature. The hidden creature is deliberately *absent*,
 * which is what a player's projection actually looks like.
 */
function playerLabels(
  overrides: Partial<RuntimeEventLabels> = {},
): RuntimeEventLabels {
  return {
    characterNames: {
      [ownCharacterId]: 'Alder Finch',
      [otherCharacterId]: 'Brannoc Vale',
    },
    combatantNames: { [visibleCombatantId]: 'Grimtooth' },
    ownCharacterId,
    ownParticipantId: ownSeat,
    participantNames: { [ownSeat]: 'Alder Finch', [otherSeat]: 'Brannoc Vale' },
    ...overrides,
  };
}

function feedDetail(
  payload: unknown,
  labels: RuntimeEventLabels,
  t: typeof translate = translate,
): string {
  const [item] = selectRuntimeFeedEntries([entry('x', payload)], t, labels);

  assert.ok(item, 'the frame produced no feed entry');

  return item.summary.detail;
}

function repositionEvent(participantId: string): SessionStreamEvent {
  return {
    activeSceneId: 'scene_5f0d0c1a-0000-4000-8000-000000000001',
    characterId: participantId === ownSeat ? ownCharacterId : otherCharacterId,
    footprint: { height: 1, width: 1 },
    participantId,
    position: { x: 2, y: 2 },
    reason: 'dm_character_repositioned',
    sessionId: 'ABC123',
    type: 'movement_state',
  } as unknown as SessionStreamEvent;
}

test('the reposition that leaked a seat ID now names the player in the second person', () => {
  const detail = feedDetail(repositionEvent(ownSeat), playerLabels());

  assert.equal(detail, 'You were repositioned by the DM to 2,2.');
  assert.equal(detail.includes(ownSeat), false);
  assert.equal(containsInternalIdentifier(detail), false);
});

test('a reposition of another seat names that character, never its ID', () => {
  const detail = feedDetail(repositionEvent(otherSeat), playerLabels());

  assert.equal(detail, 'Brannoc Vale was repositioned by the DM to 2,2.');
  assert.equal(detail.includes(otherSeat), false);
  assert.equal(containsInternalIdentifier(detail), false);
});

test('a seat the roster does not name falls back to a person, not an ID', () => {
  // The window between a placement frame and the snapshot that names the seat.
  // Something is standing there and the feed may say so; who it is, it may not.
  const detail = feedDetail(
    repositionEvent(otherSeat),
    playerLabels({ participantNames: { [ownSeat]: 'Alder Finch' } }),
  );

  assert.equal(detail, 'Another adventurer was repositioned by the DM to 2,2.');
  assert.equal(detail.includes(otherSeat), false);
});

test('every movement reason has a whole sentence in both persons', () => {
  const reasons = [
    'character_moved',
    'character_placed',
    'dm_character_repositioned',
  ] as const;

  for (const reason of reasons) {
    for (const seat of [ownSeat, otherSeat]) {
      const detail = feedDetail(
        { ...repositionEvent(seat), reason },
        playerLabels(),
      );

      // A missing catalogue entry surfaces as an unresolved placeholder rather
      // than as a throw, so assert on the finished sentence.
      assert.equal(/\{\w+\}/.test(detail), false, detail);
      assert.equal(containsInternalIdentifier(detail), false, detail);
      assert.ok(detail.includes('2,2'), detail);
    }
  }
});

test('a movement line reads as Persian, in the right person and word order', () => {
  const own = feedDetail(repositionEvent(ownSeat), playerLabels(), translateFa);
  const other = feedDetail(
    repositionEvent(otherSeat),
    playerLabels(),
    translateFa,
  );

  // Persian puts the destination before the verb and inflects the verb for its
  // subject. Both are properties of the whole sentence, which is why movement
  // is one catalogue entry per reason per person rather than a composition.
  assert.equal(own, 'شما توسط DM به 2،2 جابه‌جا شدید.');
  assert.equal(other, 'Brannoc Vale توسط DM به 2،2 جابه‌جا شد.');
  assert.equal(own.includes(ownSeat), false);
  assert.equal(other.includes(otherSeat), false);
});

test('a character HP frame names the character, and the reader as "your"', () => {
  const characterEvent = (characterId: string): SessionStreamEvent =>
    ({
      characterId,
      hp: { current: 4, max: 11, temporary: 0 },
      reason: 'character_hp_changed',
      sessionId: 'ABC123',
      type: 'character_state',
    }) as unknown as SessionStreamEvent;

  assert.equal(
    feedDetail(characterEvent(ownCharacterId), playerLabels()),
    'Your HP is now 4/11.',
  );
  assert.equal(
    feedDetail(characterEvent(otherCharacterId), playerLabels()),
    'Brannoc Vale HP is now 4/11.',
  );

  // A character the reader holds no record of. The old code interpolated the
  // raw record ID here, which the acceptance forbids by pattern.
  const unknown = feedDetail(
    characterEvent('character_99999999-9999-4999-8999-999999999999'),
    playerLabels(),
  );

  assert.equal(unknown, 'Another adventurer HP is now 4/11.');
  assert.equal(containsInternalIdentifier(unknown), false);
});

function attackEvent(
  overrides: Record<string, unknown> = {},
): SessionStreamEvent {
  return {
    attackerCharacterId: ownCharacterId,
    attackerKind: 'character',
    attackerParticipantId: ownSeat,
    damage: 3,
    encounterId: 'encounter_55555555-5555-4555-8555-555555555555',
    hit: true,
    reason: 'attack_resolved',
    roll: { d20: 12, modifier: 5, total: 17 },
    sessionId: 'ABC123',
    targetArmorClass: 13,
    targetCombatantId: visibleCombatantId,
    targetKind: 'combatant',
    targetParticipantId: 'dm-001',
    type: 'combat_event',
    ...overrides,
  } as unknown as SessionStreamEvent;
}

test('a combat line names a visible creature and never its entity ID', () => {
  const detail = feedDetail(attackEvent(), playerLabels());

  assert.ok(detail.includes('Grimtooth'), detail);
  assert.ok(detail.includes('Alder Finch'), detail);
  assert.equal(detail.includes(visibleCombatantId), false);
  assert.equal(containsInternalIdentifier(detail), false);
});

test('a concealed side stays generic even when the directory could name it', () => {
  // The server says it withheld the identity. A browser that answered from its
  // own directory anyway would be deciding visibility, which is the server's
  // job - so `concealed` outranks every lookup.
  const detail = feedDetail(
    attackEvent({ targetConcealed: true }),
    playerLabels(),
  );

  assert.ok(detail.includes('An unseen creature'), detail);
  assert.equal(detail.includes('Grimtooth'), false);
});

test('a creature absent from this role projection cannot be named from stale state', () => {
  // The hidden combatant is in no player projection, so it is in no player
  // directory, so the only thing the feed can say about it is that it was not
  // seen. There is no cached previous scene to fall back to.
  const detail = feedDetail(
    attackEvent({ targetCombatantId: hiddenCombatantId }),
    playerLabels(),
  );

  assert.ok(detail.includes('An unseen creature'), detail);
  assert.equal(detail.includes(hiddenCombatantId), false);
  assert.equal(containsInternalIdentifier(detail), false);
});

test('an empty directory names nobody and still leaks nothing', () => {
  // Every frame described for a reader who has been told nothing. This is the
  // strongest form of the rule: with no name available anywhere, every branch
  // still has to produce words.
  const frames = [
    repositionEvent(ownSeat),
    repositionEvent(otherSeat),
    attackEvent(),
    attackEvent({ attackerConcealed: true, targetConcealed: true }),
    {
      characterId: ownCharacterId,
      hp: { current: 1, max: 9, temporary: 0 },
      reason: 'character_hp_changed',
      sessionId: 'ABC123',
      type: 'character_state',
    } as unknown as SessionStreamEvent,
  ];

  for (const t of [translate, translateFa]) {
    for (const frame of frames) {
      const detail = feedDetail(frame, EMPTY_RUNTIME_EVENT_LABELS, t);

      assert.equal(containsInternalIdentifier(detail), false, detail);
      assert.equal(/\{\w+\}/.test(detail), false, detail);
      assert.equal(/__[a-z_]+__/.test(detail), false, detail);
      assert.equal(/runtime\.[a-z]+\./i.test(detail), false, detail);
    }
  }
});

test('the identifier predicate knows the seat IDs the acceptance forbids', () => {
  // The regression that let the leak through: this predicate is what the unit
  // tests check a player surface against, and it did not know the pattern the
  // browser acceptance has always forbidden.
  assert.equal(
    containsInternalIdentifier('player-001 was repositioned by the DM to 2,2'),
    true,
  );
  assert.equal(containsInternalIdentifier('dm-001 moved to 1,1'), true);
  assert.equal(containsInternalIdentifier('Alder Finch moved to 1,1'), false);
});
