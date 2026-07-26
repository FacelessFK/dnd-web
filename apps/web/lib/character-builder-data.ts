import type { CharacterLibraryPortraitReference } from '@dnd/protocol';

import {
  rareLanguages,
  rulesBackgrounds,
  rulesClasses,
  rulesEquipment,
  rulesSkills,
  rulesSpells,
  standardLanguages,
  type AbilityScoreMethod,
} from './character-builder-rules-data';

export const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export type AbilityKey = (typeof abilityKeys)[number];

export type BuilderStepId =
  | 'identity'
  | 'species'
  | 'class'
  | 'background'
  | 'ability-scores'
  | 'proficiencies'
  | 'equipment'
  | 'spells'
  | 'review';

export type CharacterBuilderStatus = 'draft' | 'ready' | 'in_session';

export type CharacterBuilderDraft = {
  abilities: Record<AbilityKey, number>;
  abilityScoreMethod: AbilityScoreMethod;
  armorClass: number;
  background: string;
  builderSelections: {
    cantrips: string[];
    equipment: string[];
    languages: string[];
    originFeatAbility: AbilityKey | '';
    originFeatCantrips: string[];
    originFeatSpell: string;
    skills: string[];
    spells: string[];
    tools: string[];
  };
  builderStep: BuilderStepId;
  className: string;
  concept: string;
  hp: {
    current: number;
    max: number;
    temp: number;
  };
  id?: string;
  level: number;
  name: string;
  notes: string;
  ownerParticipantId: string;
  portrait: CharacterLibraryPortraitReference | null;
  pronouns: string;
  rulesProfileId: string;
  speciesOrRace: string;
  speed: number;
  status: CharacterBuilderStatus;
};

export type CharacterBuilderLibraryEntry = {
  armorClass: number;
  className: string;
  id: string;
  level: number;
  name: string;
  ownerParticipantId?: string;
  portrait: CharacterLibraryPortraitReference | null;
  speciesOrRace: string;
  status: CharacterBuilderStatus;
  summary: string;
};

export const skillOptions = [...rulesSkills];

export const languageOptions = [...standardLanguages, ...rareLanguages];

export const toolOptions = Array.from(
  new Set([
    ...rulesBackgrounds.flatMap((background) => [
      ...background.toolProficiencies,
      ...(background.toolChoice?.from ?? []),
    ]),
    ...rulesClasses.flatMap((characterClass) => [
      ...characterClass.toolProficiencies,
      ...(characterClass.toolChoices?.from ?? []),
    ]),
  ]),
);

export const cantripOptions = rulesSpells
  .filter((spell) => spell.level === 0)
  .map((spell) => spell.name);

export const equipmentOptions = rulesEquipment.map(
  (equipment) => equipment.name,
);

export const spellOptions = rulesSpells
  .filter((spell) => spell.level > 0)
  .map((spell) => spell.name);
