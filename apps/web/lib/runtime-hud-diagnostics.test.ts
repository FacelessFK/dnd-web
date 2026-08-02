import assert from 'node:assert/strict';
import test from 'node:test';

import type { SessionStreamEvent } from '@dnd/protocol';

import { messages } from './i18n';
import { containsInternalIdentifier } from './runtime-shell-view';
import {
  selectRuntimeFeedEntries,
  type RuntimeLogEntry,
} from './runtime-hud-diagnostics';

const translate = ((key: string, values?: Record<string, string>) => {
  const template = (messages.en as Record<string, string>)[key];

  assert.ok(template, `missing English message for ${key}`);

  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    values && name in values ? values[name]! : `{${name}}`,
  );
}) as never;

function movementEvent(): SessionStreamEvent {
  return {
    participantId: 'player-001',
    position: { x: 3, y: 4 },
    reason: 'character_moved',
    sceneId: 'scene_5f0d0c1a-0000-4000-8000-000000000001',
    sessionId: 'ABC123',
    type: 'movement_state',
  } as SessionStreamEvent;
}

function entry(id: string, payload: unknown): RuntimeLogEntry {
  return { at: '10:00:00', id, label: 'movement_state', payload };
}

test('the feed carries summaries and never the payload they came from', () => {
  const entries = [entry('a', movementEvent())];
  const [summarized] = selectRuntimeFeedEntries(entries, translate);

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

  const feed = selectRuntimeFeedEntries(entries, translate);

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, 'stream');
});

test('the feed is bounded and keeps the newest entries', () => {
  // The ledger is newest-first, so the slice must keep the head. An unbounded
  // feed grows once per frame for as long as the table is open.
  const entries = Array.from({ length: 40 }, (_unused, index) =>
    entry(`e${index}`, movementEvent()),
  );

  const feed = selectRuntimeFeedEntries(entries, translate);

  assert.equal(feed.length, 8);
  assert.equal(feed[0]?.id, 'e0');
  assert.equal(feed.at(-1)?.id, 'e7');
});

test('nothing a player reads in the feed is an internal identifier', () => {
  const feed = selectRuntimeFeedEntries(
    [entry('a', movementEvent())],
    translate,
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
