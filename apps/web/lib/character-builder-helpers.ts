import {
  abilityKeys,
  type AbilityKey,
  type CharacterBuilderDraft,
  type CharacterBuilderLibraryEntry,
  type CharacterBuilderStatus,
} from './character-builder-data';
import {
  deriveDefaultBuilderSelections,
  deriveRuleDerivedPreview,
  getProficiencyBonus,
  sanitizeRuleSelections,
} from './character-builder-rules-helpers';
import { defaultRulesProfileId } from './character-builder-rules-data';

export type CharacterLibraryFilter = {
  query: string;
  status: CharacterBuilderStatus | 'all';
};

const defaultCharacterLibraryOwnerParticipantId = 'dev-player-001';

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

function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function clampAbilityScore(score: number): number {
  return Math.min(20, Math.max(3, Math.trunc(score)));
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

export function getStatusLabel(status: CharacterBuilderStatus): string {
  switch (status) {
    case 'draft':
      return 'پیش‌نویس';
    case 'ready':
      return 'آماده';
    case 'in_session':
      return 'داخل جلسه';
  }
}
