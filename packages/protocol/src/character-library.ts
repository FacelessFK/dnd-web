import { z } from 'zod';

import {
  commandIdSchema,
  levelSchema,
  participantIdSchema,
  rulesProfileIdSchema,
} from './common.js';
import {
  abilityScoresSchema,
  hitPointsSchema,
  speciesOrRaceSchema,
} from './character.js';
import { commandErrorSchema } from './errors.js';
import { rulesConfigValueSchema } from './rules-profile.js';

export const characterLibraryEntryIdSchema = z
  .string()
  .regex(
    /^charlib_[a-f0-9-]{36}$/,
    'Character library entry ID must be a server-generated ID like "charlib_<uuid>".',
  );

export const characterLibraryStatusSchema = z.enum(['draft', 'finalized']);

export const characterBuilderStepSchema = z.enum([
  'identity',
  'species',
  'class',
  'background',
  'ability-scores',
  'proficiencies',
  'equipment',
  'spells',
  'review',
]);

export const characterAbilityScoreMethodSchema = z.enum([
  'manual',
  'point-buy',
  'standard-array',
]);

export const uploadedPortraitDataUrlMaxLength = 1_500_000;
export const uploadedPortraitSizeMaxBytes = 1_000_000;

export const characterLibrarySelectionsSchema = z.object({
  cantrips: z.array(z.string().trim().min(1).max(128)).max(100),
  equipment: z.array(z.string().trim().min(1).max(128)).max(100),
  languages: z.array(z.string().trim().min(1).max(128)).max(100),
  originFeatAbility: z
    .enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])
    .or(z.literal(''))
    .optional()
    .default(''),
  originFeatCantrips: z
    .array(z.string().trim().min(1).max(128))
    .max(100)
    .optional()
    .default([]),
  originFeatSpell: z.string().trim().max(128).optional().default(''),
  skills: z.array(z.string().trim().min(1).max(128)).max(100),
  spells: z.array(z.string().trim().min(1).max(128)).max(100),
  tools: z.array(z.string().trim().min(1).max(128)).max(100),
});

export const uploadedPortraitReferenceSchema = z
  .object({
    kind: z.literal('uploaded'),
    dataUrl: z
      .string()
      .trim()
      .min(1)
      .max(uploadedPortraitDataUrlMaxLength)
      .optional(),
    fileName: z.string().trim().min(1).max(180).nullable().optional(),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    sizeBytes: z.number().int().min(1).max(uploadedPortraitSizeMaxBytes),
    storageKey: z.string().trim().min(1).max(320).optional(),
    uploadedAt: z.string().datetime(),
    url: z.string().trim().min(1).max(500).optional(),
  })
  .refine((portrait) => portrait.dataUrl || portrait.url, {
    message: 'Uploaded portraits must include either a data URL or stored URL.',
  });

export const assetPortraitReferenceSchema = z.object({
  assetKey: z.string().trim().min(1).max(160),
  kind: z.literal('asset'),
});

export const characterLibraryPortraitReferenceSchema = z.union([
  uploadedPortraitReferenceSchema,
  assetPortraitReferenceSchema,
]);

export const characterLibraryEntryInputSchema = z.object({
  abilityScoreMethod: characterAbilityScoreMethodSchema,
  abilities: abilityScoresSchema,
  armorClass: z.number().int().min(0).max(99),
  background: z.string().trim().min(1).max(64),
  builderSelections: characterLibrarySelectionsSchema,
  builderStep: characterBuilderStepSchema,
  className: z.string().trim().min(1).max(64),
  concept: z.string().trim().max(500),
  hp: hitPointsSchema,
  level: levelSchema,
  meta: z.record(rulesConfigValueSchema).optional(),
  name: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(4000).nullable().optional(),
  portrait: characterLibraryPortraitReferenceSchema.nullable().optional(),
  pronouns: z.string().trim().max(80).nullable().optional(),
  rulesProfileId: rulesProfileIdSchema,
  speciesOrRace: speciesOrRaceSchema,
  speed: z.number().int().min(0).max(200),
});

export const characterLibraryEntrySchema =
  characterLibraryEntryInputSchema.extend({
    createdAt: z.string().datetime(),
    id: characterLibraryEntryIdSchema,
    ownerParticipantId: participantIdSchema.optional(),
    ownerUserId: z.string().trim().min(1).max(80).optional(),
    status: characterLibraryStatusSchema,
    updatedAt: z.string().datetime(),
  });

const ownerActorSchema = z.object({
  participantId: participantIdSchema,
});

