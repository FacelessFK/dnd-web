/**
 * Building a player intent record.
 *
 * Small on purpose. An intent is inert by product rule: the text is stored and
 * shown, never parsed, never translated, and never allowed to move HP,
 * conditions, position or turn state. There is nothing to interpret here, and
 * anything that looked like interpretation would be the bug.
 *
 * The status transitions live in `session-table-state.ts` beside the state they
 * guard; this module only assembles the record the GM will later act on.
 */
import { randomUUID } from 'node:crypto';

import type { PlayerIntent, SubmitPlayerIntentCommand } from '@dnd/protocol';
import type { CharacterId, ParticipantId, SessionId } from '@dnd/shared';

export function createPlayerIntentId(): string {
  return `intent_${randomUUID()}`;
}

/**
 * `authorParticipantId` is taken from the authenticated participant the runtime
 * resolved, never from the payload - the command schema does not even offer an
 * author field, and adding one would make authorship claimable.
 */
export function buildPlayerIntent(params: {
  command: SubmitPlayerIntentCommand;
  intentId: string;
  sessionId: SessionId;
  authorParticipantId: ParticipantId;
  authorCharacterId?: CharacterId;
  createdAt: string;
}): PlayerIntent {
  return {
    id: params.intentId,
    sessionId: params.sessionId,
    authorParticipantId: params.authorParticipantId,
    ...(params.authorCharacterId
      ? { authorCharacterId: params.authorCharacterId }
      : {}),
    // Stored exactly as the schema trimmed it. No normalization, no escaping,
    // no translation: it is the player's sentence, and the renderer is what
    // decides how to display it safely.
    text: params.command.payload.text,
    status: 'pending',
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
  };
}
