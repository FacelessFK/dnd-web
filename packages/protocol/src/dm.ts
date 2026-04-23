import { z } from 'zod';

import {
  characterIdSchema,
  commandIdSchema,
  participantIdSchema,
  sessionIdSchema,
} from './common.js';
import {
  activeConditionsSchema,
  characterResourceSchema,
  hitPointsSchema,
  turnUsageSchema,
} from './character.js';
import { encounterSchema } from './encounter.js';
import { commandErrorSchema } from './errors.js';
import { scenePositionSchema } from './scene.js';

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

export const dmSetCharacterActiveConditionsCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_character_active_conditions'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    characterId: characterIdSchema,
    activeConditions: z.array(z.string()).max(50),
  }),
});

export const dmRepositionCharacterInActiveSceneCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_reposition_character_in_active_scene'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    characterId: characterIdSchema,
    position: scenePositionSchema,
  }),
});

export const dmSetCurrentTurnUsageCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_current_turn_usage'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    turnUsage: turnUsageSchema,
  }),
});

export const dmSetCurrentTurnParticipantCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_current_turn_participant'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
  }),
});

export const dmEndActiveEncounterCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_end_active_encounter'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const dmCommandSchema = z.discriminatedUnion('type', [
  dmSetCharacterCurrentHpCommandSchema,
  dmSetCharacterActiveConditionsCommandSchema,
  dmRepositionCharacterInActiveSceneCommandSchema,
  dmSetCurrentTurnUsageCommandSchema,
  dmSetCurrentTurnParticipantCommandSchema,
  dmEndActiveEncounterCommandSchema,
]);

const dmEncounterCommandSuccessDataSchema = z.object({
  encounter: encounterSchema,
});

export const dmCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.union([characterResourceSchema, dmEncounterCommandSuccessDataSchema]),
});

export const dmCommandErrorSchema = commandErrorSchema;

export const dmCommandResponseSchema = z.union([
  dmCommandSuccessSchema,
  dmCommandErrorSchema,
]);

export const characterStateUpdateReasonSchema = z.enum([
  'dm_hp_changed',
  'dm_conditions_changed',
]);

export const characterStateUpdateSchema = z.object({
  type: z.literal('character_state'),
  reason: characterStateUpdateReasonSchema,
  sessionId: sessionIdSchema,
  participantId: participantIdSchema,
  characterId: characterIdSchema,
  hp: hitPointsSchema,
  activeConditions: activeConditionsSchema.optional(),
});

export type DmSetCharacterCurrentHpCommand = z.infer<
  typeof dmSetCharacterCurrentHpCommandSchema
>;
export type DmSetCharacterActiveConditionsCommand = z.infer<
  typeof dmSetCharacterActiveConditionsCommandSchema
>;
export type DmRepositionCharacterInActiveSceneCommand = z.infer<
  typeof dmRepositionCharacterInActiveSceneCommandSchema
>;
export type DmSetCurrentTurnUsageCommand = z.infer<
  typeof dmSetCurrentTurnUsageCommandSchema
>;
export type DmSetCurrentTurnParticipantCommand = z.infer<
  typeof dmSetCurrentTurnParticipantCommandSchema
>;
export type DmEndActiveEncounterCommand = z.infer<
  typeof dmEndActiveEncounterCommandSchema
>;
export type DmCommand = z.infer<typeof dmCommandSchema>;
export type DmCommandSuccess = z.infer<typeof dmCommandSuccessSchema>;
export type DmCommandError = z.infer<typeof dmCommandErrorSchema>;
export type DmCommandResponse = z.infer<typeof dmCommandResponseSchema>;
export type CharacterStateUpdateReason = z.infer<
  typeof characterStateUpdateReasonSchema
>;
export type CharacterStateUpdate = z.infer<typeof characterStateUpdateSchema>;
