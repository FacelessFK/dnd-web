import {
  abilityKeys,
  type AbilityKey,
  type BuilderStepId,
  type CharacterBuilderDraft,
} from './character-builder-data';
import {
  defaultRulesProfileId,
  rulesProfiles,
  rulesBackgrounds,
  rulesClasses,
  rulesEquipment,
  rulesSpells,
  rulesSpecies,
  standardLanguages,
  type AbilityScoreMethod,
  type CharacterRulesProfile,
  type RuleBackground,
  type RuleClass,
  type RuleEquipment,
  type RuleSpecies,
  type RuleSpell,
} from './character-builder-rules-data';

type BuilderSelections = CharacterBuilderDraft['builderSelections'];

export type CharacterBuilderValidationIssue = {
  message: string;
  severity: 'error' | 'warning';
  step: BuilderStepId;
};

export type AbilityScorePreview = {
  ability: AbilityKey;
  rulesBonus: number;
  rulesBonusLabel: string;
  base: number;
  final: number;
  modifier: number;
};

export type ArmorClassPreview = {
  armorLabel: string;
  shieldLabel: string | null;
  value: number;
};

export type HitPointPreview = {
  conModifier: number;
  hitDie: number;
  speciesBonus: number;
  value: number;
};

export type RuleDerivedPreview = {
  abilityScores: Record<AbilityKey, AbilityScorePreview>;
  armorClass: ArmorClassPreview;
  hitPoints: HitPointPreview;
  initiative: number;
  proficiencyBonus: number;
  speed: number;
};

export type AbilityScoreAssignmentState = {
  allowedMethods: AbilityScoreMethod[];
  budget: number | null;
  cost: number | null;
  errors: string[];
  finalScoreCap: number;
  maxBase: number;
  method: AbilityScoreMethod;
  minBase: number;
  remaining: number | null;
  standardArray: number[];
};

export type ProficiencyChoiceState = {
  fixedLanguages: string[];
  fixedSkills: string[];
  fixedTools: string[];
  languageChoiceLimit: number;
  languageOptions: string[];
  savingThrows: AbilityKey[];
  selectedLanguages: string[];
  selectedSkillChoices: string[];
  selectedToolChoices: string[];
  skillChoiceLimit: number;
  skillOptions: string[];
  toolChoiceLimit: number;
  toolOptions: string[];
};

export type CharacterRuleReviewSummary = {
  armorClass: number;
  background: string;
  characterClass: string;
  equipment: string[];
  hitPoints: number;
  initiative: number;
  languages: string[];
  proficiencyBonus: number;
  savingThrows: AbilityKey[];
  skills: string[];
  species: string;
  speed: number;
  spells: {
    cantrips: string[];
    leveled: string[];
  };
  tools: string[];
};

const defaultAbilityScores: Record<AbilityKey, number> = {
  cha: 10,
  con: 10,
  dex: 10,
  int: 10,
  str: 10,
  wis: 10,
};

const speciesLanguageHints: Record<string, string[]> = {
  Dragonborn: ['Draconic'],
  Dwarf: ['Dwarvish'],
  Elf: ['Elvish'],
  Gnome: ['Gnomish'],
  Goliath: ['Giant'],
  Halfling: ['Halfling'],
  Orc: ['Orc'],
  Tiefling: ['Infernal'],
};

export function getRuleProfileById(
  id: string | undefined,
): CharacterRulesProfile {
  const profile =
    rulesProfiles.find((profile) => profile.id === id) ??
    rulesProfiles.find((profile) => profile.id === defaultRulesProfileId) ??
    rulesProfiles[0];

  if (!profile) {
    throw new Error('No character builder rules profiles are configured.');
  }

  return profile;
}

export function getRulesProfileLabel(profile: CharacterRulesProfile): string {
  const sourceType = profile.sourceType.toUpperCase();
  const status =
    profile.status.charAt(0).toUpperCase() + profile.status.slice(1);

  return `${profile.displayName} (${profile.year}, ${status} ${sourceType})`;
}

export function getAvailableRuleSpecies(
  profileId: string | undefined,
): RuleSpecies[] {
  const profile = getRuleProfileById(profileId);
  return rulesSpecies.filter((species) =>
    profile.availableSpeciesIds.includes(species.id),
  );
}

export function getAvailableRuleClasses(
  profileId: string | undefined,
): RuleClass[] {
  const profile = getRuleProfileById(profileId);
  return rulesClasses.filter((characterClass) =>
    profile.availableClassIds.includes(characterClass.id),
  );
}

