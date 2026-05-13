export type AbilityName = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'

export type SkillName =
  | 'Acrobatics' | 'Animal Handling' | 'Arcana' | 'Athletics'
  | 'Deception' | 'History' | 'Insight' | 'Intimidation'
  | 'Investigation' | 'Medicine' | 'Nature' | 'Perception'
  | 'Performance' | 'Persuasion' | 'Religion' | 'Sleight of Hand'
  | 'Stealth' | 'Survival'

export type Alignment =
  | 'Lawful Good' | 'Neutral Good' | 'Chaotic Good'
  | 'Lawful Neutral' | 'True Neutral' | 'Chaotic Neutral'
  | 'Lawful Evil' | 'Neutral Evil' | 'Chaotic Evil'

export type StepId = 'race' | 'class' | 'background' | 'abilityScores' | 'details' | 'sheet'

export type Size = 'Small' | 'Medium'

export interface Trait {
  name: string
  description: string
}

export interface ClassFeature {
  name: string
  description: string
}

export interface BackgroundFeature {
  name: string
  description: string
}

export interface SpellcastingInfo {
  ability: AbilityName
  cantripsKnown: number
  spellsKnown?: number
  spellSlots: { level: number; slots: number }[]
  cantrips?: string[]
  note?: string
}

export interface Subrace {
  id: string
  name: string
  description: string
  asi: Partial<Record<AbilityName, number>>
  traits: Trait[]
}

export interface Race {
  id: string
  name: string
  tagline: string
  imageUrl: string
  speed: number
  size: Size
  asi: Partial<Record<AbilityName, number>>
  languages: string[]
  traits: Trait[]
  subraces?: Subrace[]
}

export interface DnDClass {
  id: string
  name: string
  tagline: string
  imageUrl: string
  hitDie: number
  primaryAbility: string
  savingThrows: AbilityName[]
  armorProficiencies: string[]
  weaponProficiencies: string[]
  toolProficiencies: string[]
  skillChoices: SkillName[]
  numSkillChoices: number
  features: ClassFeature[]
  equipment: string[]
  spellcasting?: SpellcastingInfo
}

export interface Background {
  id: string
  name: string
  tagline: string
  imageUrl: string
  skillProficiencies: SkillName[]
  toolProficiencies: string[]
  languages: number
  feature: BackgroundFeature
  equipment: string[]
  personalityTraits: string[]
  ideals: string[]
  bonds: string[]
  flaws: string[]
}

export interface CharacterState {
  race: Race | null
  subrace: Subrace | null
  dndClass: DnDClass | null
  classSkillChoices: SkillName[]
  background: Background | null
  backgroundSkillOverride: SkillName | null
  abilityScores: Record<AbilityName, number>
  name: string
  alignment: Alignment | null
  age: string
  height: string
  weight: string
  pronouns: string
  backstory: string
  currentStep: StepId
}
