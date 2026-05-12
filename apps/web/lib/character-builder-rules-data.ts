import type { CharacterBuilderAssetKey } from './character-builder-assets';
import type { AbilityKey } from './character-builder-data';

export type RuleSourceInfo = {
  attribution: string;
  license: string;
  name: string;
  url: string;
};

export type AbilityScoreMethod = 'manual' | 'point-buy' | 'standard-array';

export type AbilityBonusSource = 'background' | 'species';

export type RulesProfileStatus = 'current' | 'legacy' | 'optional';

export type RulesProfileSourceType = 'basic' | 'compatible' | 'srd';

export type AbilityScoreRules = {
  finalScoreCap: number;
  manualMax: number;
  manualMin: number;
  pointBuyBudget: number;
  pointBuyMax: number;
  pointBuyMin: number;
  standardArray: number[];
};

export type CharacterRulesProfile = {
  abilityBonusSource: AbilityBonusSource;
  abilityScoreRules: AbilityScoreRules;
  allowedAbilityScoreMethods: AbilityScoreMethod[];
  availableBackgroundIds: string[];
  availableClassIds: string[];
  availableSpeciesIds: string[];
  defaultAbilityScoreMethod: AbilityScoreMethod;
  displayName: string;
  id: string;
  license: string;
  notes: string;
  sourceName: string;
  sourceType: RulesProfileSourceType;
  sourceUrl: string;
  speciesAbilityBonuses?: Record<string, Partial<Record<AbilityKey, number>>>;
  speciesLabel: 'Race' | 'Species';
  status: RulesProfileStatus;
  version: string;
  year: string;
};

export type RuleTrait = {
  label: string;
  summary: string;
};

export type RuleChoice = {
  choose: number;
  from: string[];
  label: string;
};

export type RuleSpecies = {
  assetKey?: CharacterBuilderAssetKey;
  builderChoices?: RuleChoice[];
  creatureType: string;
  displayName: string;
  hpBonusPerLevel?: number;
  id: string;
  shortSummary: string;
  size: string;
  speed: number;
  traits: RuleTrait[];
};

export type RuleSpellcasting = {
  ability: AbilityKey;
  cantripsKnown: number;
  focus: string;
  kind: 'full' | 'half' | 'pact';
  maxSpellLevel: number;
  preparedSpells: number;
  recommendedCantrips: string[];
  recommendedSpells: string[];
  spellSlotsLevel1: number;
};

export type RuleClass = {
  armorProficiencies: string[];
  assetKey?: CharacterBuilderAssetKey;
  difficulty: string;
  displayName: string;
  equipment: string[];
  hitDie: number;
  id: string;
  level1Features: string[];
  primaryAbilities: AbilityKey[];
  role: string;
  savingThrowProficiencies: AbilityKey[];
  shortSummary: string;
  skillChoices: RuleChoice;
  spellcasting?: RuleSpellcasting;
  toolChoices?: RuleChoice;
  toolProficiencies: string[];
  weaponProficiencies: string[];
};

export type RuleBackground = {
  abilityScoreOptions: AbilityKey[];
  assetKey?: CharacterBuilderAssetKey;
  displayName: string;
  equipment: string[];
  id: string;
  originFeat: string;
  originFeatSpellList?: string;
  shortSummary: string;
  skills: string[];
  toolChoice?: RuleChoice;
  toolProficiencies: string[];
};

export type RuleEquipment = {
  armorClass?: {
    base: number;
    dexModifier: 'full' | 'max2' | 'none';
    type: 'armor' | 'shield';
  };
  category: 'adventuring gear' | 'armor' | 'focus' | 'tool' | 'weapon';
  name: string;
  source: 'background' | 'class' | 'shared';
};

export type RuleSpell = {
  classes: string[];
  level: number;
  name: string;
  school: string;
  special: string[];
};

export const rulesSourceInfo: RuleSourceInfo = {
  attribution:
    'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  license: 'Creative Commons Attribution 4.0 International (CC-BY-4.0)',
  name: 'Dungeons & Dragons System Reference Document 5.2.1',
  url: 'https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf',
};

export const defaultRulesProfileId = 'dnd-2025-srd-5-2-1';

const currentSpeciesIds = [
  'Dragonborn',
  'Dwarf',
  'Elf',
  'Gnome',
  'Goliath',
  'Halfling',
  'Human',
  'Orc',
  'Tiefling',
];

const currentClassIds = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard',
];

const srdBackgroundIds = ['Acolyte', 'Criminal', 'Sage', 'Soldier'];

const legacyBasicSpeciesIds = ['Dwarf', 'Elf', 'Halfling', 'Human'];

const legacyBasicClassIds = ['Cleric', 'Fighter', 'Rogue', 'Wizard'];

const legacySrdSpeciesIds = [
  'Dragonborn',
  'Dwarf',
  'Elf',
  'Gnome',
  'Halfling',
  'Human',
  'Tiefling',
];

const sharedAbilityScoreRules: AbilityScoreRules = {
  finalScoreCap: 20,
  manualMax: 18,
  manualMin: 3,
  pointBuyBudget: 27,
  pointBuyMax: 15,
  pointBuyMin: 8,
  standardArray: [15, 14, 13, 12, 10, 8],
};

const legacySpeciesAbilityBonuses: CharacterRulesProfile['speciesAbilityBonuses'] =
  {
    Dragonborn: { cha: 1, str: 2 },
    Dwarf: { con: 2 },
    Elf: { dex: 2 },
    Gnome: { int: 2 },
    Halfling: { dex: 2 },
    Human: { cha: 1, con: 1, dex: 1, int: 1, str: 1, wis: 1 },
    Tiefling: { cha: 2, int: 1 },
  };