export const createCharacterLibraryEntryCommandSchema = z.object({
  actor: ownerActorSchema,
  commandId: commandIdSchema,
  payload: z.object({
    entry: characterLibraryEntryInputSchema,
    ownerParticipantId: participantIdSchema,
  }),
  type: z.literal('create_character_library_entry'),
});

export const updateCharacterLibraryEntryCommandSchema = z.object({
  actor: ownerActorSchema,
  commandId: commandIdSchema,
  payload: z.object({
    entry: characterLibraryEntryInputSchema,
    entryId: characterLibraryEntryIdSchema,
    ownerParticipantId: participantIdSchema,
  }),
  type: z.literal('update_character_library_entry'),
});

export const finalizeCharacterLibraryEntryCommandSchema = z.object({
  actor: ownerActorSchema,
  commandId: commandIdSchema,
  payload: z.object({
    entryId: characterLibraryEntryIdSchema,
    ownerParticipantId: participantIdSchema,
  }),
  type: z.literal('finalize_character_library_entry'),
});

export const getCharacterLibraryEntryCommandSchema = z.object({
  actor: ownerActorSchema,
  commandId: commandIdSchema,
  payload: z.object({
    entryId: characterLibraryEntryIdSchema,
    ownerParticipantId: participantIdSchema,
  }),
  type: z.literal('get_character_library_entry'),
});

export const listCharacterLibraryEntriesCommandSchema = z.object({
  actor: ownerActorSchema,
  commandId: commandIdSchema,
  payload: z.object({
    ownerParticipantId: participantIdSchema,
  }),
  type: z.literal('list_character_library_entries'),
});

export const characterLibraryCommandSchema = z.discriminatedUnion('type', [
  createCharacterLibraryEntryCommandSchema,
  updateCharacterLibraryEntryCommandSchema,
  finalizeCharacterLibraryEntryCommandSchema,
  getCharacterLibraryEntryCommandSchema,
  listCharacterLibraryEntriesCommandSchema,
]);

export const characterLibraryCommandSuccessSchema = z.object({
  data: z.union([
    z.object({
      entry: characterLibraryEntrySchema,
    }),
    z.object({
      entries: z.array(characterLibraryEntrySchema),
    }),
  ]),
  ok: z.literal(true),
});

export const characterLibraryCommandErrorSchema = commandErrorSchema;

export const characterLibraryCommandResponseSchema = z.union([
  characterLibraryCommandSuccessSchema,
  characterLibraryCommandErrorSchema,
]);

export type CharacterLibraryEntryId = z.infer<
  typeof characterLibraryEntryIdSchema
>;
export type CharacterLibraryStatus = z.infer<
  typeof characterLibraryStatusSchema
>;
export type CharacterBuilderStep = z.infer<typeof characterBuilderStepSchema>;
export type CharacterAbilityScoreMethod = z.infer<
  typeof characterAbilityScoreMethodSchema
>;
export type CharacterLibrarySelections = z.infer<
  typeof characterLibrarySelectionsSchema
>;
export type CharacterLibraryPortraitReference = z.infer<
  typeof characterLibraryPortraitReferenceSchema
>;
export type CharacterLibraryEntryInput = z.infer<
  typeof characterLibraryEntryInputSchema
>;
export type CharacterLibraryEntry = z.infer<typeof characterLibraryEntrySchema>;
export type CreateCharacterLibraryEntryCommand = z.infer<
  typeof createCharacterLibraryEntryCommandSchema
>;
export type UpdateCharacterLibraryEntryCommand = z.infer<
  typeof updateCharacterLibraryEntryCommandSchema
>;
export type FinalizeCharacterLibraryEntryCommand = z.infer<
  typeof finalizeCharacterLibraryEntryCommandSchema
>;
export type GetCharacterLibraryEntryCommand = z.infer<
  typeof getCharacterLibraryEntryCommandSchema
>;
export type ListCharacterLibraryEntriesCommand = z.infer<
  typeof listCharacterLibraryEntriesCommandSchema
>;
export type CharacterLibraryCommand = z.infer<
  typeof characterLibraryCommandSchema
>;
export type CharacterLibraryCommandSuccess = z.infer<
  typeof characterLibraryCommandSuccessSchema
>;
export type CharacterLibraryCommandError = z.infer<
  typeof characterLibraryCommandErrorSchema
>;
export type CharacterLibraryCommandResponse = z.infer<
  typeof characterLibraryCommandResponseSchema
>;
