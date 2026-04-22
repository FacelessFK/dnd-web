import { z } from 'zod';

import { encounterStatuses } from '@dnd/shared';

import {
  characterIdSchema,
  commandIdSchema,
  encounterIdSchema,
  participantIdSchema,
  sceneIdSchema,
  sessionIdSchema,
} from './common.js';
import { turnUsageSchema } from './character.js';
import { commandErrorSchema } from './errors.js';

const sessionActorSchema = z.object({
  participantId: participantIdSchema,
});

export const encounterStatusSchema = z.enum(encounterStatuses);

export const encounterParticipantSchema = z.object({
  characterId: characterIdSchema,
  participantId: participantIdSchema,
  initiative: z.number().int(),
});

export const encounterSchema = z.object({
  id: encounterIdSchema,
  sessionId: sessionIdSchema,
  sceneId: sceneIdSchema,
  status: encounterStatusSchema,
  participants: z.array(encounterParticipantSchema).min(1),
  currentTurnIndex: z.number().int().min(0),
  roundNumber: z.number().int().min(1),
  currentTurnUsage: turnUsageSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const encounterStateUpdateReasonSchema = z.enum([
  'encounter_started',
  'turn_advanced',
  'action_used',
  'bonus_action_used',
  'reaction_used',
  'movement_used',
  'dm_turn_usage_changed',
]);

export const encounterStateUpdateSchema = z.object({
  type: z.literal('encounter_state'),
  reason: encounterStateUpdateReasonSchema,
  sessionId: sessionIdSchema,
  encounter: encounterSchema,
});

export const startEncounterCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('start_encounter'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const getEncounterStateCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('get_encounter_state'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const advanceTurnCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('advance_turn'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

const movementUsageAmountSchema = z.number().int().min(1).max(999);

export const useActionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('use_action'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const useBonusActionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('use_bonus_action'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const useReactionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('use_reaction'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const recordMovementUsageCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('record_movement_usage'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    amountFeet: movementUsageAmountSchema,
  }),
});

export const attackCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('attack'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    targetParticipantId: participantIdSchema,
  }),
});

export const encounterCommandSchema = z.discriminatedUnion('type', [
  startEncounterCommandSchema,
  getEncounterStateCommandSchema,
  advanceTurnCommandSchema,
  useActionCommandSchema,
  useBonusActionCommandSchema,
  useReactionCommandSchema,
  recordMovementUsageCommandSchema,
  attackCommandSchema,
]);

export const encounterCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    encounter: encounterSchema,
  }),
});

export const encounterCommandErrorSchema = commandErrorSchema;

export const encounterCommandResponseSchema = z.union([
  encounterCommandSuccessSchema,
  encounterCommandErrorSchema,
]);

export type EncounterParticipant = z.infer<typeof encounterParticipantSchema>;
export type Encounter = z.infer<typeof encounterSchema>;
export type EncounterStateUpdateReason = z.infer<
  typeof encounterStateUpdateReasonSchema
>;
export type EncounterStateUpdate = z.infer<typeof encounterStateUpdateSchema>;
export type StartEncounterCommand = z.infer<typeof startEncounterCommandSchema>;
export type GetEncounterStateCommand = z.infer<
  typeof getEncounterStateCommandSchema
>;
export type AdvanceTurnCommand = z.infer<typeof advanceTurnCommandSchema>;
export type UseActionCommand = z.infer<typeof useActionCommandSchema>;
export type UseBonusActionCommand = z.infer<typeof useBonusActionCommandSchema>;
export type UseReactionCommand = z.infer<typeof useReactionCommandSchema>;
export type RecordMovementUsageCommand = z.infer<
  typeof recordMovementUsageCommandSchema
>;
export type AttackCommand = z.infer<typeof attackCommandSchema>;
export type EncounterCommand = z.infer<typeof encounterCommandSchema>;
export type EncounterCommandSuccess = z.infer<
  typeof encounterCommandSuccessSchema
>;
export type EncounterCommandError = z.infer<typeof encounterCommandErrorSchema>;
export type EncounterCommandResponse = z.infer<
  typeof encounterCommandResponseSchema
>;