export function getAvailableRuleBackgrounds(
  profileId: string | undefined,
): RuleBackground[] {
  const profile = getRuleProfileById(profileId);
  return rulesBackgrounds.filter((background) =>
    profile.availableBackgroundIds.includes(background.id),
  );
}

export function getRuleSpeciesById(
  id: string,
  profileId?: string,
): RuleSpecies | undefined {
  return getAvailableRuleSpecies(profileId).find(
    (species) => species.id === id,
  );
}

export function getRuleClassById(
  id: string,
  profileId?: string,
): RuleClass | undefined {
  return getAvailableRuleClasses(profileId).find(
    (characterClass) => characterClass.id === id,
  );
}

export function getRuleBackgroundById(
  id: string,
  profileId?: string,
): RuleBackground | undefined {
  return getAvailableRuleBackgrounds(profileId).find(
    (background) => background.id === id,
  );
}

export function getRuleEquipmentByName(
  name: string,
): RuleEquipment | undefined {
  return rulesEquipment.find((equipment) => equipment.name === name);
}

export function getRuleSpellByName(name: string): RuleSpell | undefined {
  return rulesSpells.find((spell) => spell.name === name);
}

export function getRuleAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getProficiencyBonus(level: number): number {
  const normalizedLevel = Math.min(20, Math.max(1, Math.trunc(level)));

  if (normalizedLevel >= 17) {
    return 6;
  }

  if (normalizedLevel >= 13) {
    return 5;
  }

  if (normalizedLevel >= 9) {
    return 4;
  }

  if (normalizedLevel >= 5) {
    return 3;
  }

  return 2;
}

export function getAbilityScoreMethodLabel(method: AbilityScoreMethod): string {
  switch (method) {
    case 'manual':
      return 'Manual';
    case 'point-buy':
      return 'Point Buy';
    case 'standard-array':
      return 'Standard Array';
  }
}

export function deriveAbilityScoreAssignmentState(
  draft: CharacterBuilderDraft,
): AbilityScoreAssignmentState {
  const profile = getRuleProfileById(draft.rulesProfileId);
  const method = normalizeAbilityScoreMethod(draft.abilityScoreMethod, profile);
  const bounds = getAbilityScoreBounds(profile, method);
  const pointBuyCost =
    method === 'point-buy' ? getPointBuyCost(draft.abilities) : null;
  const budget =
    method === 'point-buy' ? profile.abilityScoreRules.pointBuyBudget : null;
  const errors = validateAbilityScores(draft).map((issue) => issue.message);

  return {
    allowedMethods: profile.allowedAbilityScoreMethods,
    budget,
    cost: pointBuyCost,
    errors,
    finalScoreCap: profile.abilityScoreRules.finalScoreCap,
    maxBase: bounds.max,
    method,
    minBase: bounds.min,
    remaining:
      budget === null || pointBuyCost === null ? null : budget - pointBuyCost,
    standardArray: profile.abilityScoreRules.standardArray,
  };
}

export function sanitizeDraftForRulesProfile(
  draft: CharacterBuilderDraft,
  rulesProfileId: string,
): CharacterBuilderDraft {
  const profile = getRuleProfileById(rulesProfileId);
  const abilities = assignStandardArrayByPriority(profile, {
    ...draft,
    rulesProfileId: profile.id,
  });

  return sanitizeRuleSelections({
    ...draft,
    abilities,
    abilityScoreMethod: profile.defaultAbilityScoreMethod,
    background: normalizeProfileChoice(
      draft.background,
      profile.availableBackgroundIds,
    ),
    className: normalizeProfileChoice(
      draft.className,
      profile.availableClassIds,
    ),
    rulesProfileId: profile.id,
    speciesOrRace: normalizeProfileChoice(
      draft.speciesOrRace,
      profile.availableSpeciesIds,
    ),
  });
}

export function changeAbilityScoreMethod(
  draft: CharacterBuilderDraft,
  method: AbilityScoreMethod,
): CharacterBuilderDraft {
  const profile = getRuleProfileById(draft.rulesProfileId);
  const normalizedMethod = normalizeAbilityScoreMethod(method, profile);
  const abilities =
    normalizedMethod === 'standard-array'
      ? assignStandardArrayByPriority(profile, draft)
      : sanitizeAbilityScoresForMethod(
          draft.abilities,
          profile,
          normalizedMethod,
        );

  return sanitizeRuleSelections({
    ...draft,
    abilities,
    abilityScoreMethod: normalizedMethod,
  });
}

