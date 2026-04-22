import { z } from 'zod';

import {
  characterIdSchema,
  commandIdSchema,
  participantIdSchema,
  sessionIdSchema,
} from './common.js';
import { characterResourceSchema, hitPointsSchema } from './character.js';
import { commandErrorSchema } from './errors.js';

const dmActorSchema = z.object({
  participantId: participantIdSchema,
});

export const dmSetCharacterCurrentHpCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_character_current_hp'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    characterId: characterIdSchema,
    currentHp: z.number().int(),
  }),
});

export const dmCommandSchema = z.discriminatedUnion('type', [
  dmSetCharacterCurrentHpCommandSchema,
]);

export const dmCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: characterResourceSchema,
});

export const dmCommandErrorSchema = commandErrorSchema;

export const dmCommandResponseSchema = z.union([
  dmCommandSuccessSchema,
  dmCommandErrorSchema,
]);

export const characterStateUpdateReasonSchema = z.enum(['dm_hp_changed']);

export const characterStateUpdateSchema = z.object({
  type: z.literal('character_state'),
  reason: characterStateUpdateReasonSchema,
  sessionId: sessionIdSchema,
  participantId: participantIdSchema,
  characterId: characterIdSchema,
  hp: hitPointsSchema,
});

export type DmSetCharacterCurrentHpCommand = z.infer<
  typeof dmSetCharacterCurrentHpCommandSchema
>;
export type DmCommand = z.infer<typeof dmCommandSchema>;
export type DmCommandSuccess = z.infer<typeof dmCommandSuccessSchema>;
export type DmCommandError = z.infer<typeof dmCommandErrorSchema>;
export type DmCommandResponse = z.infer<typeof dmCommandResponseSchema>;
export type CharacterStateUpdateReason = z.infer<
  typeof characterStateUpdateReasonSchema
>;
export type CharacterStateUpdate = z.infer<typeof characterStateUpdateSchema>;
