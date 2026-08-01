'use client';

import { useEffect, useRef, useState } from 'react';

import {
  sessionStreamEventSchema,
  type SessionStreamEvent,
} from '@dnd/protocol';

import { buildSessionStreamUrl } from './runtime-api';

/**
 * The named frames this client subscribes to.
 *
 * `EventSource` only delivers an event whose `event:` name has a listener, so a
 * type missing from this list is silently never received - the stream looks
 * healthy and the panel simply never updates. Adding a protocol event type
 * means adding it here.
 */
const streamEventTypes: SessionStreamEvent['type'][] = [
  'session_state',
  'movement_state',
  'encounter_state',
  'combat_event',
  'character_state',
  'resolution_state',
  'player_intent_state',
];

export type SessionStreamStatus = 'connected' | 'idle' | 'reconnecting';

type UseSessionStreamParams = {
  enabled: boolean;
  onEvent: (event: SessionStreamEvent) => void;
  participantId: string | null;
  /**
   * Bump to tear down the current subscription and open a fresh one.
   *
   * The server sends its `initial_sync` frames once per connection, so a caller
   * that wants the authoritative table again - Recover - has no other way to ask
   * for it: there is no read command for resolution or intent state. Changing
   * `enabled` twice in one commit would collapse into no change at all, which is
   * why this is a counter rather than a toggle.
   */
  resubscribeToken?: number;
  sessionId: string | null;
};

export function useSessionStream({
  enabled,
  onEvent,
  participantId,
  resubscribeToken = 0,
  sessionId,
}: UseSessionStreamParams): {
  error: string | null;
  status: SessionStreamStatus;
} {
  const [status, setStatus] = useState<SessionStreamStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !sessionId || !participantId) {
      setStatus('idle');
      setError(null);
      return undefined;
    }

    const source = new EventSource(
      buildSessionStreamUrl(sessionId, participantId),
    );

    const handleTypedEvent = (message: MessageEvent<string>): void => {
      try {
        const parsed = sessionStreamEventSchema.safeParse(
          JSON.parse(message.data) as unknown,
        );

        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ??
              'Received an unexpected stream event.',
          );
          return;
        }

        onEventRef.current(parsed.data);
      } catch {
        setError('Received a stream event that was not valid JSON.');
      }
    };

    source.onopen = () => {
      setError(null);
      setStatus('connected');
    };

    source.onerror = () => {
      setStatus('reconnecting');
      setError('Stream disconnected. The browser will retry while subscribed.');
    };

    for (const eventType of streamEventTypes) {
      source.addEventListener(eventType, handleTypedEvent);
    }

    return () => {
      source.close();
      setStatus('idle');
    };
  }, [enabled, participantId, resubscribeToken, sessionId]);

  return {
    error,
    status,
  };
}
