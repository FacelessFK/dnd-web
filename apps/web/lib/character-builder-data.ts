import type { CharacterLibraryPortraitReference } from '@dnd/protocol';

import type { CharacterBuilderAssetKey } from './character-builder-assets';
import {
  rareLanguages,
  rulesBackgrounds,
  rulesClasses,
  rulesEquipment,
  rulesSkills,
  rulesSpells,
  rulesSpecies,
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
  portraitAssetKey?: CharacterBuilderAssetKey;
  speciesOrRace: string;
  status: CharacterBuilderStatus;
  summary: string;
};

export type BuilderChoiceCard = {
  assetKey?: CharacterBuilderAssetKey;
  description: string;
  id: string;
  metadata: string[];
  title: string;
};

export type ClassChoiceCard = BuilderChoiceCard & {
  armor: string;
  difficulty: string;
  features: string[];
  primaryAbility: AbilityKey;
  role: string;
  weapons: string;
};

export type BackgroundChoiceCard = BuilderChoiceCard & {
  feature: string;
  languages: string[];
  proficiencies: string[];
  tools: string[];
};

export const builderSteps: Array<{
  id: BuilderStepId;
  label: string;
}> = [
  { id: 'identity', label: 'Identity' },
  { id: 'species', label: 'Species' },
  { id: 'class', label: 'Class' },
  { id: 'background', label: 'Background' },
  { id: 'ability-scores', label: 'Ability Scores' },
  { id: 'proficiencies', label: 'Choices & Proficiencies' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'spells', label: 'Spells' },
  { id: 'review', label: 'Review' },
];

export const mockCharacterLibraryEntries: CharacterBuilderLibraryEntry[] = [
  {
    armorClass: 12,
    className: 'Wizard',
    id: 'mock-elara-nightbloom',
    level: 1,
    name: 'Elara Nightbloom',
    ownerParticipantId: 'dev-player-001',
    portrait: null,
    portraitAssetKey: 'portrait.elara',
    speciesOrRace: 'Elf',
    status: 'draft',
    summary: 'A moonlit scholar drawn to forgotten arcane ruins.',
  },
  {
    armorClass: 16,
    className: 'Fighter',
    id: 'mock-thorn-blackoak',
    level: 3,
    name: 'Thorn Blackoak',
    ownerParticipantId: 'dev-player-001',
    portrait: null,
    portraitAssetKey: 'portrait.thorn',
    speciesOrRace: 'Human',
    status: 'ready',
    summary: 'A weathered sellsword with an oath heavier than steel.',
  },
  {
    armorClass: 15,
    className: 'Cleric',
    id: 'mock-mirelle-dawnsong',
    level: 2,
    name: 'Mirelle Dawnsong',
    ownerParticipantId: 'dev-player-001',
    portrait: null,
    portraitAssetKey: 'portrait.mirelle',
    speciesOrRace: 'Dwarf',
    status: 'in_session',
    summary: 'A dawn-priest who carries warmth into haunted halls.',
  },
  {
    armorClass: 14,
    className: 'Rogue',
    id: 'mock-kael-emberstep',
    level: 4,
    name: 'Kael Emberstep',
    ownerParticipantId: 'dev-player-001',
    portrait: null,
    portraitAssetKey: 'portrait.kael',
    speciesOrRace: 'Tiefling',
    status: 'ready',
    summary: 'A smiling blade with ash in his boots and secrets to sell.',
  },
];

export const speciesChoices: BuilderChoiceCard[] = rulesSpecies.map(
  (species) => ({
    assetKey: species.assetKey,
    description: species.shortSummary,
    id: species.id,
    metadata: [
      species.size,
      `${species.speed} ft.`,
      ...species.traits.map((trait) => trait.label),
    ],
    title: species.displayName,
  }),
);

export const classChoices: ClassChoiceCard[] = rulesClasses.map(
  (characterClass) => ({
    armor: characterClass.armorProficiencies.join(', ') || 'None',
    assetKey: characterClass.assetKey,
    description: characterClass.shortSummary,
    difficulty: characterClass.difficulty,
    features: characterClass.level1Features,
    id: characterClass.id,
    metadata: [
      `d${characterClass.hitDie} hit die`,
      characterClass.spellcasting ? 'Spellcasting' : 'Non-caster',
      ...characterClass.primaryAbilities.map((ability) =>
        ability.toUpperCase(),
      ),
    ],
    primaryAbility: characterClass.primaryAbilities[0] ?? 'str',
    role: characterClass.role,
    title: characterClass.displayName,
    weapons: characterClass.weaponProficiencies.join(', ') || 'None',
  }),
);

export const backgroundChoices: BackgroundChoiceCard[] = rulesBackgrounds.map(
  (background) => ({
    assetKey: background.assetKey,
    description: background.shortSummary,
    feature: background.originFeat,
    id: background.id,
    languages: [],
    metadata: [
      ...background.skills,
      background.originFeat,
      background.abilityScoreOptions
        .map((ability) => ability.toUpperCase())
        .join('/'),
    ],
    proficiencies: background.skills,
    title: background.displayName,
    tools: [
      ...background.toolProficiencies,
      ...(background.toolChoice ? [background.toolChoice.label] : []),
    ],
  }),
);

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
