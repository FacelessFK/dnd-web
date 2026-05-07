import { z } from 'zod';

import { characterStatuses, visibilityStates } from '@dnd/shared';

import {
  characterIdSchema,
  characterNameSchema,
  commandIdSchema,
  levelSchema,
  participantIdSchema,
  rulesProfileIdSchema,
  sceneIdSchema,
  sessionIdSchema,
} from './common.js';
import { commandErrorSchema } from './errors.js';
import { rulesConfigValueSchema, rulesProfileSchema } from './rules-profile.js';
import { sceneEntityFootprintSchema } from './scene.js';
import { sessionSnapshotSchema } from './session.js';

export const visibilityStateSchema = z.enum(visibilityStates);
export const characterStatusSchema = z.enum(characterStatuses);
export const abilityScoreSchema = z.number().int().min(1).max(30);

export const abilityScoresSchema = z.object({
  str: abilityScoreSchema,
  dex: abilityScoreSchema,
  con: abilityScoreSchema,
  int: abilityScoreSchema,
  wis: abilityScoreSchema,
  cha: abilityScoreSchema,
});

export const abilityModifiersSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
});

export const hitPointsSchema = z
  .object({
    max: z.number().int().min(1).max(999),
    current: z.number().int().min(0).max(999),
    temp: z.number().int().min(0).max(999),
  })
  .superRefine((value, ctx) => {
    if (value.current > value.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Current HP cannot exceed max HP.',
        path: ['current'],
      });
    }
  });

// Temporary cross-ruleset placeholder until ancestry terminology is split by ruleset.
export const speciesOrRaceSchema = z.string().trim().min(1).max(64);

export const characterInputSchema = z.object({
  name: characterNameSchema,
  level: levelSchema,
  className: z.string().trim().min(1).max(64),
  speciesOrRace: speciesOrRaceSchema,
  background: z.string().trim().min(1).max(64),
  abilities: abilityScoresSchema,
  hp: hitPointsSchema,
  armorClass: z.number().int().min(0).max(99),
  speed: z.number().int().min(0).max(200),
  notes: z.string().trim().max(4000).nullable().optional(),
  meta: z.record(rulesConfigValueSchema).optional(),
});

export const characterUpdateInputSchema = z.object({
  name: characterNameSchema,
  className: z.string().trim().min(1).max(64),
  speciesOrRace: speciesOrRaceSchema,
  background: z.string().trim().min(1).max(64),
  abilities: abilityScoresSchema,
  hp: hitPointsSchema,
  armorClass: z.number().int().min(0).max(99),
  speed: z.number().int().min(0).max(200),
  notes: z.string().trim().max(4000).nullable().optional(),
  meta: z.record(rulesConfigValueSchema).optional(),
});

export const characterSchema = z.object({
  id: characterIdSchema,
  ownerParticipantId: participantIdSchema,
  status: characterStatusSchema,
  name: characterNameSchema,
  rulesProfileId: rulesProfileIdSchema,
  level: levelSchema,
  className: z.string().trim().min(1).max(64),
  speciesOrRace: speciesOrRaceSchema,
  background: z.string().trim().min(1).max(64),
  abilities: abilityScoresSchema,
  hp: hitPointsSchema,
  armorClass: z.number().int().min(0).max(99),
  speed: z.number().int().min(0).max(200),
  notes: z.string().trim().max(4000).nullable(),
  meta: z.record(rulesConfigValueSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const encounterPositionSchema = z.object({
  sceneId: sceneIdSchema.nullable(),
  x: z.number().int(),
  y: z.number().int(),
});

export const concentrationStateSchema = z.object({
  effectName: z.string().trim().min(1).max(128),
});

export const activeConditionsSchema = z
  .array(z.string().trim().min(1).max(128))
  .max(50)
  .superRefine((conditions, ctx) => {
    const seenConditions = new Set<string>();

    conditions.forEach((condition, index) => {
      if (seenConditions.has(condition)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Active condition tags must be unique.',
          path: [index],
        });
        return;
      }

      seenConditions.add(condition);
    });
  });

export const turnUsageSchema = z.object({
  actionUsed: z.boolean(),
  bonusActionUsed: z.boolean(),
  reactionUsed: z.boolean(),
  movementUsed: z.number().int().min(0).max(999),
});

export const encounterOverlaySchema = z.object({
  characterId: characterIdSchema,
  footprint: sceneEntityFootprintSchema,
  position: encounterPositionSchema.nullable(),
  activeConditions: activeConditionsSchema,
  concentration: concentrationStateSchema.nullable(),
  currentVisibility: visibilityStateSchema,
});

export const derivedCharacterStatsSchema = z.object({
  abilityModifiers: abilityModifiersSchema,
  proficiencyBonus: z.number().int().min(2).max(6),
  initiativeModifier: z.number().int(),
  passivePerception: z.number().int().min(0),
  spellSaveDc: z.number().int().min(1).nullable(),
});

export const characterResourceSchema = z.object({
  character: characterSchema,
  derived: derivedCharacterStatsSchema,
  overlay: encounterOverlaySchema,
  rulesProfile: rulesProfileSchema,
});

const sessionActorSchema = z.object({
  participantId: participantIdSchema,
});

export const createCharacterCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('create_character'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    ownerParticipantId: participantIdSchema,
    character: characterInputSchema,
  }),
});

