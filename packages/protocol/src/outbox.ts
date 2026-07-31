import { z } from 'zod';

import { commandErrorSchema } from './errors.js';

export const outboxEventTypeSchema = z.enum([
  'character_state',
  'combat_event',
  'encounter_state',
  'movement_state',
  'session_state',
  'resolution_state',
  'player_intent_state',
]);

export const outboxEventTypeCountsSchema = z.object({
  character_state: z.number().int().nonnegative(),
  combat_event: z.number().int().nonnegative(),
  encounter_state: z.number().int().nonnegative(),
  movement_state: z.number().int().nonnegative(),
  session_state: z.number().int().nonnegative(),
  resolution_state: z.number().int().nonnegative(),
  player_intent_state: z.number().int().nonnegative(),
});

export const outboxStatusSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    configured: z.boolean(),
    eventTypeCounts: outboxEventTypeCountsSchema,
    oldestCreatedAt: z.string().datetime().nullable(),
    unpublishedCount: z.number().int().nonnegative(),
  }),
});

export const outboxStatusErrorSchema = commandErrorSchema;

export const outboxStatusResponseSchema = z.union([
  outboxStatusSuccessSchema,
  outboxStatusErrorSchema,
]);

export type OutboxEventType = z.infer<typeof outboxEventTypeSchema>;
export type OutboxEventTypeCounts = z.infer<typeof outboxEventTypeCountsSchema>;
export type OutboxStatusSuccess = z.infer<typeof outboxStatusSuccessSchema>;
export type OutboxStatusError = z.infer<typeof outboxStatusErrorSchema>;
export type OutboxStatusResponse = z.infer<typeof outboxStatusResponseSchema>;
