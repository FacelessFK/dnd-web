import { z } from 'zod';

export const runtimeErrorCodeSchema = z.enum([
  'character_not_found',
  'duplicate_join',
  'internal_server_error',
  'invalid_character_id',
  'invalid_command',
  'invalid_participant_session_association',
  'invalid_role_assumption',
  'invalid_session_id',
  'participant_not_found',
  'rules_profile_not_found',
  'session_not_found',
]);

export const sessionErrorCodeSchema = runtimeErrorCodeSchema;

export const runtimeErrorSchema = z.object({
  code: runtimeErrorCodeSchema,
  message: z.string().min(1),
});

export const commandErrorSchema = z.object({
  ok: z.literal(false),
  error: runtimeErrorSchema,
});

export type RuntimeErrorCode = z.infer<typeof runtimeErrorCodeSchema>;
export type SessionErrorCode = RuntimeErrorCode;