export const getCharacterCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('get_character'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    characterId: characterIdSchema,
  }),
});

export const updateCharacterCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('update_character'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    characterId: characterIdSchema,
    character: characterUpdateInputSchema,
  }),
});

export const finalizeCharacterCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('finalize_character'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    characterId: characterIdSchema,
  }),
});

export const assignCharacterToParticipantCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('assign_character_to_participant'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    characterId: characterIdSchema,
  }),
});

export const submitCharacterForAssignmentCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('submit_character_for_assignment'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    characterId: characterIdSchema,
  }),
});

export const characterCommandSchema = z.discriminatedUnion('type', [
  createCharacterCommandSchema,
  getCharacterCommandSchema,
  updateCharacterCommandSchema,
  finalizeCharacterCommandSchema,
  assignCharacterToParticipantCommandSchema,
  submitCharacterForAssignmentCommandSchema,
]);

export const characterCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: characterResourceSchema,
});

export const characterAssignmentSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    sessionId: sessionIdSchema,
    participantId: participantIdSchema,
    characterId: characterIdSchema,
    state: sessionSnapshotSchema,
  }),
});

export const characterCommandErrorSchema = commandErrorSchema;

export const characterCommandResponseSchema = z.union([
  characterCommandSuccessSchema,
  characterAssignmentSuccessSchema,
  characterCommandErrorSchema,
]);

export type Character = z.infer<typeof characterSchema>;
export type CharacterInput = z.infer<typeof characterInputSchema>;
export type CharacterUpdateInput = z.infer<typeof characterUpdateInputSchema>;
export type EncounterOverlay = z.infer<typeof encounterOverlaySchema>;
export type DerivedCharacterStats = z.infer<typeof derivedCharacterStatsSchema>;
export type CharacterResource = z.infer<typeof characterResourceSchema>;
export type CreateCharacterCommand = z.infer<
  typeof createCharacterCommandSchema
>;
export type GetCharacterCommand = z.infer<typeof getCharacterCommandSchema>;
export type UpdateCharacterCommand = z.infer<
  typeof updateCharacterCommandSchema
>;
export type FinalizeCharacterCommand = z.infer<
  typeof finalizeCharacterCommandSchema
>;
export type AssignCharacterToParticipantCommand = z.infer<
  typeof assignCharacterToParticipantCommandSchema
>;
export type SubmitCharacterForAssignmentCommand = z.infer<
  typeof submitCharacterForAssignmentCommandSchema
>;
export type CharacterCommand = z.infer<typeof characterCommandSchema>;
export type CharacterCommandSuccess = z.infer<
  typeof characterCommandSuccessSchema
>;
export type CharacterAssignmentSuccess = z.infer<
  typeof characterAssignmentSuccessSchema
>;
export type CharacterCommandError = z.infer<typeof characterCommandErrorSchema>;
export type CharacterCommandResponse = z.infer<
  typeof characterCommandResponseSchema
>;