export function validateCharacterBuilderDraft(
  draft: CharacterBuilderDraft,
): CharacterBuilderValidationIssue[] {
  const issues: CharacterBuilderValidationIssue[] = [];
  const profile = getRuleProfileById(draft.rulesProfileId);
  const proficiencyState = deriveProficiencyChoiceState(draft);
  const characterClass = getRuleClassById(draft.className, profile.id);
  const spellcasting = characterClass?.spellcasting;

  if (!draft.name.trim()) {
    issues.push({
      message: 'Name is required before the character can be finalized.',
      severity: 'error',
      step: 'identity',
    });
  }

  if (
    !rulesProfiles.some((candidate) => candidate.id === draft.rulesProfileId)
  ) {
    issues.push({
      message: 'Choose a supported rules profile.',
      severity: 'error',
      step: 'identity',
    });
  }

  if (!getRuleSpeciesById(draft.speciesOrRace, profile.id)) {
    issues.push({
      message: `${draft.speciesOrRace || profile.speciesLabel} is not legal for ${profile.displayName}.`,
      severity: 'error',
      step: 'species',
    });
  }

  if (!characterClass) {
    issues.push({
      message: `${draft.className || 'Class'} is not legal for ${profile.displayName}.`,
      severity: 'error',
      step: 'class',
    });
  }

  if (!getRuleBackgroundById(draft.background, profile.id)) {
    issues.push({
      message: `${draft.background || 'Background'} is not legal for ${profile.displayName}.`,
      severity: 'error',
      step: 'background',
    });
  }

  issues.push(...validateAbilityScores(draft));

  if (
    proficiencyState.selectedSkillChoices.length <
    proficiencyState.skillChoiceLimit
  ) {
    issues.push({
      message: `Choose ${proficiencyState.skillChoiceLimit} class skill proficiencies.`,
      severity: 'error',
      step: 'proficiencies',
    });
  }

  if (
    proficiencyState.selectedLanguages.length <
    proficiencyState.languageChoiceLimit
  ) {
    issues.push({
      message: `Choose ${proficiencyState.languageChoiceLimit} languages.`,
      severity: 'error',
      step: 'proficiencies',
    });
  }

  if (
    proficiencyState.selectedToolChoices.length <
    proficiencyState.toolChoiceLimit
  ) {
    issues.push({
      message: `Choose ${proficiencyState.toolChoiceLimit} tool option(s).`,
      severity: 'error',
      step: 'proficiencies',
    });
  }

  if (draft.builderSelections.equipment.length === 0) {
    issues.push({
      message:
        'Choose at least one equipment item or use the recommended loadout.',
      severity: 'error',
      step: 'equipment',
    });
  }

  if (spellcasting) {
    if (draft.builderSelections.cantrips.length < spellcasting.cantripsKnown) {
      issues.push({
        message: `Choose ${spellcasting.cantripsKnown} cantrip(s) for ${draft.className}.`,
        severity: 'error',
        step: 'spells',
      });
    }

    if (draft.builderSelections.spells.length < spellcasting.preparedSpells) {
      issues.push({
        message: `Choose ${spellcasting.preparedSpells} level 1 spell(s) for ${draft.className}.`,
        severity: 'error',
        step: 'spells',
      });
    }
  }

  return issues;
}

export function getValidationIssuesForStep(
  draft: CharacterBuilderDraft,
  step: BuilderStepId,
): CharacterBuilderValidationIssue[] {
  if (step === 'review') {
    return validateCharacterBuilderDraft(draft);
  }

  return validateCharacterBuilderDraft(draft).filter(
    (issue) => issue.step === step,
  );
}

export function isCharacterBuilderDraftValid(
  draft: CharacterBuilderDraft,
): boolean {
  return validateCharacterBuilderDraft(draft).every(
    (issue) => issue.severity !== 'error',
  );
}

