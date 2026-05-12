import {
  abilityKeys,
  backgroundChoices,
  builderSteps,
  classChoices,
  type AbilityKey,
  type BackgroundChoiceCard,
  type BuilderChoiceCard,
  type BuilderStepId,
  type CharacterBuilderDraft,
  type CharacterBuilderLibraryEntry,
  type CharacterBuilderStatus,
  type ClassChoiceCard,
  speciesChoices,
} from './character-builder-data';
import {
  changeAbilityScoreMethod,
  deriveDefaultBuilderSelections,
  deriveRuleDerivedPreview,
  getProficiencyBonus,
  getRuleProfileById,
  getValidationIssuesForStep,
  sanitizeRuleSelections,
  toggleRuleSelection,
} from './character-builder-rules-helpers';
import {
  defaultRulesProfileId,
  type AbilityScoreMethod,
} from './character-builder-rules-data';

export type CharacterLibraryFilter = {
  query: string;
  status: CharacterBuilderStatus | 'all';
};

export const defaultCharacterLibraryOwnerParticipantId = 'dev-player-001';

export type CharacterBuilderSummary = {
  armorClass: number;
  className: string;
  hitPoints: number;
  initiative: number;
  level: number;
  name: string;
  proficiencyBonus: number;
  speciesOrRace: string;
  speed: number;
  status: CharacterBuilderStatus;
  title: string;
};

const defaultAbilities: Record<AbilityKey, number> = {
  cha: 10,
  con: 13,
  dex: 14,
  int: 15,
  str: 8,
  wis: 12,
};

export function createDefaultCharacterBuilderDraft(
  overrides: Partial<CharacterBuilderDraft> = {},
): CharacterBuilderDraft {
  const abilities = {
    ...defaultAbilities,
    ...overrides.abilities,
  };
  const level = overrides.level ?? 1;
  const draftBase: CharacterBuilderDraft = {
    abilities,
    abilityScoreMethod: overrides.abilityScoreMethod ?? 'standard-array',
    armorClass: overrides.armorClass ?? 10 + getAbilityModifier(abilities.dex),
    background: overrides.background ?? 'Sage',
    builderSelections: {
      cantrips: ['Light', 'Mage Hand', 'Ray of Frost'],
      equipment: ['Quarterstaff', 'Arcane Focus', "Scholar's Pack"],
      languages: ['Common', 'Elvish', 'Draconic'],
      originFeatAbility: 'int',
      originFeatCantrips: ['Light', 'Mage Hand'],
      originFeatSpell: 'Detect Magic',
      skills: ['Arcana', 'History', 'Investigation', 'Insight'],
      spells: ['Detect Magic', 'Mage Armor', 'Magic Missile', 'Shield'],
      tools: ["Calligrapher's Supplies"],
      ...overrides.builderSelections,
    },
    builderStep: overrides.builderStep ?? 'identity',
    className: overrides.className ?? 'Wizard',
    concept:
      overrides.concept ?? 'A moonlit scholar drawn to forgotten arcane ruins.',
    hp: {
      current: overrides.hp?.current ?? 1,
      max: overrides.hp?.max ?? 1,
      temp: overrides.hp?.temp ?? 0,
    },
    id: overrides.id,
    level,
    name: overrides.name ?? 'Elara Nightbloom',
    notes:
      overrides.notes ??
      'Curious, contemplative, and quietly determined. Keeps a journal of impossible stars.',
    ownerParticipantId:
      overrides.ownerParticipantId ?? defaultCharacterLibraryOwnerParticipantId,
    portrait: overrides.portrait ?? null,
    pronouns: overrides.pronouns ?? 'she / her',
    rulesProfileId: overrides.rulesProfileId ?? defaultRulesProfileId,
    speciesOrRace: overrides.speciesOrRace ?? 'Elf',
    speed: overrides.speed ?? 30,
    status: overrides.status ?? 'draft',
  };
  const defaultSelections = deriveDefaultBuilderSelections(draftBase);
  const sanitizedDraft = sanitizeRuleSelections({
    ...draftBase,
    builderSelections: {
      ...defaultSelections,
      ...overrides.builderSelections,
    },
  });
  const preview = deriveRuleDerivedPreview(sanitizedDraft);
  const hitPoints = Math.max(1, overrides.hp?.max ?? preview.hitPoints.value);

  return {
    ...sanitizedDraft,
    armorClass: overrides.armorClass ?? preview.armorClass.value,
    hp: {
      current: overrides.hp?.current ?? hitPoints,
      max: hitPoints,
      temp: overrides.hp?.temp ?? 0,
    },
    speed: overrides.speed ?? preview.speed,
  };
}

