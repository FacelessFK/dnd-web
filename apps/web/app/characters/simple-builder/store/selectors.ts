import type { AbilityName, CharacterState, SkillName } from '../types';
import { SKILL_MAP, ALL_SKILLS } from '../data/skills';

const ABILITIES: AbilityName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export const LANGUAGE_OPTIONS = [
  'Common',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
  'Abyssal',
  'Celestial',
  'Draconic',
  'Deep Speech',
  'Infernal',
  'Primordial',
  'Sylvan',
  'Undercommon',
];

export function getFinalAbilityScores(
  state: CharacterState,
): Record<AbilityName, number> {
  const base = state.abilityScores;

  return Object.fromEntries(
    ABILITIES.map((a) => [
      a,
      base[a] + getRaceAbilityBonusForAbility(state, a),
    ]),
  ) as Record<AbilityName, number>;
}

export function getRaceAbilityBonusForAbility(
  state: CharacterState,
  ability: AbilityName,
): number {
  const raceAsi = state.race?.asi ?? {};
  const subraceAsi = state.subrace?.asi ?? {};
  const chosenBonus = getSelectedRaceAbilityChoices(state).includes(ability)
    ? 1
    : 0;

  return (raceAsi[ability] ?? 0) + (subraceAsi[ability] ?? 0) + chosenBonus;
}

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getAbilityModifiers(
  state: CharacterState,
): Record<AbilityName, number> {
  const finals = getFinalAbilityScores(state);
  return Object.fromEntries(
    ABILITIES.map((a) => [a, getAbilityModifier(finals[a])]),
  ) as Record<AbilityName, number>;
}

export function getSavingThrows(
  state: CharacterState,
): { ability: AbilityName; value: number; proficient: boolean }[] {
  const mods = getAbilityModifiers(state);
  const profBonus = 2;
  const classSaveProfs = state.dndClass?.savingThrows ?? [];

  return ABILITIES.map((a) => {
    const proficient = classSaveProfs.includes(a);
    return {
      ability: a,
      value: mods[a] + (proficient ? profBonus : 0),
      proficient,
    };
  });
}

export function getProficientSkills(state: CharacterState): SkillName[] {
  const classSkills = state.classSkillChoices;
  const raceSkills = state.raceSkillChoices;
  const bgSkills = state.background?.skillProficiencies ?? [];
  const conflict = getConflictingSkill(state);
  const override = state.backgroundSkillOverride;

  let bgEffective: SkillName[] = bgSkills;
  if (conflict && override) {
    bgEffective = bgSkills.filter((s) => s !== conflict).concat(override);
  }

  const fixedRaceSkills = getFixedRaceSkills(state);
  const all = new Set([
    ...classSkills,
    ...raceSkills,
    ...fixedRaceSkills,
    ...bgEffective,
  ]);
  return Array.from(all);
}

export function getSkills(state: CharacterState): {
  skill: SkillName;
  ability: AbilityName;
  value: number;
  proficient: boolean;
}[] {
  const mods = getAbilityModifiers(state);
  const profBonus = 2;
  const proficient = new Set(getProficientSkills(state));

  return ALL_SKILLS.map((skill) => {
    const ability = SKILL_MAP[skill];
    const isProf = proficient.has(skill);
    return {
      skill,
      ability,
      value: mods[ability] + (isProf ? profBonus : 0),
      proficient: isProf,
    };
  });
}

export function getPassivePerception(state: CharacterState): number {
  const skills = getSkills(state);
  const perception = skills.find((s) => s.skill === 'Perception');
  return 10 + (perception?.value ?? 0);
}

export function getHP(state: CharacterState): number {
  const mods = getAbilityModifiers(state);
  const hitDie = state.dndClass?.hitDie ?? 8;
  return hitDie + mods.CON;
}

export function getAC(state: CharacterState): number {
  const mods = getAbilityModifiers(state);
  return 10 + mods.DEX;
}