export function deriveBackgroundAbilityBonuses(
  draft: CharacterBuilderDraft,
): Record<AbilityKey, number> {
  const profile = getRuleProfileById(draft.rulesProfileId);
  const background = getRuleBackgroundById(
    draft.background,
    draft.rulesProfileId,
  );
  const characterClass = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const bonuses = { ...defaultAbilityScores };

  for (const ability of abilityKeys) {
    bonuses[ability] = 0;
  }

  if (profile.abilityBonusSource === 'species') {
    const speciesBonuses =
      profile.speciesAbilityBonuses?.[draft.speciesOrRace] ?? {};

    for (const ability of abilityKeys) {
      bonuses[ability] = speciesBonuses[ability] ?? 0;
    }

    return bonuses;
  }

  if (!background) {
    return bonuses;
  }

  const priority = uniqueValues([
    ...(characterClass?.primaryAbilities ?? []),
    'con',
    'dex',
    'wis',
    'int',
    'str',
    'cha',
  ]).filter((ability): ability is AbilityKey =>
    background.abilityScoreOptions.includes(ability as AbilityKey),
  );
  const primary = priority[0] ?? background.abilityScoreOptions[0];
  const secondary =
    priority.find((ability) => ability !== primary) ??
    background.abilityScoreOptions.find((ability) => ability !== primary);

  if (primary) {
    bonuses[primary] = 2;
  }

  if (secondary) {
    bonuses[secondary] = 1;
  }

  return bonuses;
}

export function deriveAbilityScorePreview(
  draft: CharacterBuilderDraft,
): Record<AbilityKey, AbilityScorePreview> {
  const profile = getRuleProfileById(draft.rulesProfileId);
  const rulesBonuses = deriveBackgroundAbilityBonuses(draft);
  const rulesBonusLabel =
    profile.abilityBonusSource === 'background' ? 'background' : 'species';

  return abilityKeys.reduce<Record<AbilityKey, AbilityScorePreview>>(
    (preview, ability) => {
      const base = draft.abilities[ability] ?? 10;
      const final = base + rulesBonuses[ability];

      preview[ability] = {
        ability,
        base,
        final,
        modifier: getRuleAbilityModifier(final),
        rulesBonus: rulesBonuses[ability],
        rulesBonusLabel,
      };

      return preview;
    },
    {
      cha: emptyAbilityPreview('cha'),
      con: emptyAbilityPreview('con'),
      dex: emptyAbilityPreview('dex'),
      int: emptyAbilityPreview('int'),
      str: emptyAbilityPreview('str'),
      wis: emptyAbilityPreview('wis'),
    },
  );
}

export function deriveHitPointPreview(
  draft: CharacterBuilderDraft,
): HitPointPreview {
  const characterClass = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const species = getRuleSpeciesById(draft.speciesOrRace, draft.rulesProfileId);
  const abilityPreview = deriveAbilityScorePreview(draft);
  const level = Math.min(20, Math.max(1, Math.trunc(draft.level)));
  const hitDie = characterClass?.hitDie ?? 8;
  const conModifier = abilityPreview.con.modifier;
  const averageAfterFirst = Math.ceil((hitDie + 1) / 2);
  const speciesBonus = (species?.hpBonusPerLevel ?? 0) * level;
  const firstLevelHp = hitDie + conModifier;
  const laterLevelHp = (level - 1) * (averageAfterFirst + conModifier);
  const value = Math.max(level, firstLevelHp + laterLevelHp + speciesBonus);

  return {
    conModifier,
    hitDie,
    speciesBonus,
    value,
  };
}

export function deriveArmorClassPreview(
  draft: CharacterBuilderDraft,
): ArmorClassPreview {
  const characterClass = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const abilityPreview = deriveAbilityScorePreview(draft);
  const dexModifier = abilityPreview.dex.modifier;
  const conModifier = abilityPreview.con.modifier;
  const wisModifier = abilityPreview.wis.modifier;
  const equipment = draft.builderSelections.equipment
    .map(getRuleEquipmentByName)
    .filter((item): item is RuleEquipment => Boolean(item?.armorClass));
  const shield = equipment.find((item) => item.armorClass?.type === 'shield');
  const armorOptions = equipment.filter(
    (item) => item.armorClass?.type === 'armor',
  );
  const unarmoredBase = getUnarmoredClassBase(
    characterClass?.id,
    dexModifier,
    conModifier,
    wisModifier,
  );
  const bestArmor = armorOptions
    .map((item) => ({
      item,
      value: getArmorValue(item, dexModifier),
    }))
    .sort((left, right) => right.value - left.value)[0];
  const armorValue = Math.max(bestArmor?.value ?? 0, unarmoredBase.value);
  const shieldBonus = shield?.armorClass?.base ?? 0;

  return {
    armorLabel:
      bestArmor && bestArmor.value >= unarmoredBase.value
        ? bestArmor.item.name
        : unarmoredBase.label,
    shieldLabel: shield ? shield.name : null,
    value: armorValue + shieldBonus,
  };
}