export function filterCharacterLibraryEntries(
  entries: CharacterBuilderLibraryEntry[],
  filter: CharacterLibraryFilter,
): CharacterBuilderLibraryEntry[] {
  const normalizedQuery = filter.query.trim().toLowerCase();

  return entries.filter((entry) => {
    const matchesStatus =
      filter.status === 'all' || entry.status === filter.status;
    const matchesQuery =
      !normalizedQuery ||
      [entry.name, entry.className, entry.speciesOrRace, entry.summary]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);

    return matchesStatus && matchesQuery;
  });
}

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatAbilityModifier(score: number): string {
  const modifier = getAbilityModifier(score);

  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

export function clampAbilityScore(score: number): number {
  return Math.min(20, Math.max(3, Math.trunc(score)));
}

export function updateAbilityScore(
  draft: CharacterBuilderDraft,
  ability: AbilityKey,
  delta: number,
): CharacterBuilderDraft {
  const profile = getRuleProfileById(draft.rulesProfileId);
  const scoreMethod = draft.abilityScoreMethod;
  const min =
    scoreMethod === 'manual'
      ? profile.abilityScoreRules.manualMin
      : profile.abilityScoreRules.pointBuyMin;
  const max =
    scoreMethod === 'manual'
      ? profile.abilityScoreRules.manualMax
      : profile.abilityScoreRules.pointBuyMax;
  const abilities = {
    ...draft.abilities,
    [ability]: Math.min(
      max,
      Math.max(min, Math.trunc(draft.abilities[ability] + delta)),
    ),
  };

  return normalizeCharacterBuilderDraft({
    ...draft,
    abilities,
  });
}

export function normalizeCharacterBuilderDraft(
  draft: CharacterBuilderDraft,
): CharacterBuilderDraft {
  const abilities = abilityKeys.reduce<Record<AbilityKey, number>>(
    (next, ability) => {
      next[ability] = clampAbilityScore(draft.abilities[ability]);
      return next;
    },
    {
      cha: 10,
      con: 10,
      dex: 10,
      int: 10,
      str: 10,
      wis: 10,
    },
  );
  const maxHp = Math.max(1, Math.trunc(draft.hp.max));
  const tempHp = Math.max(0, Math.trunc(draft.hp.temp));

  return sanitizeRuleSelections({
    ...draft,
    abilities,
    abilityScoreMethod: draft.abilityScoreMethod,
    armorClass: Math.max(1, Math.trunc(draft.armorClass)),
    hp: {
      current: Math.min(maxHp, Math.max(0, Math.trunc(draft.hp.current))),
      max: maxHp,
      temp: tempHp,
    },
    level: Math.min(20, Math.max(1, Math.trunc(draft.level))),
    speed: Math.max(0, Math.trunc(draft.speed)),
  });
}

export function getBuilderStepIndex(stepId: BuilderStepId): number {
  return builderSteps.findIndex((step) => step.id === stepId);
}

export function getNextBuilderStep(stepId: BuilderStepId): BuilderStepId {
  const index = getBuilderStepIndex(stepId);
  const nextStep = builderSteps[Math.min(builderSteps.length - 1, index + 1)];

  return nextStep?.id ?? 'review';
}

export function getPreviousBuilderStep(stepId: BuilderStepId): BuilderStepId {
  const index = getBuilderStepIndex(stepId);
  const previousStep = builderSteps[Math.max(0, index - 1)];

  return previousStep?.id ?? 'identity';
}

export function isStepComplete(
  draft: CharacterBuilderDraft,
  stepId: BuilderStepId,
): boolean {
  const stepIssues = getValidationIssuesForStep(draft, stepId);

  if (stepIssues.some((issue) => issue.severity === 'error')) {
    return false;
  }

  switch (stepId) {
    case 'identity':
      return draft.name.trim().length > 0;
    case 'species':
      return draft.speciesOrRace.trim().length > 0;
    case 'class':
      return draft.className.trim().length > 0;
    case 'background':
      return draft.background.trim().length > 0;
    case 'ability-scores':
      return abilityKeys.every((ability) => draft.abilities[ability] >= 3);
    case 'proficiencies':
      return (
        draft.builderSelections.skills.length > 0 &&
        draft.builderSelections.languages.length > 0
      );
    case 'equipment':
      return draft.builderSelections.equipment.length > 0;
    case 'spells':
      return true;
    case 'review':
      return builderSteps
        .filter((step) => step.id !== 'review')
        .every((step) => isStepComplete(draft, step.id));
  }
}

export function updateAbilityScoreMethod(
  draft: CharacterBuilderDraft,
  method: AbilityScoreMethod,
): CharacterBuilderDraft {
  return changeAbilityScoreMethod(draft, method);
}

export function getBuilderCompletionCount(
  draft: CharacterBuilderDraft,
): number {
  return builderSteps.filter((step) => isStepComplete(draft, step.id)).length;
}

export function deriveCharacterBuilderSummary(
  draft: CharacterBuilderDraft,
): CharacterBuilderSummary {
  const normalizedDraft = normalizeCharacterBuilderDraft(draft);
  const preview = deriveRuleDerivedPreview(normalizedDraft);

  return {
    armorClass: preview.armorClass.value,
    className: normalizedDraft.className || 'Unchosen Class',
    hitPoints: preview.hitPoints.value,
    initiative: preview.initiative,
    level: normalizedDraft.level,
    name: normalizedDraft.name.trim() || 'Unnamed Adventurer',
    proficiencyBonus: getProficiencyBonus(normalizedDraft.level),
    speciesOrRace: normalizedDraft.speciesOrRace || 'Unchosen Species',
    speed: preview.speed,
    status: normalizedDraft.status,
    title: [
      `Level ${normalizedDraft.level}`,
      normalizedDraft.speciesOrRace,
      normalizedDraft.className,
      normalizedDraft.background ? `(${normalizedDraft.background})` : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export function getSelectedSpecies(
  draft: CharacterBuilderDraft,
): BuilderChoiceCard | undefined {
  return speciesChoices.find((choice) => choice.id === draft.speciesOrRace);
}

export function getSelectedClass(
  draft: CharacterBuilderDraft,
): ClassChoiceCard | undefined {
  return classChoices.find((choice) => choice.id === draft.className);
}

export function getSelectedBackground(
  draft: CharacterBuilderDraft,
): BackgroundChoiceCard | undefined {
  return backgroundChoices.find((choice) => choice.id === draft.background);
}

export function toggleBuilderSelection(
  values: string[],
  value: string,
  maxSelected?: number,
): string[] {
  return toggleRuleSelection(
    values,
    value,
    maxSelected ?? Number.MAX_SAFE_INTEGER,
  );
}

export function getStatusLabel(status: CharacterBuilderStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'ready':
      return 'Ready';
    case 'in_session':
      return 'In Session';
  }
}

export function getStatusTone(status: CharacterBuilderStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-stone-700 text-stone-100 ring-stone-400/40';
    case 'ready':
      return 'bg-emerald-900 text-emerald-100 ring-emerald-400/50';
    case 'in_session':
      return 'bg-sky-900 text-sky-100 ring-sky-400/50';
  }
}
