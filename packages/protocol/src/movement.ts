import { z } from 'zod';

import {
  characterIdSchema,
  commandIdSchema,
  participantIdSchema,
  sceneIdSchema,
  sessionIdSchema,
} from './common.js';
import { characterResourceSchema } from './character.js';
import { commandErrorSchema } from './errors.js';
import { sceneEntityFootprintSchema, scenePositionSchema } from './scene.js';

const movementActorSchema = z.object({
  participantId: participantIdSchema,
});

// This command is intentionally narrow for the current slice: it represents
// the first authoritative placement of an assigned character into the active
// scene, not an unrestricted reposition API.
export const placeCharacterInActiveSceneCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('place_character_in_active_scene'),
  actor: movementActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    position: scenePositionSchema,
  }),
});

export const moveCharacterInActiveSceneCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('move_character_in_active_scene'),
  actor: movementActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    position: scenePositionSchema,
  }),
});

export const movementCommandSchema = z.discriminatedUnion('type', [
  placeCharacterInActiveSceneCommandSchema,
  moveCharacterInActiveSceneCommandSchema,
]);

export const movementCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: characterResourceSchema,
});

export const movementCommandErrorSchema = commandErrorSchema;

export const movementCommandResponseSchema = z.union([
  movementCommandSuccessSchema,
  movementCommandErrorSchema,
]);

export const movementStateUpdateReasonSchema = z.enum([
  'character_moved',
  'character_placed',
]);

export const movementStateUpdateSchema = z.object({
  type: z.literal('movement_state'),
  reason: movementStateUpdateReasonSchema,
  sessionId: sessionIdSchema,
  activeSceneId: sceneIdSchema,
  participantId: participantIdSchema,
  characterId: characterIdSchema,
  position: scenePositionSchema,
  footprint: sceneEntityFootprintSchema,
});

export type PlaceCharacterInActiveSceneCommand = z.infer<
  typeof placeCharacterInActiveSceneCommandSchema
>;
export type MoveCharacterInActiveSceneCommand = z.infer<
  typeof moveCharacterInActiveSceneCommandSchema
>;
export type MovementCommand = z.infer<typeof movementCommandSchema>;
export type MovementCommandSuccess = z.infer<
  typeof movementCommandSuccessSchema
>;
export type MovementCommandError = z.infer<typeof movementCommandErrorSchema>;
export type MovementCommandResponse = z.infer<
  typeof movementCommandResponseSchema
>;
export type MovementStateUpdateReason = z.infer<
  typeof movementStateUpdateReasonSchema
>;
export type MovementStateUpdate = z.infer<typeof movementStateUpdateSchema>;