export function deriveSpeedPreview(draft: CharacterBuilderDraft): number {
  return (
    getRuleSpeciesById(draft.speciesOrRace, draft.rulesProfileId)?.speed ?? 30
  );
}

export function deriveRuleDerivedPreview(
  draft: CharacterBuilderDraft,
): RuleDerivedPreview {
  const abilityScores = deriveAbilityScorePreview(draft);

  return {
    abilityScores,
    armorClass: deriveArmorClassPreview(draft),
    hitPoints: deriveHitPointPreview(draft),
    initiative: abilityScores.dex.modifier,
    proficiencyBonus: getProficiencyBonus(draft.level),
    speed: deriveSpeedPreview(draft),
  };
}

export function deriveProficiencyChoiceState(
  draft: CharacterBuilderDraft,
): ProficiencyChoiceState {
  const background = getRuleBackgroundById(
    draft.background,
    draft.rulesProfileId,
  );
  const characterClass = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const fixedSkills = uniqueValues(background?.skills ?? []);
  const skillOptions = (characterClass?.skillChoices.from ?? []).filter(
    (skill) => !fixedSkills.includes(skill),
  );
  const selectedSkillChoices = draft.builderSelections.skills
    .filter((skill) => skillOptions.includes(skill))
    .slice(0, characterClass?.skillChoices.choose ?? 0);
  const fixedLanguages: string[] = ['Common'];
  const languageOptions: string[] = standardLanguages.filter(
    (language) => !fixedLanguages.includes(language),
  );
  const selectedLanguages = draft.builderSelections.languages
    .filter((language) => languageOptions.includes(language))
    .slice(0, 2);
  const fixedTools = uniqueValues([
    ...(background?.toolProficiencies ?? []),
    ...(characterClass?.toolProficiencies ?? []),
  ]);
  const toolOptions = uniqueValues([
    ...(background?.toolChoice?.from ?? []),
    ...(characterClass?.toolChoices?.from ?? []),
  ]).filter((tool) => !fixedTools.includes(tool));
  const toolChoiceLimit =
    (background?.toolChoice?.choose ?? 0) +
    (characterClass?.toolChoices?.choose ?? 0);
  const selectedToolChoices = draft.builderSelections.tools
    .filter((tool) => toolOptions.includes(tool))
    .slice(0, toolChoiceLimit);

  return {
    fixedLanguages,
    fixedSkills,
    fixedTools,
    languageChoiceLimit: 2,
    languageOptions,
    savingThrows: characterClass?.savingThrowProficiencies ?? [],
    selectedLanguages,
    selectedSkillChoices,
    selectedToolChoices,
    skillChoiceLimit: characterClass?.skillChoices.choose ?? 0,
    skillOptions,
    toolChoiceLimit,
    toolOptions,
  };
}

export function getAvailableSpellsForClass(
  classId: string,
  profileId?: string,
): RuleSpell[] {
  const characterClass = getRuleClassById(classId, profileId);
  const spellcasting = characterClass?.spellcasting;

  if (!spellcasting) {
    return [];
  }

  return rulesSpells.filter(
    (spell) =>
      spell.classes.includes(classId) &&
      spell.level <= spellcasting.maxSpellLevel,
  );
}

export function getSpellSchoolsForClass(
  classId: string,
  profileId?: string,
): string[] {
  return uniqueValues(
    getAvailableSpellsForClass(classId, profileId).map((spell) => spell.school),
  ).sort((left, right) => left.localeCompare(right));
}

export function deriveEquipmentSuggestions(
  draft: CharacterBuilderDraft,
): string[] {
  const characterClass = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const background = getRuleBackgroundById(
    draft.background,
    draft.rulesProfileId,
  );

  return uniqueValues([
    ...(characterClass?.equipment ?? []),
    ...(background?.equipment ?? []),
  ]);
}