export function getInitiative(state: CharacterState): number {
  return getAbilityModifiers(state).DEX;
}

export function getSpeed(state: CharacterState): number {
  return state.race?.speed ?? 30;
}

export function getAllLanguages(state: CharacterState): string[] {
  const raceLanguages = state.race?.languages ?? [];
  const subraceLanguages = state.subrace?.languages ?? [];
  const classLanguages = getClassGrantedLanguages(state);
  return Array.from(
    new Set([
      ...raceLanguages,
      ...subraceLanguages,
      ...state.raceLanguageChoices,
      ...state.backgroundLanguageChoices,
      ...classLanguages,
    ]),
  );
}

export function getAllProficiencies(state: CharacterState): {
  armor: string[];
  weapons: string[];
  tools: string[];
} {
  const cls = state.dndClass;
  const bg = state.background;
  const armor = Array.from(new Set([...(cls?.armorProficiencies ?? [])]));
  const weapons = Array.from(new Set([...(cls?.weaponProficiencies ?? [])]));
  const tools = Array.from(
    new Set([
      ...(cls?.toolProficiencies ?? []),
      ...(bg?.toolProficiencies ?? []),
    ]),
  );
  return { armor, weapons, tools };
}

const SKILL_DESCRIPTIONS: Record<SkillName, string> = {
  Acrobatics: 'Balance, tumbling, and agile movement',
  'Animal Handling': 'Calming, guiding, and reading animals',
  Arcana: 'Knowledge of magic, spells, and arcane lore',
  Athletics: 'Climbing, jumping, swimming, and feats of strength',
  Deception: 'Lying, disguise, and misleading others',
  History: 'Knowledge of past events, cultures, and people',
  Insight: 'Reading intentions, moods, and body language',
  Intimidation: 'Threats, pressure, and forceful presence',
  Investigation: 'Finding clues and making deductions',
  Medicine: 'Stabilizing creatures and diagnosing illness',
  Nature: 'Knowledge of terrain, plants, animals, and weather',
  Perception: 'Noticing details, danger, and hidden things',
  Performance: 'Entertaining through music, acting, or speech',
  Persuasion: 'Diplomacy, etiquette, and winning people over',
  Religion: 'Knowledge of deities, rites, and sacred lore',
  'Sleight of Hand': 'Manual trickery, palming, and pickpocketing',
  Stealth: 'Moving quietly and staying unseen',
  Survival: 'Tracking, foraging, navigation, and wilderness signs',
};

export function getOtherProficienciesAndLanguagesSummary(
  state: CharacterState,
): {
  languages: string[];
  skillGroups: {
    source: string;
    skills: { name: SkillName; description: string }[];
  }[];
  tools: string[];
} {
  const skillGroups: {
    source: string;
    skills: { name: SkillName; description: string }[];
  }[] = [];
  const addSkillGroup = (source: string | undefined, skills: SkillName[]) => {
    const uniqueSkills = Array.from(new Set(skills));
    if (!source || uniqueSkills.length === 0) return;
    skillGroups.push({
      source,
      skills: uniqueSkills.map((name) => ({
        description: SKILL_DESCRIPTIONS[name],
        name,
      })),
    });
  };

  addSkillGroup(state.dndClass?.name, state.classSkillChoices);

  const backgroundSkills = getEffectiveBackgroundSkills(state);
  addSkillGroup(state.background?.name, backgroundSkills);

  addSkillGroup(state.race?.name, [
    ...getFixedRaceSkills(state),
    ...state.raceSkillChoices,
  ]);

  const tools = Array.from(
    new Set([
      ...(state.dndClass?.toolProficiencies ?? []),
      ...(state.background?.toolProficiencies ?? []),
    ]),
  );

  return {
    languages: getAllLanguages(state),
    skillGroups,
    tools,
  };
}

export interface Feature {
  name: string;
  description: string;
  source: string;
}

