import { z } from 'zod';

import {
  connectionStatuses,
  participantRoles,
  sessionStatuses,
} from '@dnd/shared';

export const sessionIdPattern = /^[A-Z0-9]{6}$/;
export const participantIdPattern = /^[a-zA-Z0-9_-]{2,64}$/;

export const sessionIdSchema = z
  .string()
  .trim()
  .regex(sessionIdPattern, 'Session ID must be 6 uppercase letters or digits.');

export const participantIdSchema = z
  .string()
  .trim()
  .regex(
    participantIdPattern,
    'Participant ID must be 2-64 characters and use letters, numbers, "_" or "-".',
  );

export const displayNameSchema = z.string().trim().min(1).max(48);
export const participantRoleSchema = z.enum(participantRoles);
export const connectionStatusSchema = z.enum(connectionStatuses);
export const sessionStatusSchema = z.enum(sessionStatuses);
export const revisionSchema = z.number().int().min(1);

export const participantSchema = z.object({
  id: participantIdSchema,
  displayName: displayNameSchema,
  role: participantRoleSchema,
  connectionStatus: connectionStatusSchema,
  joinedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  characterId: z.string().nullable(),
});

export const sessionSchema = z.object({
  id: sessionIdSchema,
  status: sessionStatusSchema,
  dmParticipantId: participantIdSchema,
  playerParticipantIds: z.array(participantIdSchema),
  rulesProfileId: z.string().nullable(),
  activeSceneId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revision: revisionSchema,
});

export const sessionSnapshotSchema = z.object({
  session: sessionSchema,
  participants: z.array(participantSchema),
});

const commandIdSchema = z.string().trim().min(1).max(128);

const createActorSchema = z.object({
  participantId: participantIdSchema,
  displayName: displayNameSchema,
  role: participantRoleSchema.optional(),
});

const reconnectActorSchema = z.object({
  participantId: participantIdSchema,
  displayName: displayNameSchema.optional(),
  role: participantRoleSchema.optional(),
});

export const createSessionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('create_session'),
  actor: createActorSchema,
  payload: z.object({
    rulesProfileId: z.string().trim().min(1).nullable().optional(),
  }),
});

export const joinSessionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('join_session'),
  actor: createActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const reconnectSessionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('reconnect_session'),
  actor: reconnectActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const clientCommandSchema = z.discriminatedUnion('type', [
  createSessionCommandSchema,
  joinSessionCommandSchema,
  reconnectSessionCommandSchema,
]);

export const sessionErrorCodeSchema = z.enum([
  'duplicate_join',
  'internal_server_error',
  'invalid_command',
  'invalid_role_assumption',
  'invalid_session_id',
  'participant_not_found',
  'session_not_found',
]);

export const sessionCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    state: sessionSnapshotSchema,
    streamPath: z.string().min(1),
  }),
});

export const sessionCommandErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: sessionErrorCodeSchema,
    message: z.string().min(1),
  }),
});

export const sessionCommandResponseSchema = z.union([
  sessionCommandSuccessSchema,
  sessionCommandErrorSchema,
]);

export const sessionStateUpdateReasonSchema = z.enum([
  'initial_sync',
  'participant_connected',
  'participant_disconnected',
  'participant_joined',
]);

export const sessionStateUpdateSchema = z.object({
  type: z.literal('session_state'),
  reason: sessionStateUpdateReasonSchema,
  sessionId: sessionIdSchema,
  revision: revisionSchema,
  state: sessionSnapshotSchema,
});

export type CreateSessionCommand = z.infer<typeof createSessionCommandSchema>;
export type JoinSessionCommand = z.infer<typeof joinSessionCommandSchema>;
export type ReconnectSessionCommand = z.infer<
  typeof reconnectSessionCommandSchema
>;
export type ClientCommand = z.infer<typeof clientCommandSchema>;
export type SessionCommandSuccess = z.infer<typeof sessionCommandSuccessSchema>;
export type SessionCommandError = z.infer<typeof sessionCommandErrorSchema>;
export type SessionCommandResponse = z.infer<
  typeof sessionCommandResponseSchema
>;
export type SessionErrorCode = z.infer<typeof sessionErrorCodeSchema>;
export type SessionStateUpdate = z.infer<typeof sessionStateUpdateSchema>;
export type SessionStateUpdateReason = z.infer<
  typeof sessionStateUpdateReasonSchema
>;
