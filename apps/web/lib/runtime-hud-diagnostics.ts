'use client';

/**
 * The debug ledger and the outbox badge.
 *
 * Kept apart from every other model so the Player shell can be built without
 * it. Nothing in a player's experience depends on anything here: the feed the
 * player sees is built from localized *summaries*, which this module also
 * produces, while the raw payloads stay behind `entries` for the GM's
 * diagnostics panel.
 *
 * The outbox badge is a development visibility aid. `GET /api/outbox/status`
 * returns backlog counts and nothing else - it does not drain, publish, mark
 * rows published or replay anything - so no caller here may present it as
 * delivery monitoring.
 */
import { useState } from 'react';

import {
  createCommandId,
  fetchOutboxStatus,
  type OutboxStatusSuccessResponse,
} from './runtime-api';
import {
  describeSessionStreamEvent,
  getOutboxStatusView,
  isSessionStreamEvent,
} from './runtime-cockpit-helpers';
import {
  localizeRuntimeEventDescriptor,
  type RuntimeTranslator,
} from './runtime-localization';

/** One recorded moment: a command settling, or a frame arriving. */
export type RuntimeLogEntry = {
  at: string;
  id: string;
  label: string;
  payload: unknown;
};

export type RuntimeLastResponse = {
  label: string;
  payload: unknown;
};

/** How many entries the ledger keeps. Bounded because it grows per frame. */
const logLimit = 40;

/** How many summaries the player-facing feed shows. */
const feedLimit = 8;

export function useRuntimeDiagnostics() {
  const [entries, setEntries] = useState<RuntimeLogEntry[]>([]);
  const [lastResponse, setLastResponse] = useState<RuntimeLastResponse | null>(
    null,
  );
  const [outboxStatus, setOutboxStatus] = useState<
    OutboxStatusSuccessResponse['data'] | null
  >(null);
  const [outboxStatusError, setOutboxStatusError] = useState<string | null>(
    null,
  );
  const [outboxStatusLoading, setOutboxStatusLoading] = useState(false);

  function push(label: string, payload: unknown): void {
    setEntries((current) =>
      [
        {
          at: new Date().toLocaleTimeString(),
          id: createCommandId('event'),
          label,
          payload,
        },
        ...current,
      ].slice(0, logLimit),
    );
  }

  function recordSettled(label: string, payload: unknown): void {
    setLastResponse({ label, payload });
    push(label, payload);
  }

  function reset(): void {
    setEntries([]);
    setLastResponse(null);
  }

  async function refreshOutboxStatus(): Promise<void> {
    setOutboxStatusLoading(true);
    setOutboxStatusError(null);

    const result = await fetchOutboxStatus();

    if (result.ok) {
      setOutboxStatus(result.response.data);
    } else {
      setOutboxStatus(null);
      setOutboxStatusError(result.error.message);
    }

    setOutboxStatusLoading(false);
  }

  return {
    entries,
    lastResponse,
    outbox: {
      error: outboxStatusError,
      loading: outboxStatusLoading,
      refresh: refreshOutboxStatus,
      view: getOutboxStatusView({
        data: outboxStatus,
        error: outboxStatusError,
        loading: outboxStatusLoading,
      }),
    },
    push,
    recordSettled,
    reset,
  };
}

export type RuntimeDiagnosticsModel = ReturnType<typeof useRuntimeDiagnostics>;

/**
 * The recent-events feed, as localized summaries with no payload attached.
 *
 * Pure, so the "a player's feed carries no protocol payload" property is a test
 * rather than a promise: only entries that really are stream events survive,
 * and each becomes a title, a detail and a tone.
 */
export function selectRuntimeFeedEntries(
  entries: RuntimeLogEntry[],
  t: RuntimeTranslator,
) {
  return entries
    .flatMap((entry) =>
      isSessionStreamEvent(entry.payload)
        ? [
            {
              at: entry.at,
              id: entry.id,
              summary: localizeRuntimeEventDescriptor(
                describeSessionStreamEvent(entry.payload),
                t,
              ),
            },
          ]
        : [],
    )
    .slice(0, feedLimit);
}
