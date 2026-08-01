import { z } from 'zod';

import {
  characterIdSchema,
  encounterIdSchema,
  participantIdSchema,
  sceneEntityIdSchema,
  sessionIdSchema,
} from './common.js';
import { rollStanceSchema, stanceSourceSchema } from './resolution.js';

export const combatRollSchema = z.object({
  /** The face that counted. Under a stance this is the kept die, not the first. */
  d20: z.number().int().min(1).max(20),
  modifier: z.number().int(),
  total: z.number().int(),
  // A natural 20 always hits and doubles the damage dice; a natural 1 always
  // misses. Both flags are optional so existing consumers stay compatible.
  critical: z.boolean().optional(),
  criticalMiss: z.boolean().optional(),
  // How the attack was rolled, and why. Absence is not ambiguous: it means a
  // single die at normal stance with nothing contributing, which `d20` already
  // describes completely. The server emits `stance` and `dice` on every attack
  // it resolves, and `stanceSources` only when something actually changed the
  // dice - a condition, or a stance the GM asked for.
  stance: rollStanceSchema.optional(),
  dice: z.array(z.number().int().min(1).max(20)).min(1).max(2).optional(),
  stanceSources: z.array(stanceSourceSchema).max(8).optional(),
});

// Present on resolved hits. Damage dice are rolled server-side; the breakdown
// is reported so the event feed can show how a result was reached.
export const combatDamageRollSchema = z.object({
  dice: z.array(z.number().int().min(1)),
  diceTotal: z.number().int().min(0),
  modifier: z.number().int(),
  total: z.number().int().min(0),
  critical: z.boolean(),
  notation: z.string(),
});

export const combatTargetHpSchema = z.object({
  previous: z.number().int().min(0),
  current: z.number().int().min(0),
});

export const combatEventSchema = z.object({
  type: z.literal('combat_event'),
  reason: z.literal('attack_resolved'),
  sessionId: sessionIdSchema,
  encounterId: encounterIdSchema,
  attackerKind: z.enum(['character', 'combatant']).optional(),
  targetKind: z.enum(['character', 'combatant']).optional(),
  attackerParticipantId: participantIdSchema,
  attackerCharacterId: characterIdSchema.optional(),
  attackerCombatantId: sceneEntityIdSchema.optional(),
  targetParticipantId: participantIdSchema,
  targetCharacterId: characterIdSchema.optional(),
  targetCombatantId: sceneEntityIdSchema.optional(),
  roll: combatRollSchema,
  targetArmorClass: z.number().int(),
  hit: z.boolean(),
  damage: z.number().int().min(0),
  damageRoll: combatDamageRollSchema.optional(),
  // Absent when the target is a combatant the viewer may not identify: the
  // health pool of a creature a player cannot see is itself concealed
  // information. Present in every DM view and whenever the target is visible.
  targetHp: combatTargetHpSchema.optional(),
  // Set on role-projected events where the corresponding combatant ID was
  // withheld, so the event feed can say "something you cannot see" instead of
  // rendering a gap. Never set on the authoritative event.
  attackerConcealed: z.boolean().optional(),
  targetConcealed: z.boolean().optional(),
});

export type CombatRoll = z.infer<typeof combatRollSchema>;
export type CombatDamageRoll = z.infer<typeof combatDamageRollSchema>;
export type CombatTargetHp = z.infer<typeof combatTargetHpSchema>;
export type CombatEvent = z.infer<typeof combatEventSchema>;
