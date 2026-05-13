import type { AbilityName, CharacterState, SkillName } from '../types'
import { SKILL_MAP, ALL_SKILLS } from '../data/skills'

export function getFinalAbilityScores(state: CharacterState): Record<AbilityName, number> {
  const base = state.abilityScores
  const raceAsi = state.race?.asi ?? {}
  const subraceAsi = state.subrace?.asi ?? {}

  const abilities: AbilityName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
  return Object.fromEntries(
    abilities.map((a) => [a, base[a] + (raceAsi[a] ?? 0) + (subraceAsi[a] ?? 0)])
  ) as Record<AbilityName, number>
}

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function getAbilityModifiers(state: CharacterState): Record<AbilityName, number> {
  const finals = getFinalAbilityScores(state)
  const abilities: AbilityName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
  return Object.fromEntries(
    abilities.map((a) => [a, getAbilityModifier(finals[a])])
  ) as Record<AbilityName, number>
}

export function getSavingThrows(state: CharacterState): { ability: AbilityName; value: number; proficient: boolean }[] {
  const mods = getAbilityModifiers(state)
  const profBonus = 2
  const classSaveProfs = state.dndClass?.savingThrows ?? []

  const abilities: AbilityName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
  return abilities.map((a) => {
    const proficient = classSaveProfs.includes(a)
    return { ability: a, value: mods[a] + (proficient ? profBonus : 0), proficient }
  })
}

export function getProficientSkills(state: CharacterState): SkillName[] {
  const classSkills = state.classSkillChoices
  const bgSkills = state.background?.skillProficiencies ?? []
  const conflict = getConflictingSkill(state)
  const override = state.backgroundSkillOverride

  let bgEffective: SkillName[] = bgSkills
  if (conflict && override) {
    bgEffective = bgSkills.filter((s) => s !== conflict).concat(override)
  }

  const all = new Set([...classSkills, ...bgEffective])
  return Array.from(all)
}

export function getSkills(state: CharacterState): {
  skill: SkillName
  ability: AbilityName
  value: number
  proficient: boolean
}[] {
  const mods = getAbilityModifiers(state)
  const profBonus = 2
  const proficient = new Set(getProficientSkills(state))

  return ALL_SKILLS.map((skill) => {
    const ability = SKILL_MAP[skill]
    const isProf = proficient.has(skill)
    return { skill, ability, value: mods[ability] + (isProf ? profBonus : 0), proficient: isProf }
  })
}

export function getPassivePerception(state: CharacterState): number {
  const skills = getSkills(state)
  const perception = skills.find((s) => s.skill === 'Perception')
  return 10 + (perception?.value ?? 0)
}

export function getHP(state: CharacterState): number {
  const mods = getAbilityModifiers(state)
  const hitDie = state.dndClass?.hitDie ?? 8
  return hitDie + mods.CON
}

export function getAC(state: CharacterState): number {
  const mods = getAbilityModifiers(state)
  return 10 + mods.DEX
}

export function getInitiative(state: CharacterState): number {
  return getAbilityModifiers(state).DEX
}

export function getSpeed(state: CharacterState): number {
  return state.race?.speed ?? 30
}

export function getAllLanguages(state: CharacterState): string[] {
  const raceLanguages = state.race?.languages ?? []
  return Array.from(new Set([...raceLanguages]))
}

export function getAllProficiencies(state: CharacterState): {
  armor: string[]
  weapons: string[]
  tools: string[]
} {
  const cls = state.dndClass
  const bg = state.background
  const armor = Array.from(new Set([...(cls?.armorProficiencies ?? [])]))
  const weapons = Array.from(new Set([...(cls?.weaponProficiencies ?? [])]))
  const tools = Array.from(new Set([...(cls?.toolProficiencies ?? []), ...(bg?.toolProficiencies ?? [])]))
  return { armor, weapons, tools }
}

export interface Feature {
  name: string
  description: string
  source: string
}

export function getAllFeatures(state: CharacterState): Feature[] {
  const features: Feature[] = []

  for (const t of state.race?.traits ?? []) {
    features.push({ ...t, source: state.race?.name ?? 'Race' })
  }
  for (const t of state.subrace?.traits ?? []) {
    features.push({ ...t, source: state.subrace?.name ?? 'Subrace' })
  }
  for (const f of state.dndClass?.features ?? []) {
    features.push({ ...f, source: state.dndClass?.name ?? 'Class' })
  }
  if (state.background?.feature) {
    features.push({ ...state.background.feature, source: state.background.name })
  }

  return features
}

export function getConflictingSkill(state: CharacterState): SkillName | null {
  const bgSkills = state.background?.skillProficiencies ?? []
  for (const s of bgSkills) {
    if (state.classSkillChoices.includes(s)) return s
  }
  return null
}

export function getPointsSpent(abilityScores: Record<AbilityName, number>): number {
  const COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }
  return Object.values(abilityScores).reduce((sum, score) => sum + (COSTS[score] ?? 0), 0)
}

export function getPointsRemaining(abilityScores: Record<AbilityName, number>): number {
  return 27 - getPointsSpent(abilityScores)
}

export function getCostToIncrease(currentScore: number): number {
  if (currentScore < 13) return 1
  if (currentScore < 15) return 2
  return Infinity
}

export function getAllEquipment(state: CharacterState): string[] {
  const classEq = state.dndClass?.equipment ?? []
  const bgEq = state.background?.equipment ?? []
  return [...classEq, ...bgEq]
}
