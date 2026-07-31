/**
 * One dice-resolution record, shared by every surface that reports a roll.
 *
 * Ability checks, saving throws and attacks differ in what they are *for*, not
 * in how a d20 result is justified, so they share one record instead of three
 * near-identical shapes that drift. `kind` carries the semantic difference and
 * must never be flattened: a saving throw recorded as an ability check is a
 * corrupted audit trail, not a formatting detail.
 *
 * The record exists so PRD P3 holds - every number the UI shows traces back to
 * dice, modifiers and named sources the server supplied. The browser renders
 * this; it never recomputes it.
 */
import { z } from 'zod';

import {
  characterIdSchema,
  commandIdSchema,
  participantIdSchema,
  rulesProfileIdSchema,
  sessionIdSchema,
  skillIdSchema,
} from './common.js';
import { commandErrorSchema } from './errors.js';

export const resolutionIdPattern = /^resolution_[a-f0-9-]{36}$/;

export const resolutionIdSchema = z
  .string()
  .trim()
  .regex(resolutionIdPattern, 'Resolution ID must be "resolution_" + a UUID.');

export const abilityKeySchema = z.enum([
  'str',
  'dex',
  'con',
  'int',
  'wis',
  'cha',
]);

export const resolutionKindSchema = z.enum([
  'ability_check',
  'saving_throw',
  'attack_roll',
]);

/**
 * Advantage and disadvantage are a property of the roll, not of the modifier
 * list: they change how many dice are rolled and which one counts, and they
 * cancel rather than stack. Keeping them out of `modifiers` is what stops a
 * second source of disadvantage from being added twice.
 */
export const rollStanceSchema = z.enum(['normal', 'advantage', 'disadvantage']);

/**
 * Where one part of the modifier total came from.
 *
 * `source` is a canonical, untranslated key - the UI maps it to localized copy.
 * `detail` narrows it (a condition ID, a skill ID) and is likewise canonical.
 */
export const modifierSourceKindSchema = z.enum([
  'ability',
  'proficiency',
  'condition',
  'gm_adjustment',
]);

export const modifierSourceSchema = z.object({
  kind: modifierSourceKindSchema,
  detail: z.string().trim().min(1).max(64).optional(),
  value: z.number().int().min(-99).max(99),
});

/**
 * A stance contribution that changed the dice rather than the total, recorded
 * so the UI can say *why* a roll had advantage or disadvantage.
 */
export const stanceSourceSchema = z.object({
  kind: z.enum(['condition', 'gm_request']),
  detail: z.string().trim().min(1).max(64).optional(),
  stance: rollStanceSchema,
});

export const diceResolutionSchema = z.object({
  id: resolutionIdSchema,
  kind: resolutionKindSchema,
  rulesProfileId: rulesProfileIdSchema,
  sessionId: sessionIdSchema,
  actorParticipantId: participantIdSchema,
  actorCharacterId: characterIdSchema.optional(),
  ability: abilityKeySchema,
  skill: skillIdSchema.optional(),
  stance: rollStanceSchema,
  /** Every d20 face rolled: one normally, two under advantage/disadvantage. */
  dice: z.array(z.number().int().min(1).max(20)).min(1).max(2),
  /** The face that counted, after applying the stance. */
  selectedDie: z.number().int().min(1).max(20),
  stanceSources: z.array(stanceSourceSchema).max(8).optional(),
  modifiers: z.array(modifierSourceSchema).max(16),
  modifierTotal: z.number().int(),
  total: z.number().int(),
  /** Present for checks and saves. */
  dc: z.number().int().min(1).max(50).optional(),
  /** Present for attack rolls. */
  targetArmorClass: z.number().int().min(0).max(99).optional(),
  /** Absent only when the resolution has no pass/fail semantics. */
  success: z.boolean().optional(),
  critical: z.boolean().optional(),
  criticalMiss: z.boolean().optional(),
  /** Ties the resolution back to the GM request that asked for it. */
  requestId: resolutionIdSchema.optional(),
  commandId: commandIdSchema,
  resolvedAt: z.string().datetime(),
});

// ---------------------------------------------------------------- requests

export const resolutionRequestStatusSchema = z.enum([
  'pending',
  'resolved',
  'cancelled',
]);

/**
 * A GM asking a specific seat for a check or a save.
 *
 * `consequence` is GM-authored prose, deliberately inert: it tells the player
 * what is at stake and is never interpreted or auto-applied. Applying a
 * condition after a failed save stays an explicit GM command.
 */