export const rulesProfiles: CharacterRulesProfile[] = [
  {
    abilityBonusSource: 'background',
    abilityScoreRules: sharedAbilityScoreRules,
    allowedAbilityScoreMethods: ['standard-array', 'point-buy', 'manual'],
    availableBackgroundIds: srdBackgroundIds,
    availableClassIds: currentClassIds,
    availableSpeciesIds: currentSpeciesIds,
    defaultAbilityScoreMethod: 'standard-array',
    displayName: 'D&D SRD 5.2.1',
    id: defaultRulesProfileId,
    license: 'Creative Commons Attribution 4.0 International',
    notes:
      'Current SRD-compatible profile. Uses local SRD 5.2.1 metadata and 2024-style background ability boosts.',
    sourceName: 'System Reference Document 5.2.1',
    sourceType: 'srd',
    sourceUrl: 'https://www.dndbeyond.com/srd',
    speciesLabel: 'Species',
    status: 'current',
    version: '5.2.1',
    year: '2025',
  },
  {
    abilityBonusSource: 'background',
    abilityScoreRules: sharedAbilityScoreRules,
    allowedAbilityScoreMethods: ['standard-array', 'point-buy', 'manual'],
    availableBackgroundIds: srdBackgroundIds,
    availableClassIds: currentClassIds,
    availableSpeciesIds: currentSpeciesIds,
    defaultAbilityScoreMethod: 'standard-array',
    displayName: 'D&D Free Rules 2024',
    id: 'dnd-2024-free-rules',
    license: 'Official public rules page; metadata only in this scaffold',
    notes:
      'Current public Free Rules profile. Local data remains SRD-backed and intentionally incomplete for paid-book options.',
    sourceName: 'D&D Free Rules',
    sourceType: 'basic',
    sourceUrl: 'https://www.dndbeyond.com/sources/dnd/free-rules',
    speciesLabel: 'Species',
    status: 'current',
    version: '2024 Free Rules',
    year: '2024',
  },
  {
    abilityBonusSource: 'species',
    abilityScoreRules: sharedAbilityScoreRules,
    allowedAbilityScoreMethods: ['standard-array', 'point-buy', 'manual'],
    availableBackgroundIds: srdBackgroundIds,
    availableClassIds: currentClassIds,
    availableSpeciesIds: legacySrdSpeciesIds,
    defaultAbilityScoreMethod: 'standard-array',
    displayName: 'D&D SRD 5.1',
    id: 'dnd-2014-srd-5-1',
    license: 'Creative Commons Attribution 4.0 International',
    notes:
      'Legacy SRD-compatible profile. Uses race-based ability boosts and omits local 2024-only species.',
    sourceName: 'System Reference Document 5.1',
    sourceType: 'srd',
    sourceUrl: 'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf',
    speciesAbilityBonuses: legacySpeciesAbilityBonuses,
    speciesLabel: 'Race',
    status: 'legacy',
    version: '5.1',
    year: '2014 / CC 2023',
  },
  {
    abilityBonusSource: 'species',
    abilityScoreRules: sharedAbilityScoreRules,
    allowedAbilityScoreMethods: ['standard-array', 'point-buy', 'manual'],
    availableBackgroundIds: srdBackgroundIds,
    availableClassIds: legacyBasicClassIds,
    availableSpeciesIds: legacyBasicSpeciesIds,
    defaultAbilityScoreMethod: 'standard-array',
    displayName: 'D&D Basic Rules 2014',
    id: 'dnd-2014-basic-rules',
    license: 'Official public Basic Rules page; metadata only in this scaffold',
    notes:
      'Legacy basic profile. Narrows local choices to the classic public starter race/class set.',
    sourceName: 'Basic Rules 2014',
    sourceType: 'basic',
    sourceUrl: 'https://www.dndbeyond.com/sources/dnd/basic-rules-2014',
    speciesAbilityBonuses: legacySpeciesAbilityBonuses,
    speciesLabel: 'Race',
    status: 'legacy',
    version: '2014 Basic Rules',
    year: '2014',
  },
  {
    abilityBonusSource: 'species',
    abilityScoreRules: sharedAbilityScoreRules,
    allowedAbilityScoreMethods: ['standard-array', 'point-buy', 'manual'],
    availableBackgroundIds: srdBackgroundIds,
    availableClassIds: currentClassIds,
    availableSpeciesIds: legacySrdSpeciesIds,
    defaultAbilityScoreMethod: 'manual',
    displayName: '5E Compatible / Table Profile',
    id: '5e-compatible-table-profile',
    license: 'Table-defined compatible content; no third-party text included',
    notes:
      'Optional compatibility profile for local table material. It uses legacy-style race boosts and manual score entry by default.',
    sourceName: '5E-compatible local table source',
    sourceType: 'compatible',
    sourceUrl: 'docs/character-builder-rules-source-plan.md',
    speciesAbilityBonuses: legacySpeciesAbilityBonuses,
    speciesLabel: 'Race',
    status: 'optional',
    version: 'Table-defined',
    year: 'Optional',
  },
];

export const rulesSkills = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival',
] as const;

export const standardLanguages = [
  'Common',
  'Common Sign Language',
  'Draconic',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
] as const;

export const rareLanguages = [
  'Abyssal',
  'Celestial',
  'Deep Speech',
  'Druidic',
  'Infernal',
  'Primordial',
  'Sylvan',
  "Thieves' Cant",
  'Undercommon',
] as const;

const allSkillChoice: string[] = [...rulesSkills];

const musicalInstrumentChoices = [
  'Musical Instrument',
  'Drum',
  'Flute',
  'Lute',
  'Lyre',
  'Horn',
];

const artisanToolChoices = [
  "Artisan's Tools",
  "Calligrapher's Supplies",
  "Carpenter's Tools",
  "Cook's Utensils",
  "Painter's Supplies",
  "Smith's Tools",
];

const gamingSetChoices = [
  'Gaming Set',
  'Dice Set',
  'Dragonchess Set',
  'Playing Card Set',
  'Three-Dragon Ante Set',
];

