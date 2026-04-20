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

export const encounterCommandSchema = z.discriminatedUnion('type', [
  startEncounterCommandSchema,
  getEncounterStateCommandSchema,
  advanceTurnCommandSchema,
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
export type StartEncounterCommand = z.infer<typeof startEncounterCommandSchema>;
export type GetEncounterStateCommand = z.infer<
  typeof getEncounterStateCommandSchema
>;
export type AdvanceTurnCommand = z.infer<typeof advanceTurnCommandSchema>;
export type EncounterCommand = z.infer<typeof encounterCommandSchema>;
export type EncounterCommandSuccess = z.infer<
  typeof encounterCommandSuccessSchema
>;
export type EncounterCommandError = z.infer<typeof encounterCommandErrorSchema>;
export type EncounterCommandResponse = z.infer<
  typeof encounterCommandResponseSchema
>;
