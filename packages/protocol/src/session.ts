import { z } from 'zod';

import {
  connectionStatuses,
  participantRoles,
  sessionStatuses,
} from '@dnd/shared';

import {
  characterIdSchema,
  commandIdSchema,
  displayNameSchema,
  participantIdSchema,
  participantTokenSchema,
  revisionSchema,
  rulesProfileIdSchema,
  sceneIdSchema,
  sessionIdSchema,
} from './common.js';
import { commandErrorSchema } from './errors.js';

export const participantRoleSchema = z.enum(participantRoles);
export const connectionStatusSchema = z.enum(connectionStatuses);
export const sessionStatusSchema = z.enum(sessionStatuses);

export const participantSchema = z.object({
  id: participantIdSchema,
  displayName: displayNameSchema,
  role: participantRoleSchema,
  connectionStatus: connectionStatusSchema,
  joinedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  characterId: characterIdSchema.nullable(),
  pendingCharacterId: characterIdSchema.nullable(),
});

export const sessionSchema = z.object({
  id: sessionIdSchema,
  status: sessionStatusSchema,
  dmParticipantId: participantIdSchema,
  playerParticipantIds: z.array(participantIdSchema),
  rulesProfileId: rulesProfileIdSchema,
  activeSceneId: sceneIdSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revision: revisionSchema,
});

export const sessionSnapshotSchema = z.object({
  session: sessionSchema,
  participants: z.array(participantSchema),
});

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
    rulesProfileId: rulesProfileIdSchema,
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

export const sessionCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    /**
     * The caller's credential for this session. Store it, send it on every
     * subsequent command, and keep it out of logs and URLs that get recorded.
     */
    participantToken: participantTokenSchema,
    state: sessionSnapshotSchema,
    /**
     * Path only. It deliberately does not embed the token, so that a stream
     * path can be logged. The client appends the token when it subscribes.
     */
    streamPath: z.string().min(1),
  }),
});

export const sessionCommandErrorSchema = commandErrorSchema;

export const sessionCommandResponseSchema = z.union([
  sessionCommandSuccessSchema,
  sessionCommandErrorSchema,
]);

export const sessionStateUpdateReasonSchema = z.enum([
  'active_scene_changed',
  'initial_sync',
  'participant_character_assigned',
  'participant_character_submitted',
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
export type SessionStateUpdate = z.infer<typeof sessionStateUpdateSchema>;
export type SessionStateUpdateReason = z.infer<
  typeof sessionStateUpdateReasonSchema
>;
