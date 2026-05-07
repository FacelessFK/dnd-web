import { z } from 'zod';

import {
  characterIdSchema,
  encounterIdSchema,
  participantIdSchema,
  sceneEntityIdSchema,
  sessionIdSchema,
} from './common.js';

export const combatRollSchema = z.object({
  d20: z.number().int().min(1).max(20),
  modifier: z.number().int(),
  total: z.number().int(),
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
  targetHp: combatTargetHpSchema,
});

export type CombatRoll = z.infer<typeof combatRollSchema>;
export type CombatTargetHp = z.infer<typeof combatTargetHpSchema>;
export type CombatEvent = z.infer<typeof combatEventSchema>;