export function deriveDefaultBuilderSelections(
  draft: CharacterBuilderDraft,
): BuilderSelections {
  const proficiencyState = deriveProficiencyChoiceState(draft);
  const spells = getAvailableSpellsForClass(
    draft.className,
    draft.rulesProfileId,
  );
  const characterClass = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const spellcasting = characterClass?.spellcasting;
  const cantripOptions = spells
    .filter((spell) => spell.level === 0)
    .map((spell) => spell.name);
  const leveledSpellOptions = spells
    .filter((spell) => spell.level > 0)
    .map((spell) => spell.name);
  const selectedCantrips = chooseWithExisting({
    existing: draft.builderSelections.cantrips,
    fallback: spellcasting?.recommendedCantrips ?? [],
    limit: spellcasting?.cantripsKnown ?? 0,
    options: cantripOptions,
  });
  const selectedSpells = chooseWithExisting({
    existing: draft.builderSelections.spells,
    fallback: spellcasting?.recommendedSpells ?? [],
    limit: spellcasting?.preparedSpells ?? 0,
    options: leveledSpellOptions,
  });
  const selectedLanguages = chooseWithExisting({
    existing: draft.builderSelections.languages.filter(
      (language) => language !== 'Common',
    ),
    fallback: [
      ...(speciesLanguageHints[draft.speciesOrRace] ?? []),
      'Elvish',
      'Draconic',
      'Dwarvish',
      'Giant',
    ],
    limit: proficiencyState.languageChoiceLimit,
    options: proficiencyState.languageOptions,
  });
  const selectedSkillChoices = chooseWithExisting({
    existing: draft.builderSelections.skills,
    fallback: proficiencyState.skillOptions,
    limit: proficiencyState.skillChoiceLimit,
    options: proficiencyState.skillOptions,
  });
  const selectedToolChoices = chooseWithExisting({
    existing: draft.builderSelections.tools,
    fallback: proficiencyState.toolOptions,
    limit: proficiencyState.toolChoiceLimit,
    options: proficiencyState.toolOptions,
  });

  return sanitizeRuleSelections({
    ...draft,
    builderSelections: {
      cantrips: selectedCantrips,
      equipment: deriveEquipmentSuggestions(draft),
      languages: [...proficiencyState.fixedLanguages, ...selectedLanguages],
      skills: [...proficiencyState.fixedSkills, ...selectedSkillChoices],
      spells: selectedSpells,
      tools: [...proficiencyState.fixedTools, ...selectedToolChoices],
    },
  }).builderSelections;
}

export function sanitizeRuleSelections(
  draft: CharacterBuilderDraft,
): CharacterBuilderDraft {
  const profile = getRuleProfileById(draft.rulesProfileId);
  const speciesOrRace = normalizeProfileChoice(
    draft.speciesOrRace,
    profile.availableSpeciesIds,
  );
  const className = normalizeProfileChoice(
    draft.className,
    profile.availableClassIds,
  );
  const background = normalizeProfileChoice(
    draft.background,
    profile.availableBackgroundIds,
  );
  const method = normalizeAbilityScoreMethod(draft.abilityScoreMethod, profile);
  const profileDraft = {
    ...draft,
    abilityScoreMethod: method,
    background,
    className,
    rulesProfileId: profile.id,
    speciesOrRace,
  };
  const proficiencyState = deriveProficiencyChoiceState(profileDraft);
  const spellcasting = getRuleClassById(
    profileDraft.className,
    profile.id,
  )?.spellcasting;
  const availableSpells = getAvailableSpellsForClass(
    profileDraft.className,
    profile.id,
  );
  const cantripOptions = availableSpells
    .filter((spell) => spell.level === 0)
    .map((spell) => spell.name);
  const leveledSpellOptions = availableSpells
    .filter((spell) => spell.level > 0)
    .map((spell) => spell.name);
  const equipmentOptions = new Set(
    rulesEquipment.map((equipment) => equipment.name),
  );

  return {
    ...profileDraft,
    abilities: sanitizeAbilityScoresForMethod(
      profileDraft.abilities,
      profile,
      method,
    ),
    builderSelections: {
      cantrips: uniqueValues(
        profileDraft.builderSelections.cantrips.filter((cantrip) =>
          cantripOptions.includes(cantrip),
        ),
      ).slice(0, spellcasting?.cantripsKnown ?? 0),
      equipment: uniqueValues(
        profileDraft.builderSelections.equipment.filter((equipment) =>
          equipmentOptions.has(equipment),
        ),
      ),
      languages: uniqueValues([
        ...proficiencyState.fixedLanguages,
        ...profileDraft.builderSelections.languages
          .filter((language) =>
            proficiencyState.languageOptions.includes(language),
          )
          .slice(0, proficiencyState.languageChoiceLimit),
      ]),
      skills: uniqueValues([
        ...proficiencyState.fixedSkills,
        ...profileDraft.builderSelections.skills
          .filter((skill) => proficiencyState.skillOptions.includes(skill))
          .slice(0, proficiencyState.skillChoiceLimit),
      ]),
      spells: uniqueValues(
        profileDraft.builderSelections.spells.filter((spell) =>
          leveledSpellOptions.includes(spell),
        ),
      ).slice(0, spellcasting?.preparedSpells ?? 0),
      tools: uniqueValues([
        ...proficiencyState.fixedTools,
        ...profileDraft.builderSelections.tools
          .filter((tool) => proficiencyState.toolOptions.includes(tool))
          .slice(0, proficiencyState.toolChoiceLimit),
      ]),
    },
  };
}

