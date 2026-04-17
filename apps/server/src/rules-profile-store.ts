import type { SessionErrorCode } from '@dnd/protocol';
import type { RulesProfile, RulesProfileId } from '@dnd/shared';

export const DEFAULT_RULES_PROFILE_ID = 'dnd5e-2024-core';

export const BUILT_IN_RULES_PROFILES: RulesProfile[] = [
  {
    id: 'dnd5e-2014-core',
    baseRuleset: 'dnd5e-2014',
    strictness: 'assistive_raw',
    optionalRules: [],
    houseRules: {},
    allowedSources: ['phb-2014'],
  },
  {
    id: DEFAULT_RULES_PROFILE_ID,
    baseRuleset: 'dnd5e-2024',
    strictness: 'assistive_raw',
    optionalRules: [],
    houseRules: {},
    allowedSources: ['phb-2024'],
  },
];

export class RulesProfileStoreError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RulesProfileStoreError';
  }
}

export class InMemoryRulesProfileStore {
  private readonly profiles: ReadonlyMap<RulesProfileId, RulesProfile>;

  constructor(profiles = BUILT_IN_RULES_PROFILES) {
    this.profiles = new Map(
      profiles.map((profile) => [profile.id, structuredClone(profile)]),
    );
  }

  listRulesProfiles(): RulesProfile[] {
    return Array.from(this.profiles.values(), (profile) =>
      structuredClone(profile),
    );
  }

  getRulesProfile(rulesProfileId: RulesProfileId): RulesProfile {
    const rulesProfile = this.profiles.get(rulesProfileId);

    if (!rulesProfile) {
      throw new RulesProfileStoreError(
        'rules_profile_not_found',
        `Rules profile "${rulesProfileId}" does not exist.`,
      );
    }

    return structuredClone(rulesProfile);
  }
}
