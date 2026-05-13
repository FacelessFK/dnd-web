import { create } from 'zustand'
import type { AbilityName, Alignment, CharacterState, DnDClass, Background, Race, SkillName, StepId, Subrace } from '../types'

const DEFAULT_ABILITY_SCORES: Record<AbilityName, number> = {
  STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8,
}

interface CharacterStore extends CharacterState {
  setRace: (race: Race | null) => void
  setSubrace: (subrace: Subrace | null) => void
  setClass: (dndClass: DnDClass | null) => void
  setClassSkillChoices: (skills: SkillName[]) => void
  setBackground: (background: Background | null) => void
  setBackgroundSkillOverride: (skill: SkillName | null) => void
  setAbilityScore: (ability: AbilityName, value: number) => void
  resetAbilityScores: () => void
  setName: (name: string) => void
  setAlignment: (alignment: Alignment | null) => void
  setAge: (age: string) => void
  setHeight: (height: string) => void
  setWeight: (weight: string) => void
  setPronouns: (pronouns: string) => void
  setBackstory: (backstory: string) => void
  setStep: (step: StepId) => void
}

export const useCharacterStore = create<CharacterStore>((set) => ({
  race: null,
  subrace: null,
  dndClass: null,
  classSkillChoices: [],
  background: null,
  backgroundSkillOverride: null,
  abilityScores: { ...DEFAULT_ABILITY_SCORES },
  name: '',
  alignment: null,
  age: '',
  height: '',
  weight: '',
  pronouns: '',
  backstory: '',
  currentStep: 'race',

  setRace: (race) => set({ race, subrace: null }),
  setSubrace: (subrace) => set({ subrace }),
  setClass: (dndClass) => set({ dndClass, classSkillChoices: [] }),
  setClassSkillChoices: (classSkillChoices) => set({ classSkillChoices }),
  setBackground: (background) => set({ background, backgroundSkillOverride: null }),
  setBackgroundSkillOverride: (backgroundSkillOverride) => set({ backgroundSkillOverride }),
  setAbilityScore: (ability, value) =>
    set((state) => ({ abilityScores: { ...state.abilityScores, [ability]: value } })),
  resetAbilityScores: () => set({ abilityScores: { ...DEFAULT_ABILITY_SCORES } }),
  setName: (name) => set({ name }),
  setAlignment: (alignment) => set({ alignment }),
  setAge: (age) => set({ age }),
  setHeight: (height) => set({ height }),
  setWeight: (weight) => set({ weight }),
  setPronouns: (pronouns) => set({ pronouns }),
  setBackstory: (backstory) => set({ backstory }),
  setStep: (currentStep) => set({ currentStep }),
}))