export const resolutionRequestSchema = z.object({
  id: resolutionIdSchema,
  sessionId: sessionIdSchema,
  kind: z.enum(['ability_check', 'saving_throw']),
  status: resolutionRequestStatusSchema,
  requestedByParticipantId: participantIdSchema,
  targetParticipantId: participantIdSchema,
  targetCharacterId: characterIdSchema.optional(),
  ability: abilityKeySchema,
  skill: skillIdSchema.optional(),
  dc: z.number().int().min(1).max(50),
  stance: rollStanceSchema,
  reason: z.string().trim().max(240).optional(),
  consequence: z.string().trim().max(240).optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  resolutionId: resolutionIdSchema.optional(),
});

export const requestResolutionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('request_resolution'),
  actor: z.object({ participantId: participantIdSchema }),
  payload: z.object({
    sessionId: sessionIdSchema,
    kind: z.enum(['ability_check', 'saving_throw']),
    targetParticipantId: participantIdSchema,
    ability: abilityKeySchema,
    skill: skillIdSchema.optional(),
    dc: z.number().int().min(1).max(50),
    stance: rollStanceSchema.default('normal'),
    reason: z.string().trim().max(240).optional(),
    consequence: z.string().trim().max(240).optional(),
  }),
});

export const submitResolutionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('submit_resolution'),
  actor: z.object({ participantId: participantIdSchema }),
  payload: z.object({
    sessionId: sessionIdSchema,
    requestId: resolutionIdSchema,
  }),
});

export const cancelResolutionRequestCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('cancel_resolution_request'),
  actor: z.object({ participantId: participantIdSchema }),
  payload: z.object({
    sessionId: sessionIdSchema,
    requestId: resolutionIdSchema,
  }),
});

export const resolutionCommandSchema = z.discriminatedUnion('type', [
  requestResolutionCommandSchema,
  submitResolutionCommandSchema,
  cancelResolutionRequestCommandSchema,
]);

export const resolutionStateSchema = z.object({
  requests: z.array(resolutionRequestSchema),
  resolutions: z.array(diceResolutionSchema),
});

export const resolutionCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    sessionId: sessionIdSchema,
    state: resolutionStateSchema,
  }),
});

export const resolutionCommandErrorSchema = commandErrorSchema;

export const resolutionCommandResponseSchema = z.union([
  resolutionCommandSuccessSchema,
  resolutionCommandErrorSchema,
]);

export const resolutionStateUpdateReasonSchema = z.enum([
  'resolution_requested',
  'resolution_submitted',
  'resolution_request_cancelled',
]);

export const resolutionStateUpdateSchema = z.object({
  type: z.literal('resolution_state'),
  reason: resolutionStateUpdateReasonSchema,
  sessionId: sessionIdSchema,
  state: resolutionStateSchema,
});

export type AbilityKey = z.infer<typeof abilityKeySchema>;
export type ResolutionKind = z.infer<typeof resolutionKindSchema>;
export type RollStance = z.infer<typeof rollStanceSchema>;
export type ModifierSource = z.infer<typeof modifierSourceSchema>;
export type StanceSource = z.infer<typeof stanceSourceSchema>;
export type DiceResolution = z.infer<typeof diceResolutionSchema>;
export type ResolutionRequest = z.infer<typeof resolutionRequestSchema>;
export type ResolutionState = z.infer<typeof resolutionStateSchema>;
export type ResolutionCommand = z.infer<typeof resolutionCommandSchema>;
export type RequestResolutionCommand = z.infer<
  typeof requestResolutionCommandSchema
>;
export type SubmitResolutionCommand = z.infer<
  typeof submitResolutionCommandSchema
>;
export type CancelResolutionRequestCommand = z.infer<
  typeof cancelResolutionRequestCommandSchema
>;
export type ResolutionCommandSuccess = z.infer<
  typeof resolutionCommandSuccessSchema
>;
export type ResolutionCommandError = z.infer<
  typeof resolutionCommandErrorSchema
>;
export type ResolutionCommandResponse = z.infer<
  typeof resolutionCommandResponseSchema
>;
export type ResolutionStateUpdate = z.infer<typeof resolutionStateUpdateSchema>;
export type ResolutionStateUpdateReason = z.infer<
  typeof resolutionStateUpdateReasonSchema
>;