export const rulesSpecies: RuleSpecies[] = [
  {
    assetKey: 'species.dragonborn',
    builderChoices: [
      {
        choose: 1,
        from: [
          'Black / Acid',
          'Blue / Lightning',
          'Brass / Fire',
          'Bronze / Lightning',
          'Copper / Acid',
          'Gold / Fire',
          'Green / Poison',
          'Red / Fire',
          'Silver / Cold',
          'White / Cold',
        ],
        label: 'Draconic Ancestry',
      },
    ],
    creatureType: 'Humanoid',
    displayName: 'Dragonborn',
    id: 'Dragonborn',
    shortSummary:
      'Draconic heirs with a breath weapon, energy resistance, and darkvision.',
    size: 'Medium',
    speed: 30,
    traits: [
      {
        label: 'Draconic Ancestry',
        summary: 'Choose an ancestry that sets breath and resistance type.',
      },
      {
        label: 'Breath Weapon',
        summary: 'Replaces one attack with a cone or line damage burst.',
      },
      {
        label: 'Damage Resistance',
        summary: 'Resistance matches the chosen ancestry damage type.',
      },
      { label: 'Darkvision', summary: 'Sees in darkness out to 60 feet.' },
    ],
  },
  {
    assetKey: 'species.dwarf',
    creatureType: 'Humanoid',
    displayName: 'Dwarf',
    hpBonusPerLevel: 1,
    id: 'Dwarf',
    shortSummary:
      'Stout folk with deep sight, poison resilience, extra toughness, and stone sense.',
    size: 'Medium',
    speed: 30,
    traits: [
      { label: 'Darkvision', summary: 'Sees in darkness out to 120 feet.' },
      {
        label: 'Dwarven Resilience',
        summary: 'Resists poison damage and poison-related saves.',
      },
      {
        label: 'Dwarven Toughness',
        summary: 'Adds 1 hit point per character level in this preview.',
      },
      {
        label: 'Stonecunning',
        summary: 'Temporary tremorsense while touching stone.',
      },
    ],
  },
  {
    assetKey: 'species.elf',
    builderChoices: [
      {
        choose: 1,
        from: ['Drow', 'High Elf', 'Wood Elf'],
        label: 'Elven Lineage',
      },
      {
        choose: 1,
        from: ['Insight', 'Perception', 'Survival'],
        label: 'Keen Senses Skill',
      },
    ],
    creatureType: 'Humanoid',
    displayName: 'Elf',
    id: 'Elf',
    shortSummary:
      'Fey-touched people with darkvision, a lineage cantrip, keen senses, and trance.',
    size: 'Medium',
    speed: 30,
    traits: [
      { label: 'Darkvision', summary: 'Sees in darkness out to 60 feet.' },
      {
        label: 'Elven Lineage',
        summary: 'Lineage grants a level 1 magical benefit.',
      },
      {
        label: 'Fey Ancestry',
        summary: 'Advantage against the Charmed condition.',
      },
      {
        label: 'Keen Senses',
        summary: 'Choose Insight, Perception, or Survival proficiency.',
      },
      { label: 'Trance', summary: 'Long rest can be completed in 4 hours.' },
    ],
  },
  {
    assetKey: 'species.gnome',
    builderChoices: [
      {
        choose: 1,
        from: ['Forest Gnome', 'Rock Gnome'],
        label: 'Gnomish Lineage',
      },
    ],
    creatureType: 'Humanoid',
    displayName: 'Gnome',
    id: 'Gnome',
    shortSummary:
      'Small, clever folk with darkvision, mental save resilience, and magical lineage.',
    size: 'Small',
    speed: 30,
    traits: [
      { label: 'Darkvision', summary: 'Sees in darkness out to 60 feet.' },
      {
        label: 'Gnomish Cunning',
        summary: 'Advantage on Intelligence, Wisdom, and Charisma saves.',
      },
      {
        label: 'Gnomish Lineage',
        summary: 'Forest or Rock lineage grants cantrips or minor magic.',
      },
    ],
  },
  {
    assetKey: 'species.goliath',
    builderChoices: [
      {
        choose: 1,
        from: [
          'Cloud Giant',
          'Fire Giant',
          'Frost Giant',
          'Hill Giant',
          'Stone Giant',
          'Storm Giant',
        ],
        label: 'Giant Ancestry',
      },
    ],
    creatureType: 'Humanoid',
    displayName: 'Goliath',
    id: 'Goliath',
    shortSummary:
      'Large-framed giant descendants with a 35-foot speed and ancestry boons.',
    size: 'Medium',
    speed: 35,
    traits: [
      {
        label: 'Giant Ancestry',
        summary: 'Choose one limited-use giant ancestry benefit.',
      },
      {
        label: 'Large Form',
        summary:
          'Higher-level size increase trait noted for future automation.',
      },
      {
        label: 'Powerful Build',
        summary: 'Counts larger for carrying and helps end grapples.',
      },
    ],
  },
  {
    assetKey: 'species.halfling',
    creatureType: 'Humanoid',
    displayName: 'Halfling',
    id: 'Halfling',
    shortSummary:
      'Small, lucky folk who resist fear and move easily around larger creatures.',
    size: 'Small',
    speed: 30,
    traits: [
      {
        label: 'Brave',
        summary: 'Advantage against the Frightened condition.',
      },
      {
        label: 'Halfling Nimbleness',
        summary: 'Moves through spaces of larger creatures.',
      },
      { label: 'Luck', summary: 'Rerolls a 1 on a d20 test.' },
      {
        label: 'Naturally Stealthy',
        summary: 'Can hide when obscured by a larger creature.',
      },
    ],
  },
  {
    assetKey: 'species.human',
    builderChoices: [
      { choose: 1, from: ['Small', 'Medium'], label: 'Size' },
      { choose: 1, from: allSkillChoice, label: 'Skillful Skill' },
    ],
    creatureType: 'Humanoid',
    displayName: 'Human',
    id: 'Human',
    shortSummary:
      'Adaptable adventurers with inspiration, one chosen skill, and an origin feat.',
    size: 'Small or Medium',
    speed: 30,
    traits: [
      {
        label: 'Resourceful',
        summary: 'Gains Heroic Inspiration after a long rest.',
      },
      { label: 'Skillful', summary: 'Choose one skill proficiency.' },
      {
        label: 'Versatile',
        summary: 'Choose an origin feat; Skilled is recommended.',
      },
    ],
  },
  {
    assetKey: 'species.orc',
    creatureType: 'Humanoid',
    displayName: 'Orc',
    id: 'Orc',
    shortSummary:
      'Relentless warriors with bonus-action bursts, deep sight, and endurance.',
    size: 'Medium',
    speed: 30,
    traits: [
      {
        label: 'Adrenaline Rush',
        summary: 'Bonus-action Dash with temporary hit points.',
      },
      { label: 'Darkvision', summary: 'Sees in darkness out to 120 feet.' },
      {
        label: 'Relentless Endurance',
        summary: 'Can drop to 1 HP instead of 0 once per long rest.',
      },
    ],
  },
  {
    assetKey: 'species.tiefling',
    builderChoices: [
      {
        choose: 1,
        from: ['Abyssal', 'Chthonic', 'Infernal'],
        label: 'Fiendish Legacy',
      },
    ],
    creatureType: 'Humanoid',
    displayName: 'Tiefling',
    id: 'Tiefling',
    shortSummary:
      'Planar-touched folk with darkvision, a fiendish legacy, and Thaumaturgy.',
    size: 'Small or Medium',
    speed: 30,
    traits: [
      { label: 'Darkvision', summary: 'Sees in darkness out to 60 feet.' },
      {
        label: 'Fiendish Legacy',
        summary: 'Choose a legacy that grants resistance and spells.',
      },
      {
        label: 'Otherworldly Presence',
        summary: 'Knows the Thaumaturgy cantrip.',
      },
    ],
  },
];

