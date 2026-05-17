import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AbilityName,
  Alignment,
  CharacterState,
  DnDClass,
  Background,
  Race,
  SkillName,
  StepId,
  Subrace,
} from '../types';

const DEFAULT_ABILITY_SCORES: Record<AbilityName, number> = {
  STR: 8,
  DEX: 8,
  CON: 8,
  INT: 8,
  WIS: 8,
  CHA: 8,
};

interface CharacterStore extends CharacterState {
  setRace: (race: Race | null) => void;
  setSubrace: (subrace: Subrace | null) => void;
  setRaceLanguageChoices: (languages: string[]) => void;
  setRaceSkillChoices: (skills: SkillName[]) => void;
  setClass: (dndClass: DnDClass | null) => void;
  setClassSkillChoices: (skills: SkillName[]) => void;
  setClassEquipmentChoices: (choices: Record<string, string[]>) => void;
  setClassSpellChoices: (choices: CharacterState['classSpellChoices']) => void;
  setBackground: (background: Background | null) => void;
  setBackgroundSkillOverride: (skill: SkillName | null) => void;
  setBackgroundLanguageChoices: (languages: string[]) => void;
  setAbilityScore: (ability: AbilityName, value: number) => void;
  resetAbilityScores: () => void;
  setName: (name: string) => void;
  setAlignment: (alignment: Alignment | null) => void;
  setAge: (age: string) => void;
  setHeight: (height: string) => void;
  setWeight: (weight: string) => void;
  setPronouns: (pronouns: string) => void;
  setPortraitDataUrl: (portraitDataUrl: string) => void;
  setBackstory: (backstory: string) => void;
  setStep: (step: StepId) => void;
}

const DEFAULT_CHARACTER_STATE: CharacterState = {
  race: null,
  subrace: null,
  raceLanguageChoices: [],
  raceSkillChoices: [],
  dndClass: null,
  classSkillChoices: [],
  classEquipmentChoices: {},
  classSpellChoices: {
    cantrips: [],
    preparedSpells: [],
  },
  background: null,
  backgroundSkillOverride: null,
  backgroundLanguageChoices: [],
  abilityScores: { ...DEFAULT_ABILITY_SCORES },
  name: '',
  alignment: null,
  age: '',
  height: '',
  weight: '',
  pronouns: '',
  portraitDataUrl: '',
  backstory: '',
  currentStep: 'race',
};

const CharacterStoreContext = createContext<CharacterStore | null>(null);

export function CharacterStoreProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: CharacterState;
}) {
  const [state, setState] = useState<CharacterState>(
    () => initialState ?? DEFAULT_CHARACTER_STATE,
  );

  const value = useMemo<CharacterStore>(
    () => ({
      ...state,
      setRace: (race) =>
        setState((current) => ({
          ...current,
          race,
          raceLanguageChoices: [],
          raceSkillChoices: [],
          subrace: null,
        })),
      setSubrace: (subrace) =>
        setState((current) => ({
          ...current,
          raceLanguageChoices: [],
          subrace,
        })),
      setRaceLanguageChoices: (raceLanguageChoices) =>
        setState((current) => ({ ...current, raceLanguageChoices })),
      setRaceSkillChoices: (raceSkillChoices) =>
        setState((current) => ({ ...current, raceSkillChoices })),
      setClass: (dndClass) =>
        setState((current) => ({
          ...current,
          classEquipmentChoices: {},
          classSkillChoices: [],
          classSpellChoices: { cantrips: [], preparedSpells: [] },
          dndClass,
        })),
      setClassSkillChoices: (classSkillChoices) =>
        setState((current) => ({ ...current, classSkillChoices })),
      setClassEquipmentChoices: (classEquipmentChoices) =>
        setState((current) => ({ ...current, classEquipmentChoices })),
      setClassSpellChoices: (classSpellChoices) =>
        setState((current) => ({ ...current, classSpellChoices })),
      setBackground: (background) =>
        setState((current) => ({
          ...current,
          background,
          backgroundLanguageChoices: [],
          backgroundSkillOverride: null,
        })),
      setBackgroundSkillOverride: (backgroundSkillOverride) =>
        setState((current) => ({ ...current, backgroundSkillOverride })),
      setBackgroundLanguageChoices: (backgroundLanguageChoices) =>
        setState((current) => ({ ...current, backgroundLanguageChoices })),
      setAbilityScore: (ability, value) =>
        setState((current) => ({
          ...current,
          abilityScores: { ...current.abilityScores, [ability]: value },
        })),
      resetAbilityScores: () =>
        setState((current) => ({
          ...current,
          abilityScores: { ...DEFAULT_ABILITY_SCORES },
        })),
      setName: (name) => setState((current) => ({ ...current, name })),
      setAlignment: (alignment) =>
        setState((current) => ({ ...current, alignment })),
      setAge: (age) => setState((current) => ({ ...current, age })),
      setHeight: (height) => setState((current) => ({ ...current, height })),
      setWeight: (weight) => setState((current) => ({ ...current, weight })),
      setPronouns: (pronouns) =>
        setState((current) => ({ ...current, pronouns })),
      setPortraitDataUrl: (portraitDataUrl) =>
        setState((current) => ({ ...current, portraitDataUrl })),
      setBackstory: (backstory) =>
        setState((current) => ({ ...current, backstory })),
      setStep: (currentStep) =>
        setState((current) => ({ ...current, currentStep })),
    }),
    [state],
  );

  return (
    <CharacterStoreContext.Provider value={value}>
      {children}
    </CharacterStoreContext.Provider>
  );
}

export function useCharacterStore() {
  const store = useContext(CharacterStoreContext);

  if (!store) {
    throw new Error(
      'useCharacterStore must be used inside CharacterStoreProvider',
    );
  }

  return store;
}