export function getAllFeatures(state: CharacterState): Feature[] {
  const features: Feature[] = [];

  for (const t of state.race?.traits ?? []) {
    features.push({ ...t, source: state.race?.name ?? 'Race' });
  }
  for (const t of state.subrace?.traits ?? []) {
    features.push({ ...t, source: state.subrace?.name ?? 'Subrace' });
  }
  for (const f of state.dndClass?.features ?? []) {
    features.push({ ...f, source: state.dndClass?.name ?? 'Class' });
  }
  if (state.background?.feature) {
    features.push({
      ...state.background.feature,
      source: state.background.name,
    });
  }

  return features;
}

export function getConflictingSkill(state: CharacterState): SkillName | null {
  const bgSkills = state.background?.skillProficiencies ?? [];
  for (const s of bgSkills) {
    if (state.classSkillChoices.includes(s)) return s;
  }
  return null;
}

export function getPointsSpent(
  abilityScores: Record<AbilityName, number>,
): number {
  const COSTS: Record<number, number> = {
    8: 0,
    9: 1,
    10: 2,
    11: 3,
    12: 4,
    13: 5,
    14: 7,
    15: 9,
  };
  return Object.values(abilityScores).reduce(
    (sum, score) => sum + (COSTS[score] ?? 0),
    0,
  );
}

export function getPointsRemaining(
  abilityScores: Record<AbilityName, number>,
): number {
  return 27 - getPointsSpent(abilityScores);
}

export function getCostToIncrease(currentScore: number): number {
  if (currentScore < 13) return 1;
  if (currentScore < 15) return 2;
  return Infinity;
}

export function getAllEquipment(state: CharacterState): string[] {
  const classEq = state.dndClass?.equipment ?? [];
  const classChoiceEq = Object.values(state.classEquipmentChoices).flat();
  const bgEq = state.background?.equipment ?? [];
  return Array.from(new Set([...classEq, ...classChoiceEq, ...bgEq]));
}

export function getRaceLanguageChoiceLimit(state: CharacterState): number {
  return (
    (state.race?.languageChoiceCount ?? 0) +
    (state.subrace?.languageChoiceCount ?? 0)
  );
}

export function getRaceAbilityChoiceLimit(state: CharacterState): number {
  return state.race?.abilityChoiceCount ?? 0;
}

export function getAvailableRaceAbilityChoices(
  state: CharacterState,
): AbilityName[] {
  return state.race?.abilityChoiceOptions ?? ABILITIES;
}

export function getBackgroundLanguageChoiceLimit(
  state: CharacterState,
): number {
  return state.background?.languages ?? 0;
}

export function getAvailableLanguageChoices(
  state: CharacterState,
  source: 'background' | 'race',
): string[] {
  const fixed = new Set([
    ...(state.race?.languages ?? []),
    ...(state.subrace?.languages ?? []),
    ...getClassGrantedLanguages(state),
  ]);
  const otherChoices =
    source === 'race'
      ? state.backgroundLanguageChoices
      : state.raceLanguageChoices;

  return LANGUAGE_OPTIONS.filter(
    (language) => !fixed.has(language) && !otherChoices.includes(language),
  );
}

export function getRaceSkillChoiceLimit(state: CharacterState): number {
  return state.race?.skillChoiceCount ?? 0;
}

export function getAvailableRaceSkillChoices(
  state: CharacterState,
): SkillName[] {
  const fixedSkills = new Set([
    ...getFixedRaceSkills(state),
    ...(state.background?.skillProficiencies ?? []),
    ...state.classSkillChoices,
  ]);
  return (state.race?.skillChoiceOptions ?? ALL_SKILLS).filter(
    (value) => !fixedSkills.has(value),
  );
}

export function getRequiredEquipmentChoiceGroups(state: CharacterState) {
  return (
    state.dndClass?.equipmentChoices?.filter((group) => group.required) ?? []
  );
}