export const rulesClasses: RuleClass[] = [
  {
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    assetKey: 'class.barbarian',
    difficulty: 'Beginner friendly',
    displayName: 'Barbarian',
    equipment: ['Greataxe', 'Handaxe', "Explorer's Pack"],
    hitDie: 12,
    id: 'Barbarian',
    level1Features: ['Rage', 'Unarmored Defense', 'Weapon Mastery'],
    primaryAbilities: ['str'],
    role: 'Primal Frontliner',
    savingThrowProficiencies: ['str', 'con'],
    shortSummary:
      'A resilient warrior whose rage turns raw force into battlefield pressure.',
    skillChoices: {
      choose: 2,
      from: [
        'Animal Handling',
        'Athletics',
        'Intimidation',
        'Nature',
        'Perception',
        'Survival',
      ],
      label: 'Barbarian Skills',
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  },
  {
    armorProficiencies: ['Light armor'],
    assetKey: 'class.bard',
    difficulty: 'Intermediate',
    displayName: 'Bard',
    equipment: [
      'Leather Armor',
      'Dagger',
      'Musical Instrument',
      "Entertainer's Pack",
    ],
    hitDie: 8,
    id: 'Bard',
    level1Features: ['Bardic Inspiration', 'Spellcasting'],
    primaryAbilities: ['cha'],
    role: 'Inspiring Support',
    savingThrowProficiencies: ['dex', 'cha'],
    shortSummary:
      'A skillful performer and spellcaster who supports allies with charm and lore.',
    skillChoices: {
      choose: 3,
      from: allSkillChoice,
      label: 'Bard Skills',
    },
    spellcasting: {
      ability: 'cha',
      cantripsKnown: 2,
      focus: 'Musical Instrument',
      kind: 'full',
      maxSpellLevel: 1,
      preparedSpells: 4,
      recommendedCantrips: ['Dancing Lights', 'Vicious Mockery'],
      recommendedSpells: [
        'Charm Person',
        'Color Spray',
        'Dissonant Whispers',
        'Healing Word',
      ],
      spellSlotsLevel1: 2,
    },
    toolChoices: {
      choose: 3,
      from: musicalInstrumentChoices,
      label: 'Musical Instruments',
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons'],
  },
  {
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    assetKey: 'class.cleric',
    difficulty: 'Beginner friendly',
    displayName: 'Cleric',
    equipment: [
      'Chain Shirt',
      'Shield',
      'Mace',
      'Holy Symbol',
      "Priest's Pack",
    ],
    hitDie: 8,
    id: 'Cleric',
    level1Features: ['Spellcasting', 'Divine Order'],
    primaryAbilities: ['wis'],
    role: 'Divine Support',
    savingThrowProficiencies: ['wis', 'cha'],
    shortSummary:
      'A divine spellcaster who blends protection, healing, and sacred power.',
    skillChoices: {
      choose: 2,
      from: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
      label: 'Cleric Skills',
    },
    spellcasting: {
      ability: 'wis',
      cantripsKnown: 3,
      focus: 'Holy Symbol',
      kind: 'full',
      maxSpellLevel: 1,
      preparedSpells: 4,
      recommendedCantrips: ['Guidance', 'Sacred Flame', 'Thaumaturgy'],
      recommendedSpells: [
        'Bless',
        'Cure Wounds',
        'Guiding Bolt',
        'Shield of Faith',
      ],
      spellSlotsLevel1: 2,
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons'],
  },
  {
    armorProficiencies: ['Light armor', 'Shields'],
    assetKey: 'class.druid',
    difficulty: 'Intermediate',
    displayName: 'Druid',
    equipment: [
      'Leather Armor',
      'Shield',
      'Sickle',
      'Druidic Focus',
      "Explorer's Pack",
      'Herbalism Kit',
    ],
    hitDie: 8,
    id: 'Druid',
    level1Features: ['Spellcasting', 'Druidic', 'Primal Order'],
    primaryAbilities: ['wis'],
    role: 'Primal Support',
    savingThrowProficiencies: ['int', 'wis'],
    shortSummary:
      'A nature spellcaster who channels primal forces and wilderness wisdom.',
    skillChoices: {
      choose: 2,
      from: [
        'Animal Handling',
        'Arcana',
        'Insight',
        'Medicine',
        'Nature',
        'Perception',
        'Religion',
        'Survival',
      ],
      label: 'Druid Skills',
    },
    spellcasting: {
      ability: 'wis',
      cantripsKnown: 2,
      focus: 'Druidic Focus',
      kind: 'full',
      maxSpellLevel: 1,
      preparedSpells: 4,
      recommendedCantrips: ['Druidcraft', 'Produce Flame'],
      recommendedSpells: [
        'Animal Friendship',
        'Cure Wounds',
        'Faerie Fire',
        'Thunderwave',
      ],
      spellSlotsLevel1: 2,
    },
    toolProficiencies: ['Herbalism Kit'],
    weaponProficiencies: ['Simple weapons'],
  },
  {
    armorProficiencies: [
      'Light armor',
      'Medium armor',
      'Heavy armor',
      'Shields',
    ],
    assetKey: 'class.fighter',
    difficulty: 'Beginner friendly',
    displayName: 'Fighter',
    equipment: [
      'Chain Mail',
      'Greatsword',
      'Flail',
      'Javelin',
      "Dungeoneer's Pack",
    ],
    hitDie: 10,
    id: 'Fighter',
    level1Features: ['Fighting Style', 'Second Wind', 'Weapon Mastery'],
    primaryAbilities: ['str', 'dex'],
    role: 'Martial Defender',
    savingThrowProficiencies: ['str', 'con'],
    shortSummary:
      'A trained combatant with broad weapon mastery and dependable durability.',
    skillChoices: {
      choose: 2,
      from: [
        'Acrobatics',
        'Animal Handling',
        'Athletics',
        'History',
        'Insight',
        'Intimidation',
        'Persuasion',
        'Perception',
        'Survival',
      ],
      label: 'Fighter Skills',
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  },
  {
    armorProficiencies: [],
    assetKey: 'class.monk',
    difficulty: 'Intermediate',
    displayName: 'Monk',
    equipment: ['Spear', 'Dagger', "Explorer's Pack"],
    hitDie: 8,
    id: 'Monk',
    level1Features: ['Martial Arts', 'Unarmored Defense'],
    primaryAbilities: ['dex', 'wis'],
    role: 'Mobile Striker',
    savingThrowProficiencies: ['str', 'dex'],
    shortSummary:
      'A disciplined martial artist who fights lightly armed and unarmored.',
    skillChoices: {
      choose: 2,
      from: [
        'Acrobatics',
        'Athletics',
        'History',
        'Insight',
        'Religion',
        'Stealth',
      ],
      label: 'Monk Skills',
    },
    toolChoices: {
      choose: 1,
      from: [...artisanToolChoices, ...musicalInstrumentChoices],
      label: 'Monk Tool',
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons', 'Light martial weapons'],
  },
  {
    armorProficiencies: [
      'Light armor',
      'Medium armor',
      'Heavy armor',
      'Shields',
    ],
    assetKey: 'class.paladin',
    difficulty: 'Intermediate',
    displayName: 'Paladin',
    equipment: [
      'Chain Mail',
      'Shield',
      'Longsword',
      'Javelin',
      'Holy Symbol',
      "Priest's Pack",
    ],
    hitDie: 10,
    id: 'Paladin',
    level1Features: ['Lay On Hands', 'Spellcasting', 'Weapon Mastery'],
    primaryAbilities: ['str', 'cha'],
    role: 'Holy Defender',
    savingThrowProficiencies: ['wis', 'cha'],
    shortSummary:
      'A sworn warrior whose martial training is reinforced by divine magic.',
    skillChoices: {
      choose: 2,
      from: [
        'Athletics',
        'Insight',
        'Intimidation',
        'Medicine',
        'Persuasion',
        'Religion',
      ],
      label: 'Paladin Skills',
    },
    spellcasting: {
      ability: 'cha',
      cantripsKnown: 0,
      focus: 'Holy Symbol',
      kind: 'half',
      maxSpellLevel: 1,
      preparedSpells: 2,
      recommendedCantrips: [],
      recommendedSpells: ['Heroism', 'Searing Smite'],
      spellSlotsLevel1: 2,
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  },
  {
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    assetKey: 'class.ranger',
    difficulty: 'Intermediate',
    displayName: 'Ranger',
    equipment: [
      'Studded Leather Armor',
      'Scimitar',
      'Shortsword',
      'Longbow',
      'Arrow',
      'Quiver',
      'Druidic Focus',
      "Explorer's Pack",
    ],
    hitDie: 10,
    id: 'Ranger',
    level1Features: ['Spellcasting', 'Favored Enemy', 'Weapon Mastery'],
    primaryAbilities: ['dex', 'wis'],
    role: 'Wilderness Striker',
    savingThrowProficiencies: ['str', 'dex'],
    shortSummary:
      'A martial explorer who blends tracking, weapons, and nature magic.',
    skillChoices: {
      choose: 3,
      from: [
        'Animal Handling',
        'Athletics',
        'Insight',
        'Investigation',
        'Nature',
        'Perception',
        'Stealth',
        'Survival',
      ],
      label: 'Ranger Skills',
    },
    spellcasting: {
      ability: 'wis',
      cantripsKnown: 0,
      focus: 'Druidic Focus',
      kind: 'half',
      maxSpellLevel: 1,
      preparedSpells: 2,
      recommendedCantrips: [],
      recommendedSpells: ['Cure Wounds', 'Ensnaring Strike'],
      spellSlotsLevel1: 2,
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  },
  {
    armorProficiencies: ['Light armor'],
    assetKey: 'class.rogue',
    difficulty: 'Beginner friendly',
    displayName: 'Rogue',
    equipment: [
      'Leather Armor',
      'Dagger',
      'Shortsword',
      'Shortbow',
      'Arrow',
      'Quiver',
      "Thieves' Tools",
      "Burglar's Pack",
    ],
    hitDie: 8,
    id: 'Rogue',
    level1Features: [
      'Expertise',
      'Sneak Attack',
      "Thieves' Cant",
      'Weapon Mastery',
    ],
    primaryAbilities: ['dex'],
    role: 'Agile Striker',
    savingThrowProficiencies: ['dex', 'int'],
    shortSummary:
      'A precise opportunist with broad skills, stealth, and careful strikes.',
    skillChoices: {
      choose: 4,
      from: [
        'Acrobatics',
        'Athletics',
        'Deception',
        'Insight',
        'Intimidation',
        'Investigation',
        'Perception',
        'Persuasion',
        'Sleight of Hand',
        'Stealth',
      ],
      label: 'Rogue Skills',
    },
    toolProficiencies: ["Thieves' Tools"],
    weaponProficiencies: ['Simple weapons', 'Finesse or Light martial weapons'],
  },
  {
    armorProficiencies: [],
    assetKey: 'class.sorcerer',
    difficulty: 'Advanced',
    displayName: 'Sorcerer',
    equipment: ['Spear', 'Dagger', 'Arcane Focus', "Dungeoneer's Pack"],
    hitDie: 6,
    id: 'Sorcerer',
    level1Features: ['Spellcasting', 'Innate Sorcery'],
    primaryAbilities: ['cha'],
    role: 'Innate Arcane Striker',
    savingThrowProficiencies: ['con', 'cha'],
    shortSummary:
      'An innate spellcaster whose magic flows from a supernatural origin.',
    skillChoices: {
      choose: 2,
      from: [
        'Arcana',
        'Deception',
        'Insight',
        'Intimidation',
        'Persuasion',
        'Religion',
      ],
      label: 'Sorcerer Skills',
    },
    spellcasting: {
      ability: 'cha',
      cantripsKnown: 4,
      focus: 'Arcane Focus',
      kind: 'full',
      maxSpellLevel: 1,
      preparedSpells: 2,
      recommendedCantrips: [
        'Light',
        'Prestidigitation',
        'Shocking Grasp',
        'Sorcerous Burst',
      ],
      recommendedSpells: ['Burning Hands', 'Detect Magic'],
      spellSlotsLevel1: 2,
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons'],
  },
  {
    armorProficiencies: ['Light armor'],
    assetKey: 'class.warlock',
    difficulty: 'Advanced',
    displayName: 'Warlock',
    equipment: [
      'Leather Armor',
      'Sickle',
      'Dagger',
      'Arcane Focus',
      'Book',
      "Scholar's Pack",
    ],
    hitDie: 8,
    id: 'Warlock',
    level1Features: ['Eldritch Invocations', 'Pact Magic'],
    primaryAbilities: ['cha'],
    role: 'Occult Striker',
    savingThrowProficiencies: ['wis', 'cha'],
    shortSummary:
      'A pact-bound spellcaster with focused magic and eldritch invocations.',
    skillChoices: {
      choose: 2,
      from: [
        'Arcana',
        'Deception',
        'History',
        'Intimidation',
        'Investigation',
        'Nature',
        'Religion',
      ],
      label: 'Warlock Skills',
    },
    spellcasting: {
      ability: 'cha',
      cantripsKnown: 2,
      focus: 'Arcane Focus',
      kind: 'pact',
      maxSpellLevel: 1,
      preparedSpells: 2,
      recommendedCantrips: ['Eldritch Blast', 'Prestidigitation'],
      recommendedSpells: ['Charm Person', 'Hex'],
      spellSlotsLevel1: 1,
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons'],
  },
  {
    armorProficiencies: [],
    assetKey: 'class.wizard',
    difficulty: 'Intermediate',
    displayName: 'Wizard',
    equipment: [
      'Dagger',
      'Arcane Focus',
      'Robe',
      'Spellbook',
      "Scholar's Pack",
    ],
    hitDie: 6,
    id: 'Wizard',
    level1Features: ['Spellcasting', 'Ritual Adept', 'Arcane Recovery'],
    primaryAbilities: ['int'],
    role: 'Arcane Controller',
    savingThrowProficiencies: ['int', 'wis'],
    shortSummary:
      'A prepared arcane scholar who studies spells through a spellbook.',
    skillChoices: {
      choose: 2,
      from: [
        'Arcana',
        'History',
        'Insight',
        'Investigation',
        'Medicine',
        'Nature',
        'Religion',
      ],
      label: 'Wizard Skills',
    },
    spellcasting: {
      ability: 'int',
      cantripsKnown: 3,
      focus: 'Arcane Focus or Spellbook',
      kind: 'full',
      maxSpellLevel: 1,
      preparedSpells: 4,
      recommendedCantrips: ['Light', 'Mage Hand', 'Ray of Frost'],
      recommendedSpells: [
        'Detect Magic',
        'Mage Armor',
        'Magic Missile',
        'Shield',
      ],
      spellSlotsLevel1: 2,
    },
    toolProficiencies: [],
    weaponProficiencies: ['Simple weapons'],
  },
];

export const rulesBackgrounds: RuleBackground[] = [
  {
    abilityScoreOptions: ['int', 'wis', 'cha'],
    assetKey: 'background.acolyte',
    displayName: 'Acolyte',
    equipment: [
      "Calligrapher's Supplies",
      'Book',
      'Holy Symbol',
      'Parchment',
      'Robe',
    ],
    id: 'Acolyte',
    originFeat: 'Magic Initiate (Cleric)',
    originFeatSpellList: 'Cleric',
    shortSummary:
      'A temple-taught character shaped by rites, study, and sacred service.',
    skills: ['Insight', 'Religion'],
    toolProficiencies: ["Calligrapher's Supplies"],
  },
  {
    abilityScoreOptions: ['dex', 'con', 'int'],
    assetKey: 'background.criminal',
    displayName: 'Criminal',
    equipment: [
      "Thieves' Tools",
      'Dagger',
      'Crowbar',
      'Pouch',
      "Traveler's Clothes",
    ],
    id: 'Criminal',
    originFeat: 'Alert',
    shortSummary:
      'A streetwise survivor trained by stealth, timing, and careful risk.',
    skills: ['Sleight of Hand', 'Stealth'],
    toolProficiencies: ["Thieves' Tools"],
  },
  {
    abilityScoreOptions: ['con', 'int', 'wis'],
    assetKey: 'background.sage',
    displayName: 'Sage',
    equipment: [
      "Calligrapher's Supplies",
      'Quarterstaff',
      'Book',
      'Parchment',
      'Robe',
    ],
    id: 'Sage',
    originFeat: 'Magic Initiate (Wizard)',
    originFeatSpellList: 'Wizard',
    shortSummary:
      'A scholar formed by records, research, and hard-won knowledge.',
    skills: ['Arcana', 'History'],
    toolProficiencies: ["Calligrapher's Supplies"],
  },
  {
    abilityScoreOptions: ['str', 'dex', 'con'],
    assetKey: 'background.soldier',
    displayName: 'Soldier',
    equipment: [
      'Spear',
      'Shortbow',
      'Arrow',
      'Gaming Set',
      "Healer's Kit",
      'Quiver',
    ],
    id: 'Soldier',
    originFeat: 'Savage Attacker',
    shortSummary:
      'A drilled combatant marked by discipline, command, and battlefield habits.',
    skills: ['Athletics', 'Intimidation'],
    toolChoice: {
      choose: 1,
      from: gamingSetChoices,
      label: 'Gaming Set',
    },
    toolProficiencies: [],
  },
];

export const rulesEquipment: RuleEquipment[] = [
  {
    armorClass: { base: 11, dexModifier: 'full', type: 'armor' },
    category: 'armor',
    name: 'Leather Armor',
    source: 'class',
  },
  {
    armorClass: { base: 12, dexModifier: 'full', type: 'armor' },
    category: 'armor',
    name: 'Studded Leather Armor',
    source: 'class',
  },
  {
    armorClass: { base: 13, dexModifier: 'max2', type: 'armor' },
    category: 'armor',
    name: 'Chain Shirt',
    source: 'class',
  },
  {
    armorClass: { base: 16, dexModifier: 'none', type: 'armor' },
    category: 'armor',
    name: 'Chain Mail',
    source: 'class',
  },
  {
    armorClass: { base: 2, dexModifier: 'none', type: 'shield' },
    category: 'armor',
    name: 'Shield',
    source: 'class',
  },
  { category: 'weapon', name: 'Arrow', source: 'class' },
  { category: 'weapon', name: 'Crowbar', source: 'background' },
  { category: 'weapon', name: 'Dagger', source: 'shared' },
  { category: 'weapon', name: 'Flail', source: 'class' },
  { category: 'weapon', name: 'Greataxe', source: 'class' },
  { category: 'weapon', name: 'Greatsword', source: 'class' },
  { category: 'weapon', name: 'Handaxe', source: 'class' },
  { category: 'weapon', name: 'Javelin', source: 'class' },
  { category: 'weapon', name: 'Longbow', source: 'class' },
  { category: 'weapon', name: 'Longsword', source: 'class' },
  { category: 'weapon', name: 'Mace', source: 'class' },
  { category: 'weapon', name: 'Quarterstaff', source: 'background' },
  { category: 'weapon', name: 'Scimitar', source: 'class' },
  { category: 'weapon', name: 'Shortbow', source: 'class' },
  { category: 'weapon', name: 'Shortsword', source: 'class' },
  { category: 'weapon', name: 'Sickle', source: 'class' },
  { category: 'weapon', name: 'Spear', source: 'background' },
  { category: 'focus', name: 'Arcane Focus', source: 'class' },
  { category: 'focus', name: 'Druidic Focus', source: 'class' },
  { category: 'focus', name: 'Holy Symbol', source: 'shared' },
  { category: 'adventuring gear', name: 'Book', source: 'background' },
  { category: 'adventuring gear', name: "Burglar's Pack", source: 'class' },
  { category: 'adventuring gear', name: "Dungeoneer's Pack", source: 'class' },
  { category: 'adventuring gear', name: "Entertainer's Pack", source: 'class' },
  { category: 'adventuring gear', name: "Explorer's Pack", source: 'class' },
  { category: 'adventuring gear', name: "Healer's Kit", source: 'background' },
  { category: 'adventuring gear', name: 'Parchment', source: 'background' },
  { category: 'adventuring gear', name: 'Pouch', source: 'background' },
  { category: 'adventuring gear', name: "Priest's Pack", source: 'class' },
  { category: 'adventuring gear', name: 'Quiver', source: 'class' },
  { category: 'adventuring gear', name: 'Robe', source: 'shared' },
  { category: 'adventuring gear', name: "Scholar's Pack", source: 'class' },
  { category: 'adventuring gear', name: 'Spellbook', source: 'class' },
  {
    category: 'adventuring gear',
    name: "Traveler's Clothes",
    source: 'background',
  },
  { category: 'tool', name: "Artisan's Tools", source: 'class' },
  { category: 'tool', name: "Calligrapher's Supplies", source: 'background' },
  { category: 'tool', name: 'Gaming Set', source: 'background' },
  { category: 'tool', name: 'Herbalism Kit', source: 'class' },
  { category: 'tool', name: 'Musical Instrument', source: 'class' },
  { category: 'tool', name: "Thieves' Tools", source: 'shared' },
];

export const rulesSpells: RuleSpell[] = [
  {
    classes: ['Wizard', 'Sorcerer'],
    level: 0,
    name: 'Acid Splash',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Wizard', 'Sorcerer', 'Warlock'],
    level: 0,
    name: 'Chill Touch',
    school: 'Necromancy',
    special: [],
  },
  {
    classes: ['Bard', 'Wizard', 'Sorcerer'],
    level: 0,
    name: 'Dancing Lights',
    school: 'Illusion',
    special: ['Concentration'],
  },
  {
    classes: ['Druid', 'Wizard', 'Sorcerer'],
    level: 0,
    name: 'Elementalism',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Wizard', 'Sorcerer'],
    level: 0,
    name: 'Fire Bolt',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Cleric', 'Druid'],
    level: 0,
    name: 'Guidance',
    school: 'Divination',
    special: ['Concentration'],
  },
  {
    classes: ['Bard', 'Cleric', 'Wizard', 'Sorcerer'],
    level: 0,
    name: 'Light',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Bard', 'Wizard', 'Sorcerer', 'Warlock'],
    level: 0,
    name: 'Mage Hand',
    school: 'Conjuration',
    special: [],
  },
  {
    classes: ['Bard', 'Cleric', 'Druid', 'Wizard', 'Sorcerer'],
    level: 0,
    name: 'Mending',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Bard', 'Druid', 'Wizard', 'Sorcerer'],
    level: 0,
    name: 'Message',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Bard', 'Wizard', 'Sorcerer', 'Warlock'],
    level: 0,
    name: 'Minor Illusion',
    school: 'Illusion',
    special: [],
  },
  {
    classes: ['Druid', 'Wizard', 'Sorcerer', 'Warlock'],
    level: 0,
    name: 'Poison Spray',
    school: 'Necromancy',
    special: [],
  },
  {
    classes: ['Bard', 'Wizard', 'Sorcerer', 'Warlock'],
    level: 0,
    name: 'Prestidigitation',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Druid'],
    level: 0,
    name: 'Produce Flame',
    school: 'Conjuration',
    special: [],
  },
  {
    classes: ['Wizard', 'Sorcerer'],
    level: 0,
    name: 'Ray of Frost',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Cleric', 'Druid'],
    level: 0,
    name: 'Resistance',
    school: 'Abjuration',
    special: ['Concentration'],
  },
  {
    classes: ['Cleric'],
    level: 0,
    name: 'Sacred Flame',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Druid'],
    level: 0,
    name: 'Shillelagh',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Wizard', 'Sorcerer'],
    level: 0,
    name: 'Shocking Grasp',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Sorcerer'],
    level: 0,
    name: 'Sorcerous Burst',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Cleric', 'Druid'],
    level: 0,
    name: 'Spare the Dying',
    school: 'Necromancy',
    special: [],
  },
  {
    classes: ['Bard', 'Druid'],
    level: 0,
    name: 'Starry Wisp',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Cleric'],
    level: 0,
    name: 'Thaumaturgy',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Bard', 'Wizard', 'Sorcerer', 'Warlock'],
    level: 0,
    name: 'True Strike',
    school: 'Divination',
    special: [],
  },
  {
    classes: ['Bard'],
    level: 0,
    name: 'Vicious Mockery',
    school: 'Enchantment',
    special: [],
  },
  {
    classes: ['Ranger', 'Wizard'],
    level: 1,
    name: 'Alarm',
    school: 'Abjuration',
    special: ['Ritual'],
  },
  {
    classes: ['Bard', 'Druid', 'Ranger'],
    level: 1,
    name: 'Animal Friendship',
    school: 'Enchantment',
    special: [],
  },
  {
    classes: ['Bard', 'Cleric', 'Warlock'],
    level: 1,
    name: 'Bane',
    school: 'Enchantment',
    special: ['Concentration'],
  },
  {
    classes: ['Cleric', 'Paladin'],
    level: 1,
    name: 'Bless',
    school: 'Enchantment',
    special: ['Concentration', 'Material'],
  },
  {
    classes: ['Sorcerer', 'Wizard'],
    level: 1,
    name: 'Burning Hands',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Bard', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'],
    level: 1,
    name: 'Charm Person',
    school: 'Enchantment',
    special: [],
  },
  {
    classes: ['Sorcerer', 'Wizard'],
    level: 1,
    name: 'Chromatic Orb',
    school: 'Evocation',
    special: ['Material'],
  },
  {
    classes: ['Bard', 'Sorcerer', 'Wizard'],
    level: 1,
    name: 'Color Spray',
    school: 'Illusion',
    special: [],
  },
  {
    classes: ['Bard', 'Cleric', 'Paladin'],
    level: 1,
    name: 'Command',
    school: 'Enchantment',
    special: [],
  },
  {
    classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    level: 1,
    name: 'Comprehend Languages',
    school: 'Divination',
    special: ['Ritual'],
  },
  {
    classes: ['Cleric', 'Druid', 'Paladin'],
    level: 1,
    name: 'Create or Destroy Water',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger'],
    level: 1,
    name: 'Cure Wounds',
    school: 'Abjuration',
    special: [],
  },
  {
    classes: ['Cleric', 'Paladin'],
    level: 1,
    name: 'Detect Evil and Good',
    school: 'Divination',
    special: ['Concentration'],
  },
  {
    classes: [
      'Bard',
      'Cleric',
      'Druid',
      'Paladin',
      'Ranger',
      'Sorcerer',
      'Warlock',
      'Wizard',
    ],
    level: 1,
    name: 'Detect Magic',
    school: 'Divination',
    special: ['Concentration', 'Ritual'],
  },
  {
    classes: ['Cleric', 'Druid', 'Paladin', 'Ranger'],
    level: 1,
    name: 'Detect Poison and Disease',
    school: 'Divination',
    special: ['Concentration', 'Ritual'],
  },
  {
    classes: ['Bard', 'Sorcerer', 'Wizard'],
    level: 1,
    name: 'Disguise Self',
    school: 'Illusion',
    special: [],
  },
  {
    classes: ['Bard'],
    level: 1,
    name: 'Dissonant Whispers',
    school: 'Enchantment',
    special: [],
  },
  {
    classes: ['Paladin'],
    level: 1,
    name: 'Divine Favor',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Paladin'],
    level: 1,
    name: 'Divine Smite',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Ranger'],
    level: 1,
    name: 'Ensnaring Strike',
    school: 'Conjuration',
    special: ['Concentration'],
  },
  {
    classes: ['Druid', 'Ranger'],
    level: 1,
    name: 'Entangle',
    school: 'Conjuration',
    special: ['Concentration'],
  },
  {
    classes: ['Sorcerer', 'Warlock', 'Wizard'],
    level: 1,
    name: 'Expeditious Retreat',
    school: 'Transmutation',
    special: ['Concentration'],
  },
  {
    classes: ['Bard', 'Druid'],
    level: 1,
    name: 'Faerie Fire',
    school: 'Evocation',
    special: ['Concentration'],
  },
  {
    classes: ['Sorcerer', 'Wizard'],
    level: 1,
    name: 'False Life',
    school: 'Necromancy',
    special: [],
  },
  {
    classes: ['Bard', 'Sorcerer', 'Wizard'],
    level: 1,
    name: 'Feather Fall',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Wizard'],
    level: 1,
    name: 'Find Familiar',
    school: 'Conjuration',
    special: ['Ritual', 'Material'],
  },
  {
    classes: ['Wizard'],
    level: 1,
    name: 'Floating Disk',
    school: 'Conjuration',
    special: ['Ritual'],
  },
  {
    classes: ['Druid', 'Ranger', 'Sorcerer', 'Wizard'],
    level: 1,
    name: 'Fog Cloud',
    school: 'Conjuration',
    special: ['Concentration'],
  },
  {
    classes: ['Druid', 'Ranger'],
    level: 1,
    name: 'Goodberry',
    school: 'Conjuration',
    special: [],
  },
  {
    classes: ['Sorcerer', 'Wizard'],
    level: 1,
    name: 'Grease',
    school: 'Conjuration',
    special: [],
  },
  {
    classes: ['Cleric'],
    level: 1,
    name: 'Guiding Bolt',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Cleric', 'Bard'],
    level: 1,
    name: 'Healing Word',
    school: 'Abjuration',
    special: [],
  },
  {
    classes: ['Warlock'],
    level: 1,
    name: 'Hellish Rebuke',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Warlock'],
    level: 1,
    name: 'Hex',
    school: 'Enchantment',
    special: ['Concentration'],
  },
  {
    classes: ['Bard', 'Paladin'],
    level: 1,
    name: 'Heroism',
    school: 'Enchantment',
    special: ['Concentration'],
  },
  {
    classes: ['Bard', 'Warlock', 'Wizard'],
    level: 1,
    name: 'Hideous Laughter',
    school: 'Enchantment',
    special: ['Concentration'],
  },
  {
    classes: ['Ranger'],
    level: 1,
    name: "Hunter's Mark",
    school: 'Divination',
    special: ['Concentration'],
  },
  {
    classes: ['Sorcerer', 'Wizard'],
    level: 1,
    name: 'Ice Knife',
    school: 'Conjuration',
    special: [],
  },
  {
    classes: ['Bard', 'Wizard'],
    level: 1,
    name: 'Identify',
    school: 'Divination',
    special: ['Ritual', 'Material'],
  },
  {
    classes: ['Bard', 'Warlock', 'Wizard'],
    level: 1,
    name: 'Illusory Script',
    school: 'Illusion',
    special: ['Ritual', 'Material'],
  },
  {
    classes: ['Cleric'],
    level: 1,
    name: 'Inflict Wounds',
    school: 'Necromancy',
    special: [],
  },
  {
    classes: ['Ranger', 'Sorcerer', 'Wizard'],
    level: 1,
    name: 'Jump',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Bard', 'Wizard', 'Ranger'],
    level: 1,
    name: 'Longstrider',
    school: 'Transmutation',
    special: [],
  },
  {
    classes: ['Sorcerer', 'Wizard'],
    level: 1,
    name: 'Mage Armor',
    school: 'Abjuration',
    special: [],
  },
  {
    classes: ['Sorcerer', 'Wizard'],
    level: 1,
    name: 'Magic Missile',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Cleric', 'Paladin', 'Warlock', 'Wizard'],
    level: 1,
    name: 'Protection from Evil and Good',
    school: 'Abjuration',
    special: ['Concentration', 'Material'],
  },
  {
    classes: ['Cleric', 'Paladin'],
    level: 1,
    name: 'Purify Food and Drink',
    school: 'Transmutation',
    special: ['Ritual'],
  },
  {
    classes: ['Sorcerer', 'Wizard'],
    level: 1,
    name: 'Ray of Sickness',
    school: 'Necromancy',
    special: [],
  },
  {
    classes: ['Cleric'],
    level: 1,
    name: 'Sanctuary',
    school: 'Abjuration',
    special: [],
  },
  {
    classes: ['Paladin'],
    level: 1,
    name: 'Searing Smite',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Sorcerer', 'Wizard'],
    level: 1,
    name: 'Shield',
    school: 'Abjuration',
    special: [],
  },
  {
    classes: ['Cleric', 'Paladin'],
    level: 1,
    name: 'Shield of Faith',
    school: 'Abjuration',
    special: ['Concentration'],
  },
  {
    classes: ['Bard', 'Sorcerer', 'Wizard'],
    level: 1,
    name: 'Silent Image',
    school: 'Illusion',
    special: ['Concentration'],
  },
  {
    classes: ['Bard', 'Sorcerer', 'Wizard'],
    level: 1,
    name: 'Sleep',
    school: 'Enchantment',
    special: ['Concentration'],
  },
  {
    classes: ['Bard', 'Druid', 'Ranger', 'Warlock'],
    level: 1,
    name: 'Speak with Animals',
    school: 'Divination',
    special: ['Ritual'],
  },
  {
    classes: ['Bard', 'Druid', 'Sorcerer', 'Wizard'],
    level: 1,
    name: 'Thunderwave',
    school: 'Evocation',
    special: [],
  },
  {
    classes: ['Bard', 'Warlock', 'Wizard'],
    level: 1,
    name: 'Unseen Servant',
    school: 'Conjuration',
    special: ['Ritual'],
  },
];