export function deriveCharacterRuleReviewSummary(
  draft: CharacterBuilderDraft,
): CharacterRuleReviewSummary {
  const preview = deriveRuleDerivedPreview(draft);
  const proficiencyState = deriveProficiencyChoiceState(draft);

  return {
    armorClass: preview.armorClass.value,
    background:
      getRuleBackgroundById(draft.background, draft.rulesProfileId)
        ?.displayName ?? 'Unchosen Background',
    characterClass:
      getRuleClassById(draft.className, draft.rulesProfileId)?.displayName ??
      'Unchosen Class',
    equipment: draft.builderSelections.equipment,
    hitPoints: preview.hitPoints.value,
    initiative: preview.initiative,
    languages: uniqueValues([
      ...proficiencyState.fixedLanguages,
      ...proficiencyState.selectedLanguages,
    ]),
    proficiencyBonus: preview.proficiencyBonus,
    savingThrows: proficiencyState.savingThrows,
    skills: uniqueValues([
      ...proficiencyState.fixedSkills,
      ...proficiencyState.selectedSkillChoices,
    ]),
    species:
      getRuleSpeciesById(draft.speciesOrRace, draft.rulesProfileId)
        ?.displayName ?? 'Unchosen Species',
    speed: preview.speed,
    spells: {
      cantrips: draft.builderSelections.cantrips,
      leveled: draft.builderSelections.spells,
    },
    tools: uniqueValues([
      ...proficiencyState.fixedTools,
      ...proficiencyState.selectedToolChoices,
    ]),
  };
}

export function toggleRuleSelection(
  values: string[],
  value: string,
  maxSelected: number,
): string[] {
  if (values.includes(value)) {
    return values.filter((candidate) => candidate !== value);
  }

  if (maxSelected <= 0 || values.length >= maxSelected) {
    return values;
  }

  return [...values, value];
}

function chooseWithExisting({
  existing,
  fallback,
  limit,
  options,
}: {
  existing: string[];
  fallback: string[];
  limit: number;
  options: string[];
}): string[] {
  if (limit <= 0) {
    return [];
  }

  return uniqueValues([
    ...existing.filter((value) => options.includes(value)),
    ...fallback.filter((value) => options.includes(value)),
    ...options,
  ]).slice(0, limit);
}

function normalizeProfileChoice(value: string, allowed: string[]): string {
  if (allowed.includes(value)) {
    return value;
  }

  return allowed[0] ?? value;
}

function normalizeAbilityScoreMethod(
  method: AbilityScoreMethod | undefined,
  profile: CharacterRulesProfile,
): AbilityScoreMethod {
  if (method && profile.allowedAbilityScoreMethods.includes(method)) {
    return method;
  }

  return profile.defaultAbilityScoreMethod;
}

function getAbilityScoreBounds(
  profile: CharacterRulesProfile,
  method: AbilityScoreMethod,
): {
  max: number;
  min: number;
} {
  if (method === 'manual') {
    return {
      max: profile.abilityScoreRules.manualMax,
      min: profile.abilityScoreRules.manualMin,
    };
  }

  return {
    max: profile.abilityScoreRules.pointBuyMax,
    min: profile.abilityScoreRules.pointBuyMin,
  };
}

