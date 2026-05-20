export type AbilityName = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export type SkillName =
  | 'Acrobatics'
  | 'Animal Handling'
  | 'Arcana'
  | 'Athletics'
  | 'Deception'
  | 'History'
  | 'Insight'
  | 'Intimidation'
  | 'Investigation'
  | 'Medicine'
  | 'Nature'
  | 'Perception'
  | 'Performance'
  | 'Persuasion'
  | 'Religion'
  | 'Sleight of Hand'
  | 'Stealth'
  | 'Survival';

export type Alignment =
  | 'Lawful Good'
  | 'Neutral Good'
  | 'Chaotic Good'
  | 'Lawful Neutral'
  | 'True Neutral'
  | 'Chaotic Neutral'
  | 'Lawful Evil'
  | 'Neutral Evil'
  | 'Chaotic Evil';

export type StepId =
  | 'race'
  | 'class'
  | 'background'
  | 'abilityScores'
  | 'details'
  | 'sheet';

export type Size = 'Small' | 'Medium';

export interface Trait {
  name: string;
  description: string;
}

export interface ClassFeature {
  name: string;
  description: string;
}

export interface BackgroundFeature {
  name: string;
  description: string;
}

export interface SpellcastingInfo {
  ability: AbilityName;
  cantripsKnown: number;
  spellsKnown?: number;
  spellSlots: { level: number; slots: number }[];
  cantrips?: string[];
  cantripOptions?: string[];
  preparedSpellOptions?: string[];
  preparedSpells?: string[];
  note?: string;
}

export interface EquipmentChoiceOption {
  id: string;
  label: string;
  items: string[];
}

export interface EquipmentChoiceGroup {
  id: string;
  label: string;
  options: EquipmentChoiceOption[];
  required: boolean;
}

export interface Subrace {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  asi: Partial<Record<AbilityName, number>>;
  languageChoiceCount?: number;
  languages?: string[];
  traits: Trait[];
}

export interface Race {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  symbolUrl: string;
  speed: number;
  size: Size;
  asi: Partial<Record<AbilityName, number>>;
  abilityChoiceCount?: number;
  abilityChoiceOptions?: AbilityName[];
  languageChoiceCount?: number;
  languages: string[];
  skillChoiceCount?: number;
  skillChoiceOptions?: SkillName[];
  traits: Trait[];
  subraces?: Subrace[];
}

export interface DnDClass {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  symbolUrl: string;
  hitDie: number;
  primaryAbility: string;
  savingThrows: AbilityName[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: SkillName[];
  numSkillChoices: number;
  features: ClassFeature[];
  equipment: string[];
  equipmentChoices?: EquipmentChoiceGroup[];
  spellcasting?: SpellcastingInfo;
}

export interface Background {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  symbolUrl: string;
  skillProficiencies: SkillName[];
  toolProficiencies: string[];
  languages: number;
  feature: BackgroundFeature;
  equipment: string[];
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
}

export interface CharacterState {
  race: Race | null;
  subrace: Subrace | null;
  raceAbilityChoices: AbilityName[];
  raceLanguageChoices: string[];
  raceSkillChoices: SkillName[];
  dndClass: DnDClass | null;
  classSkillChoices: SkillName[];
  classEquipmentChoices: Record<string, string[]>;
  classSpellChoices: {
    cantrips: string[];
    preparedSpells: string[];
  };
  background: Background | null;
  backgroundSkillOverride: SkillName | null;
  backgroundLanguageChoices: string[];
  abilityScores: Record<AbilityName, number>;
  name: string;
  alignment: Alignment | null;
  age: string;
  height: string;
  weight: string;
  pronouns: string;
  portraitDataUrl: string;
  backstory: string;
  currentStep: StepId;
}
