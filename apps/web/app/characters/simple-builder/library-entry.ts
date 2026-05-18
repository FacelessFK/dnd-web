import type {
  CharacterLibraryEntry,
  CharacterLibraryEntryInput,
} from '@dnd/protocol';

import { createUploadedPortraitReferenceFromDataUrl } from '../../../lib/character-library-mappers';
import {
  downloadCharacterSheetPdf,
  type CharacterSheetTemplateId,
} from '../../../lib/character-sheet-pdf';
import {
  getAC,
  getAllEquipment,
  getHP,
  getOtherProficienciesAndLanguagesSummary,
  getSkills,
  getSpellcastingSummary,
  getSpeed,
} from './store/selectors';
import type { AbilityName, CharacterState } from './types';

export type SimpleBuilderSelections = {
  cantrips: string[];
  equipment: string[];
  languages: string[];
  proficientSkills: string[];
  spells: string[];
  tools: string[];
};

const abilityNameToKey = {
  CHA: 'cha',
  CON: 'con',
  DEX: 'dex',
  INT: 'int',
  STR: 'str',
  WIS: 'wis',
} as const;

export function createSimpleBuilderSelections(
  state: CharacterState,
): SimpleBuilderSelections {
  const spellcastingSummary = getSpellcastingSummary(state);
  const otherProficiencies = getOtherProficienciesAndLanguagesSummary(state);

  return {
    cantrips: spellcastingSummary?.selectedCantrips.length
      ? spellcastingSummary.selectedCantrips
      : (state.dndClass?.spellcasting?.cantrips ?? []),
    equipment: getAllEquipment(state),
    languages: otherProficiencies.languages,
    proficientSkills: getSkills(state)
      .filter((item) => item.proficient)
      .map((item) => item.skill),
    spells: spellcastingSummary?.selectedPreparedSpells.length
      ? spellcastingSummary.selectedPreparedSpells
      : (state.dndClass?.spellcasting?.preparedSpells ?? []),
    tools: otherProficiencies.tools,
  };
}

export function createSimpleBuilderLibraryEntry(
  state: CharacterState,
  selections: SimpleBuilderSelections,
  templateId: CharacterSheetTemplateId,
  ownerParticipantId: string,
): CharacterLibraryEntry {
  const now = new Date().toISOString();
  const abilities = Object.fromEntries(
    (Object.keys(state.abilityScores) as AbilityName[]).map((ability) => [
      abilityNameToKey[ability],
      state.abilityScores[ability],
    ]),
  ) as CharacterLibraryEntry['abilities'];
  const hitPoints = getHP(state);

  return {
    abilities,
    abilityScoreMethod: 'point-buy',
    armorClass: getAC(state),
    background: state.background?.name ?? 'Soldier',
    builderSelections: {
      cantrips: selections.cantrips,
      equipment: selections.equipment,
      languages: selections.languages,
      originFeatAbility: '',
      originFeatCantrips: [],
      originFeatSpell: '',
      skills: selections.proficientSkills,
      spells: selections.spells,
      tools: selections.tools,
    },
    builderStep: 'review',
    className: state.dndClass?.name ?? 'Fighter',
    concept: state.backstory,
    createdAt: now,
    hp: {
      current: hitPoints,
      max: hitPoints,
      temp: 0,
    },
    id: 'charlib_00000000-0000-4000-8000-000000000000',
    level: 1,
    name: state.name.trim() || 'Unnamed Hero',
    notes: state.backstory,
    ownerParticipantId,
    portrait: state.portraitDataUrl
      ? createUploadedPortraitReferenceFromDataUrl(state.portraitDataUrl, {
          fileName: 'character-portrait.png',
        })
      : null,
    pronouns: state.pronouns,
    rulesProfileId:
      templateId === 'dnd-2014-template'
        ? 'dnd-2014-srd-5-1'
        : 'dnd-2024-free-rules',
    speciesOrRace: state.race?.name ?? 'Human',
    speed: getSpeed(state),
    status: 'draft',
    updatedAt: now,
  };
}

export function toCharacterLibraryEntryInput(
  entry: CharacterLibraryEntry,
): CharacterLibraryEntryInput {
  return {
    abilities: entry.abilities,
    abilityScoreMethod: entry.abilityScoreMethod,
    armorClass: entry.armorClass,
    background: entry.background,
    builderSelections: entry.builderSelections,
    builderStep: entry.builderStep,
    className: entry.className,
    concept: entry.concept,
    hp: entry.hp,
    level: entry.level,
    name: entry.name,
    notes: entry.notes,
    portrait: entry.portrait,
    pronouns: entry.pronouns,
    rulesProfileId: entry.rulesProfileId,
    speciesOrRace: entry.speciesOrRace,
    speed: entry.speed,
  };
}

export async function downloadSimpleBuilderCharacterSheet(
  state: CharacterState,
  ownerParticipantId: string,
  templateId: CharacterSheetTemplateId,
) {
  return downloadCharacterSheetPdf(
    createSimpleBuilderLibraryEntry(
      state,
      createSimpleBuilderSelections(state),
      templateId,
      ownerParticipantId,
    ),
    { templateId },
  );
}