function sanitizeAbilityScoresForMethod(
  abilities: Record<AbilityKey, number>,
  profile: CharacterRulesProfile,
  method: AbilityScoreMethod,
): Record<AbilityKey, number> {
  const bounds = getAbilityScoreBounds(profile, method);

  return abilityKeys.reduce<Record<AbilityKey, number>>(
    (next, ability) => {
      next[ability] = Math.min(
        bounds.max,
        Math.max(bounds.min, Math.trunc(abilities[ability] ?? 10)),
      );
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
}

function assignStandardArrayByPriority(
  profile: CharacterRulesProfile,
  draft: CharacterBuilderDraft,
): Record<AbilityKey, number> {
  const standardArray = [...profile.abilityScoreRules.standardArray].sort(
    (left, right) => right - left,
  );
  const characterClass = getRuleClassById(draft.className, profile.id);
  const priorities = uniqueValues<AbilityKey>([
    ...(characterClass?.primaryAbilities ?? []),
    'con',
    'dex',
    'wis',
    'int',
    'str',
    'cha',
  ]);
  const next = { ...defaultAbilityScores };

  priorities.forEach((ability, index) => {
    next[ability] = standardArray[index] ?? 10;
  });

  return next;
}

function validateAbilityScores(
  draft: CharacterBuilderDraft,
): CharacterBuilderValidationIssue[] {
  const issues: CharacterBuilderValidationIssue[] = [];
  const profile = getRuleProfileById(draft.rulesProfileId);
  const method = normalizeAbilityScoreMethod(draft.abilityScoreMethod, profile);
  const bounds = getAbilityScoreBounds(profile, method);
  const preview = deriveAbilityScorePreview(draft);

  if (!profile.allowedAbilityScoreMethods.includes(method)) {
    issues.push({
      message: `${getAbilityScoreMethodLabel(method)} is not available for ${profile.displayName}.`,
      severity: 'error',
      step: 'ability-scores',
    });
  }

  for (const ability of abilityKeys) {
    const base = draft.abilities[ability];
    const final = preview[ability].final;

    if (base < bounds.min || base > bounds.max) {
      issues.push({
        message: `${ability.toUpperCase()} base score must be ${bounds.min}-${bounds.max} for ${getAbilityScoreMethodLabel(method)}.`,
        severity: 'error',
        step: 'ability-scores',
      });
    }

    if (final > profile.abilityScoreRules.finalScoreCap) {
      issues.push({
        message: `${ability.toUpperCase()} final score ${final} exceeds the ${profile.abilityScoreRules.finalScoreCap} cap for ${profile.displayName}.`,
        severity: 'error',
        step: 'ability-scores',
      });
    }
  }

  if (method === 'standard-array') {
    const expected = [...profile.abilityScoreRules.standardArray].sort(
      (left, right) => left - right,
    );
    const actual = abilityKeys
      .map((ability) => draft.abilities[ability])
      .sort((left, right) => left - right);

    if (expected.join(',') !== actual.join(',')) {
      issues.push({
        message: `Standard Array must use exactly ${profile.abilityScoreRules.standardArray.join(', ')} before bonuses.`,
        severity: 'error',
        step: 'ability-scores',
      });
    }
  }

  if (method === 'point-buy') {
    const cost = getPointBuyCost(draft.abilities);

    if (cost > profile.abilityScoreRules.pointBuyBudget) {
      issues.push({
        message: `Point Buy spends ${cost}/${profile.abilityScoreRules.pointBuyBudget} points.`,
        severity: 'error',
        step: 'ability-scores',
      });
    }
  }

  return issues;
}

function getPointBuyCost(abilities: Record<AbilityKey, number>): number {
  const costs: Record<number, number> = {
    8: 0,
    9: 1,
    10: 2,
    11: 3,
    12: 4,
    13: 5,
    14: 7,
    15: 9,
  };

  return abilityKeys.reduce((total, ability) => {
    const score = abilities[ability];
    return total + (costs[score] ?? Number.POSITIVE_INFINITY);
  }, 0);
}

function emptyAbilityPreview(ability: AbilityKey): AbilityScorePreview {
  return {
    ability,
    base: 10,
    final: 10,
    modifier: 0,
    rulesBonus: 0,
    rulesBonusLabel: 'rules',
  };
}

function getArmorValue(equipment: RuleEquipment, dexModifier: number): number {
  if (!equipment.armorClass || equipment.armorClass.type !== 'armor') {
    return 0;
  }

  switch (equipment.armorClass.dexModifier) {
    case 'full':
      return equipment.armorClass.base + dexModifier;
    case 'max2':
      return equipment.armorClass.base + Math.min(2, dexModifier);
    case 'none':
      return equipment.armorClass.base;
  }
}

function getUnarmoredClassBase(
  classId: string | undefined,
  dexModifier: number,
  conModifier: number,
  wisModifier: number,
): {
  label: string;
  value: number;
} {
  if (classId === 'Barbarian') {
    return {
      label: 'Unarmored Defense',
      value: 10 + dexModifier + conModifier,
    };
  }

  if (classId === 'Monk') {
    return {
      label: 'Unarmored Defense',
      value: 10 + dexModifier + wisModifier,
    };
  }

  return {
    label: 'Unarmored',
    value: 10 + dexModifier,
  };
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
