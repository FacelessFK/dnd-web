import { z } from 'zod';

import { baseRulesets, rulesStrictnessLevels } from '@dnd/shared';

import { rulesProfileIdSchema } from './common.js';

export const baseRulesetSchema = z.enum(baseRulesets);
export const rulesStrictnessSchema = z.enum(rulesStrictnessLevels);

export const rulesConfigValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const rulesProfileSchema = z.object({
  id: rulesProfileIdSchema,
  baseRuleset: baseRulesetSchema,
  strictness: rulesStrictnessSchema,
  optionalRules: z.array(z.string().trim().min(1)),
  houseRules: z.record(rulesConfigValueSchema),
  allowedSources: z.array(z.string().trim().min(1)),
});

export type RulesProfile = z.infer<typeof rulesProfileSchema>;
