'use client';

/**
 * The one place M1 table state and M1 commands live.
 *
 * Kept out of the cockpit so the panels can be wired with four props instead of
 * forty, and so the state rules - merge by ID, dedupe feedback, map an error
 * code to a key - are testable in the helper modules they came from rather than
 * inside a component.
 *
 * Command IDs are minted once per user action and reused for the retry of that
 * same action. That is what makes a double-click or a flaky connection replay
 * the original result instead of producing a second roll.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import type {
  AbilityKey,
  PlayerIntentStatus,
  ResolutionRequest,
  RollStance,
  SessionStreamEvent,
} from '@dnd/protocol';

type SkillId = NonNullable<ResolutionRequest['skill']>;

import {
  appendM1Feedback,
  describeM1Feedback,
  type M1FeedbackItem,
} from './m1-feedback';
import { describeM1ErrorCode } from './m1-resolution-view';
import {
  createEmptyM1TableState,
  mergeM1TableState,
  type M1TableState,
} from './m1-table-state';
import {
  createCommandId,
  sendPlayerIntentCommand,
  sendResolutionCommand,
  type RuntimeApiResult,
} from './runtime-api';

export type M1CommandLabel =
  | 'request_resolution'
  | 'submit_resolution'
  | 'cancel_resolution_request'
  | 'submit_player_intent'
  | 'update_player_intent_status';

type UseM1TableParams = {
  participantId: string;
  sessionId: string;
};

export type UseM1TableResult = {
  busyLabel: M1CommandLabel | null;
  busyRequestId: string | null;
  cancelRequest: (request: ResolutionRequest) => Promise<void>;
  clearFeedback: (id: string) => void;
  errorKey: string | null;
  feedback: M1FeedbackItem[];
  ingestStreamEvent: (event: SessionStreamEvent) => void;
  requestResolution: (input: {
    ability: AbilityKey;
    dc: number;
    kind: 'ability_check' | 'saving_throw';
    reason: string;
    skill: string;
    stance: RollStance;
    targetParticipantId: string;
  }) => Promise<void>;
  resetTable: () => void;
  submitIntent: (text: string) => Promise<void>;
  submitResolution: (request: ResolutionRequest) => Promise<void>;
  table: M1TableState;
  updateIntentStatus: (
    intentId: string,
    status: Exclude<PlayerIntentStatus, 'pending'>,
  ) => Promise<void>;
};

export function useM1Table({
  participantId,
  sessionId,
}: UseM1TableParams): UseM1TableResult {
  const [table, setTable] = useState<M1TableState>(createEmptyM1TableState);
  const [feedback, setFeedback] = useState<M1FeedbackItem[]>([]);
  const [busyLabel, setBusyLabel] = useState<M1CommandLabel | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // Per-request command IDs, so retrying the same roll replays the cached
  // result rather than asking the server for a second one.
  const submitCommandIds = useRef(new Map<string, string>());

  const ingestStreamEvent = useCallback((event: SessionStreamEvent) => {
    if (event.type === 'resolution_state') {
      setTable((current) =>
        mergeM1TableState(current, {
          requests: event.state.requests,
          resolutions: event.state.resolutions,
        }),
      );
    }

    if (event.type === 'player_intent_state') {
      setTable((current) =>
        mergeM1TableState(current, { intents: event.state.intents }),
      );
    }

    setFeedback((current) =>
      appendM1Feedback(current, describeM1Feedback(event)),
    );
  }, []);

  const clearFeedback = useCallback((id: string) => {
    setFeedback((current) => current.filter((item) => item.id !== id));
  }, []);

  const resetTable = useCallback(() => {
    setTable(createEmptyM1TableState());
    setFeedback([]);
    setErrorKey(null);
    submitCommandIds.current.clear();
  }, []);

  /**
   * Runs a command and folds its answer back in.
   *
   * A success carries the caller's own projection of the table, which is
   * merged exactly like a stream frame. A failure becomes a localizable key -
   * never a raw code, never a payload - and leaves the table untouched, because
   * the server did not change it.
   */
  const run = useCallback(
    async <T extends { data: { state: Partial<M1TableState> } }>(
      label: M1CommandLabel,
      requestId: string | null,
      send: () => Promise<RuntimeApiResult<T>>,
    ): Promise<void> => {
      setBusyLabel(label);
      setBusyRequestId(requestId);
      setErrorKey(null);

      try {
        const result = await send();

        if (!result.ok) {
          setErrorKey(describeM1ErrorCode(result.error.code).key);
          return;
        }

        setTable((current) =>
          mergeM1TableState(current, result.response.data.state),
        );
      } finally {
        setBusyLabel(null);
        setBusyRequestId(null);
      }
    },
    [],
  );

  const requestResolution = useCallback<UseM1TableResult['requestResolution']>(
    async (input) =>
      run('request_resolution', null, () =>
        sendResolutionCommand({
          actor: { participantId },
          commandId: createCommandId('m1-request'),
          payload: {
            ability: input.ability,
            dc: input.dc,
            kind: input.kind,
            ...(input.reason ? { reason: input.reason } : {}),
            // Canonical skill ID or nothing. An empty string would be a
            // schema error, and a saving throw has no skill to send.
            ...(input.skill ? { skill: input.skill as SkillId } : {}),
            sessionId,
            stance: input.stance,
            targetParticipantId: input.targetParticipantId,
          },
          type: 'request_resolution',
        }),
      ),
    [participantId, run, sessionId],
  );

  const submitResolution = useCallback(
    async (request: ResolutionRequest) => {
      const existing = submitCommandIds.current.get(request.id);
      const commandId = existing ?? createCommandId('m1-submit');

      submitCommandIds.current.set(request.id, commandId);

      await run('submit_resolution', request.id, () =>
        sendResolutionCommand({
          actor: { participantId },
          commandId,
          payload: { requestId: request.id, sessionId },
          type: 'submit_resolution',
        }),
      );
    },
    [participantId, run, sessionId],
  );

  const cancelRequest = useCallback(
    async (request: ResolutionRequest) =>
      run('cancel_resolution_request', request.id, () =>
        sendResolutionCommand({
          actor: { participantId },
          commandId: createCommandId('m1-cancel'),
          payload: { requestId: request.id, sessionId },
          type: 'cancel_resolution_request',
        }),
      ),
    [participantId, run, sessionId],
  );

  const submitIntent = useCallback(
    async (text: string) =>
      run('submit_player_intent', null, () =>
        sendPlayerIntentCommand({
          actor: { participantId },
          commandId: createCommandId('m1-intent'),
          payload: { sessionId, text },
          type: 'submit_player_intent',
        }),
      ),
    [participantId, run, sessionId],
  );

  const updateIntentStatus = useCallback(
    async (intentId: string, status: Exclude<PlayerIntentStatus, 'pending'>) =>
      run('update_player_intent_status', null, () =>
        sendPlayerIntentCommand({
          actor: { participantId },
          commandId: createCommandId('m1-intent-status'),
          payload: { intentId, sessionId, status },
          type: 'update_player_intent_status',
        }),
      ),
    [participantId, run, sessionId],
  );

  return useMemo(
    () => ({
      busyLabel,
      busyRequestId,
      cancelRequest,
      clearFeedback,
      errorKey,
      feedback,
      ingestStreamEvent,
      requestResolution,
      resetTable,
      submitIntent,
      submitResolution,
      table,
      updateIntentStatus,
    }),
    [
      busyLabel,
      busyRequestId,
      cancelRequest,
      clearFeedback,
      errorKey,
      feedback,
      ingestStreamEvent,
      requestResolution,
      resetTable,
      submitIntent,
      submitResolution,
      table,
      updateIntentStatus,
    ],
  );
}
