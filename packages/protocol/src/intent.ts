/**
 * Free-form player intent: a short sentence a player sends the GM when what
 * they want to do has no structured command behind it.
 *
 * Deliberately inert. An intent is a message on the table's record, not an
 * action: it never mutates scene, encounter, HP or character state, and nothing
 * interprets it. The GM reads it and responds with real commands. That is the
 * whole point - the product stays playable outside the combat grammar without
 * inventing an AI referee.
 *
 * The text is player-authored, so it is never auto-translated and never treated
 * as markup. Length is bounded because it is stored, streamed and rendered.
 */
import { z } from 'zod';

import {
  characterIdSchema,
  commandIdSchema,
  participantIdSchema,
  sessionIdSchema,
} from './common.js';

export const playerIntentIdPattern = /^intent_[a-f0-9-]{36}$/;

export const playerIntentIdSchema = z
  .string()
  .trim()
  .regex(playerIntentIdPattern, 'Intent ID must be "intent_" + a UUID.');

export const playerIntentStatusSchema = z.enum([
  'pending',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const playerIntentTextSchema = z
  .string()
  .trim()
  .min(1, 'Say what you want to do.')
  .max(280, 'Keep it to 280 characters.');

export const playerIntentSchema = z.object({
  id: playerIntentIdSchema,
  sessionId: sessionIdSchema,
  authorParticipantId: participantIdSchema,
  authorCharacterId: characterIdSchema.optional(),
  text: playerIntentTextSchema,
  status: playerIntentStatusSchema,
  /** GM's short reply. Also player-authored prose, also never interpreted. */
  gmNote: z.string().trim().max(280).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const submitPlayerIntentCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('submit_player_intent'),
  actor: z.object({ participantId: participantIdSchema }),
  payload: z.object({
    sessionId: sessionIdSchema,
    text: playerIntentTextSchema,
  }),
});

export const updatePlayerIntentStatusCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('update_player_intent_status'),
  actor: z.object({ participantId: participantIdSchema }),
  payload: z.object({
    sessionId: sessionIdSchema,
    intentId: playerIntentIdSchema,
    status: z.enum(['acknowledged', 'resolved', 'dismissed']),
    gmNote: z.string().trim().max(280).optional(),
  }),
});

export const playerIntentCommandSchema = z.discriminatedUnion('type', [
  submitPlayerIntentCommandSchema,
  updatePlayerIntentStatusCommandSchema,
]);

export const playerIntentStateSchema = z.object({
  intents: z.array(playerIntentSchema),
});

export const playerIntentCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    sessionId: sessionIdSchema,
    state: playerIntentStateSchema,
  }),
});

export const playerIntentStateUpdateReasonSchema = z.enum([
  'intent_submitted',
  'intent_status_changed',
]);

export const playerIntentStateUpdateSchema = z.object({
  type: z.literal('player_intent_state'),
  reason: playerIntentStateUpdateReasonSchema,
  sessionId: sessionIdSchema,
  state: playerIntentStateSchema,
});

export type PlayerIntent = z.infer<typeof playerIntentSchema>;
export type PlayerIntentStatus = z.infer<typeof playerIntentStatusSchema>;
export type PlayerIntentState = z.infer<typeof playerIntentStateSchema>;
export type PlayerIntentCommand = z.infer<typeof playerIntentCommandSchema>;
export type PlayerIntentStateUpdate = z.infer<
  typeof playerIntentStateUpdateSchema
>;
