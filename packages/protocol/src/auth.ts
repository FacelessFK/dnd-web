import { z } from 'zod';

import { commandErrorSchema } from './errors.js';

export const authUserSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
  ownerParticipantId: z.string().trim().min(2).max(64),
  userId: z.string().trim().min(1).max(80),
});

export const registerAuthRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(256),
});

export const loginAuthRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});

export const authSuccessSchema = z.object({
  data: z.object({
    user: authUserSchema,
  }),
  ok: z.literal(true),
});

export const authMeSuccessSchema = z.object({
  data: z.object({
    user: authUserSchema.nullable(),
  }),
  ok: z.literal(true),
});

export const authErrorSchema = commandErrorSchema;

export const authResponseSchema = z.union([authSuccessSchema, authErrorSchema]);

export const authMeResponseSchema = z.union([
  authMeSuccessSchema,
  authErrorSchema,
]);

export type AuthUser = z.infer<typeof authUserSchema>;
export type RegisterAuthRequest = z.infer<typeof registerAuthRequestSchema>;
export type LoginAuthRequest = z.infer<typeof loginAuthRequestSchema>;
export type AuthSuccess = z.infer<typeof authSuccessSchema>;
export type AuthMeSuccess = z.infer<typeof authMeSuccessSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