export function hasValidClassEquipmentChoices(state: CharacterState): boolean {
  return getRequiredEquipmentChoiceGroups(state).every((group) => {
    const selected = state.classEquipmentChoices[group.id] ?? [];
    return group.options.some((option) => arraysEqual(option.items, selected));
  });
}

export function getPreparedSpellLimit(state: CharacterState): number {
  const spellcasting = state.dndClass?.spellcasting;
  if (!spellcasting || spellcasting.spellSlots.length === 0) return 0;
  if (state.dndClass?.id === 'druid' || state.dndClass?.id === 'cleric') {
    return Math.max(1, 1 + getAbilityModifiers(state)[spellcasting.ability]);
  }
  return spellcasting.spellsKnown ?? spellcasting.preparedSpells?.length ?? 0;
}

export function hasValidSpellChoices(state: CharacterState): boolean {
  const spellcasting = state.dndClass?.spellcasting;
  if (!spellcasting || spellcasting.spellSlots.length === 0) return true;

  const cantripTarget = spellcasting.cantripOptions
    ? spellcasting.cantripsKnown
    : 0;
  const preparedTarget = spellcasting.preparedSpellOptions
    ? getPreparedSpellLimit(state)
    : 0;

  return (
    state.classSpellChoices.cantrips.length === cantripTarget &&
    state.classSpellChoices.preparedSpells.length === preparedTarget
  );
}

export function getSpellcastingSummary(state: CharacterState) {
  const spellcasting = state.dndClass?.spellcasting;
  if (!spellcasting || spellcasting.spellSlots.length === 0) return null;

  const abilityMod = getAbilityModifiers(state)[spellcasting.ability];
  const proficiencyBonus = 2;
  const cantripOptions =
    spellcasting.cantripOptions ?? spellcasting.cantrips ?? [];
  const preparedSpellOptions =
    spellcasting.preparedSpellOptions ?? spellcasting.preparedSpells ?? [];
  const preparedLimit = getPreparedSpellLimit(state);

  return {
    ability: spellcasting.ability,
    abilityModifier: abilityMod,
    cantripsKnown: spellcasting.cantripsKnown,
    cantripOptions,
    preparedLimit,
    preparedSpellOptions,
    selectedCantrips: state.classSpellChoices.cantrips,
    selectedPreparedSpells: state.classSpellChoices.preparedSpells,
    spellAttackBonus: proficiencyBonus + abilityMod,
    spellSaveDc: 8 + proficiencyBonus + abilityMod,
    spellSlots: spellcasting.spellSlots,
  };
}

function getClassGrantedLanguages(state: CharacterState): string[] {
  if (state.dndClass?.id === 'druid') return ['Druidic'];
  if (state.dndClass?.id === 'rogue') return ["Thieves' Cant"];
  return [];
}

function getEffectiveBackgroundSkills(state: CharacterState): SkillName[] {
  const bgSkills = state.background?.skillProficiencies ?? [];
  const conflict = getConflictingSkill(state);
  const override = state.backgroundSkillOverride;

  if (conflict && override) {
    return bgSkills.filter((skill) => skill !== conflict).concat(override);
  }

  return bgSkills;
}

function getFixedRaceSkills(state: CharacterState): SkillName[] {
  if (state.race?.id === 'elf') return ['Perception'];
  if (state.race?.id === 'half-orc') return ['Intimidation'];
  return [];
}

function getSelectedRaceAbilityChoices(state: CharacterState): AbilityName[] {
  const choiceLimit = getRaceAbilityChoiceLimit(state);
  const abilityOptions = new Set(getAvailableRaceAbilityChoices(state));

  if (choiceLimit <= 0) return [];

  return state.raceAbilityChoices
    .filter((ability, index, choices) => {
      return abilityOptions.has(ability) && choices.indexOf(ability) === index;
    })
    .slice(0, choiceLimit);
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
