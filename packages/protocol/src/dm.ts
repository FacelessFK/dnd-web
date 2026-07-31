import { z } from 'zod';

import {
  characterIdSchema,
  commandIdSchema,
  participantIdSchema,
  sceneEntityIdSchema,
  sessionIdSchema,
} from './common.js';
import {
  activeConditionsSchema,
  characterResourceSchema,
  hitPointsSchema,
  turnUsageSchema,
} from './character.js';
import { encounterSchema } from './encounter.js';
import { commandErrorSchema } from './errors.js';
import {
  sceneCombatantKindSchema,
  sceneEntityFootprintSchema,
  scenePositionSchema,
  sceneSchema,
} from './scene.js';

const dmActorSchema = z.object({
  participantId: participantIdSchema,
});

export const dmSetCharacterCurrentHpCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_character_current_hp'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    characterId: characterIdSchema,
    currentHp: z.number().int(),
  }),
});

export const dmSetCharacterActiveConditionsCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_character_active_conditions'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    characterId: characterIdSchema,
    activeConditions: z.array(z.string()).max(50),
  }),
});

export const dmRepositionCharacterInActiveSceneCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_reposition_character_in_active_scene'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    characterId: characterIdSchema,
    position: scenePositionSchema,
  }),
});

export const dmCombatantInputSchema = z.object({
  kind: sceneCombatantKindSchema,
  name: z.string().trim().min(1).max(80),
  position: scenePositionSchema,
  footprint: sceneEntityFootprintSchema,
  hp: hitPointsSchema,
  armorClass: z.number().int().min(0).max(99),
  speed: z.number().int().min(0).max(200),
  abilities: z.object({
    str: z.number().int().min(1).max(30),
    dex: z.number().int().min(1).max(30),
    con: z.number().int().min(1).max(30),
    int: z.number().int().min(1).max(30),
    wis: z.number().int().min(1).max(30),
    cha: z.number().int().min(1).max(30),
  }),
  hidden: z.boolean().optional(),
});

export const dmCreateCombatantInActiveSceneCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_create_combatant_in_active_scene'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    combatant: dmCombatantInputSchema,
  }),
});

export const dmRepositionCombatantInActiveSceneCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_reposition_combatant_in_active_scene'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    combatantId: sceneEntityIdSchema,
    position: scenePositionSchema,
  }),
});

/**
 * Conceal or reveal a combatant that already exists in the active scene.
 *
 * `hidden` was previously settable only at creation: `update_scene_entity`
 * refuses combatants, so a GM who placed a creature in the open had no way to
 * hide it again. Concealment is derived from this flag on every read, so the
 * next projection reflects the change with no invalidation step (PRD V3).
 */
export const dmSetCombatantHiddenCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_combatant_hidden'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    combatantId: sceneEntityIdSchema,
    hidden: z.boolean(),
  }),
});

export const dmSetCombatantCurrentHpCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_combatant_current_hp'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    combatantId: sceneEntityIdSchema,
    currentHp: z.number().int(),
  }),
});

export const dmCombatantAttackCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_combatant_attack'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    combatantId: sceneEntityIdSchema,
    targetParticipantId: participantIdSchema,
  }),
});

export const dmSetCurrentTurnUsageCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_current_turn_usage'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    turnUsage: turnUsageSchema,
  }),
});

export const dmSetCurrentTurnParticipantCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_set_current_turn_participant'),
  actor: dmActorSchema,
  payload: z
    .object({
      sessionId: sessionIdSchema,
      participantId: participantIdSchema.optional(),
      combatantId: sceneEntityIdSchema.optional(),
    })
    .superRefine((value, ctx) => {
      if (!value.participantId && !value.combatantId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Either participantId or combatantId is required for current turn override.',
          path: ['participantId'],
        });
      }
    }),
});

export const dmEndActiveEncounterCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('dm_end_active_encounter'),
  actor: dmActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
  }),
});

export const dmCommandSchema = z.discriminatedUnion('type', [
  dmSetCharacterCurrentHpCommandSchema,
  dmSetCharacterActiveConditionsCommandSchema,
  dmRepositionCharacterInActiveSceneCommandSchema,
  dmCreateCombatantInActiveSceneCommandSchema,
  dmRepositionCombatantInActiveSceneCommandSchema,
  dmSetCombatantHiddenCommandSchema,
  dmSetCombatantCurrentHpCommandSchema,
  dmCombatantAttackCommandSchema,
  dmSetCurrentTurnUsageCommandSchema,
  dmSetCurrentTurnParticipantCommandSchema,
  dmEndActiveEncounterCommandSchema,
]);

const dmEncounterCommandSuccessDataSchema = z.object({
  encounter: encounterSchema,
});

const dmSceneCommandSuccessDataSchema = z.object({
  scene: sceneSchema,
});

export const dmCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.union([
    characterResourceSchema,
    dmEncounterCommandSuccessDataSchema,
    dmSceneCommandSuccessDataSchema,
  ]),
});

export const dmCommandErrorSchema = commandErrorSchema;

export const dmCommandResponseSchema = z.union([
  dmCommandSuccessSchema,
  dmCommandErrorSchema,
]);

export const characterStateUpdateReasonSchema = z.enum([
  'dm_hp_changed',
  'dm_conditions_changed',
]);

export const characterStateUpdateSchema = z.object({
  type: z.literal('character_state'),
  reason: characterStateUpdateReasonSchema,
  sessionId: sessionIdSchema,
  participantId: participantIdSchema,
  characterId: characterIdSchema,
  hp: hitPointsSchema,
  activeConditions: activeConditionsSchema.optional(),
});

export type DmSetCharacterCurrentHpCommand = z.infer<
  typeof dmSetCharacterCurrentHpCommandSchema
>;
export type DmSetCharacterActiveConditionsCommand = z.infer<
  typeof dmSetCharacterActiveConditionsCommandSchema
>;
export type DmRepositionCharacterInActiveSceneCommand = z.infer<
  typeof dmRepositionCharacterInActiveSceneCommandSchema
>;
export type DmCombatantInput = z.infer<typeof dmCombatantInputSchema>;
export type DmCreateCombatantInActiveSceneCommand = z.infer<
  typeof dmCreateCombatantInActiveSceneCommandSchema
>;
export type DmRepositionCombatantInActiveSceneCommand = z.infer<
  typeof dmRepositionCombatantInActiveSceneCommandSchema
>;
export type DmSetCombatantCurrentHpCommand = z.infer<
  typeof dmSetCombatantCurrentHpCommandSchema
>;
export type DmCombatantAttackCommand = z.infer<
  typeof dmCombatantAttackCommandSchema
>;
export type DmSetCurrentTurnUsageCommand = z.infer<
  typeof dmSetCurrentTurnUsageCommandSchema
>;
export type DmSetCurrentTurnParticipantCommand = z.infer<
  typeof dmSetCurrentTurnParticipantCommandSchema
>;
export type DmEndActiveEncounterCommand = z.infer<
  typeof dmEndActiveEncounterCommandSchema
>;
export type DmCommand = z.infer<typeof dmCommandSchema>;
export type DmCommandSuccess = z.infer<typeof dmCommandSuccessSchema>;
export type DmCommandError = z.infer<typeof dmCommandErrorSchema>;
export type DmCommandResponse = z.infer<typeof dmCommandResponseSchema>;
export type CharacterStateUpdateReason = z.infer<
  typeof characterStateUpdateReasonSchema
>;
export type CharacterStateUpdate = z.infer<typeof characterStateUpdateSchema>;
