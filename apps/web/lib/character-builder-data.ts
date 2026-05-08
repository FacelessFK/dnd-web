import type { CharacterBuilderAssetKey } from './character-builder-assets';

export const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export type AbilityKey = (typeof abilityKeys)[number];

export type BuilderStepId =
  | 'identity'
  | 'species'
  | 'class'
  | 'background'
  | 'ability-scores'
  | 'proficiencies'
  | 'equipment'
  | 'spells'
  | 'review';

export type CharacterBuilderStatus = 'draft' | 'ready' | 'in_session';

export type CharacterBuilderDraft = {
  abilities: Record<AbilityKey, number>;
  armorClass: number;
  background: string;
  builderSelections: {
    cantrips: string[];
    equipment: string[];
    languages: string[];
    skills: string[];
    spells: string[];
    tools: string[];
  };
  builderStep: BuilderStepId;
  className: string;
  concept: string;
  hp: {
    current: number;
    max: number;
    temp: number;
  };
  level: number;
  name: string;
  notes: string;
  pronouns: string;
  speciesOrRace: string;
  speed: number;
  status: CharacterBuilderStatus;
};

export type CharacterBuilderLibraryEntry = {
  armorClass: number;
  className: string;
  id: string;
  level: number;
  name: string;
  portraitAssetKey: CharacterBuilderAssetKey;
  speciesOrRace: string;
  status: CharacterBuilderStatus;
  summary: string;
};

export type BuilderChoiceCard = {
  assetKey?: CharacterBuilderAssetKey;
  description: string;
  id: string;
  metadata: string[];
  title: string;
};

export type ClassChoiceCard = BuilderChoiceCard & {
  armor: string;
  difficulty: string;
  features: string[];
  primaryAbility: AbilityKey;
  role: string;
  weapons: string;
};

export type BackgroundChoiceCard = BuilderChoiceCard & {
  feature: string;
  languages: string[];
  proficiencies: string[];
  tools: string[];
};

export const builderSteps: Array<{
  id: BuilderStepId;
  label: string;
}> = [
  { id: 'identity', label: 'Identity' },
  { id: 'species', label: 'Species' },
  { id: 'class', label: 'Class' },
  { id: 'background', label: 'Background' },
  { id: 'ability-scores', label: 'Ability Scores' },
  { id: 'proficiencies', label: 'Choices & Proficiencies' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'spells', label: 'Spells' },
  { id: 'review', label: 'Review' },
];

export const mockCharacterLibraryEntries: CharacterBuilderLibraryEntry[] = [
  {
    armorClass: 12,
    className: 'Wizard',
    id: 'mock-elara-nightbloom',
    level: 1,
    name: 'Elara Nightbloom',
    portraitAssetKey: 'portrait.elara',
    speciesOrRace: 'Elf',
    status: 'draft',
    summary: 'A moonlit scholar drawn to forgotten arcane ruins.',
  },
  {
    armorClass: 16,
    className: 'Fighter',
    id: 'mock-thorn-blackoak',
    level: 3,
    name: 'Thorn Blackoak',
    portraitAssetKey: 'portrait.thorn',
    speciesOrRace: 'Human',
    status: 'ready',
    summary: 'A weathered sellsword with an oath heavier than steel.',
  },
  {
    armorClass: 15,
    className: 'Cleric',
    id: 'mock-mirelle-dawnsong',
    level: 2,
    name: 'Mirelle Dawnsong',
    portraitAssetKey: 'portrait.mirelle',
    speciesOrRace: 'Dwarf',
    status: 'in_session',
    summary: 'A dawn-priest who carries warmth into haunted halls.',
  },
  {
    armorClass: 14,
    className: 'Rogue',
    id: 'mock-kael-emberstep',
    level: 4,
    name: 'Kael Emberstep',
    portraitAssetKey: 'portrait.kael',
    speciesOrRace: 'Tiefling',
    status: 'ready',
    summary: 'A smiling blade with ash in his boots and secrets to sell.',
  },
];

export const speciesChoices: BuilderChoiceCard[] = [
  {
    assetKey: 'species.human',
    description: 'Versatile and ambitious, humans thrive in every realm.',
    id: 'Human',
    metadata: ['Adaptable', 'Driven', 'Culturally varied'],
    title: 'Human',
  },
  {
    assetKey: 'species.elf',
    description: 'Graceful and long-lived, elves are attuned to magic.',
    id: 'Elf',
    metadata: ['Darkvision', 'Keen senses', 'Trance'],
    title: 'Elf',
  },
  {
    assetKey: 'species.dwarf',
    description: 'Sturdy and resolute, dwarves are masters of craft.',
    id: 'Dwarf',
    metadata: ['Stonecunning', 'Resilient', 'Tool tradition'],
    title: 'Dwarf',
  },
  {
    assetKey: 'species.halfling',
    description: 'Small in stature, big in heart, halflings value comfort.',
    id: 'Halfling',
    metadata: ['Lucky', 'Brave', 'Community-minded'],
    title: 'Halfling',
  },
  {
    assetKey: 'species.dragonborn',
    description: 'Proud and resilient, born of a draconic legacy.',
    id: 'Dragonborn',
    metadata: ['Draconic ancestry', 'Breath legacy', 'Honor-bound'],
    title: 'Dragonborn',
  },
  {
    assetKey: 'species.tiefling',
    description: 'Marked by infernal heritage, tieflings walk between worlds.',
    id: 'Tiefling',
    metadata: ['Infernal legacy', 'Darkvision', 'Fire-touched'],
    title: 'Tiefling',
  },
  {
    assetKey: 'species.gnome',
    description: 'Curious and inventive, gnomes see the world as a puzzle.',
    id: 'Gnome',
    metadata: ['Clever', 'Curious', 'Small folk'],
    title: 'Gnome',
  },
  {
    assetKey: 'species.orc',
    description:
      'Strong and relentless, orcs live for clan and glorious deeds.',
    id: 'Orc',
    metadata: ['Powerful build', 'Enduring', 'Bold'],
    title: 'Orc',
  },
];

export const classChoices: ClassChoiceCard[] = [
  {
    armor: 'All armor',
    assetKey: 'class.fighter',
    description: 'A disciplined warrior built for direct combat.',
    difficulty: 'Beginner friendly',
    features: ['Fighting Style', 'Second Wind'],
    id: 'Fighter',
    metadata: ['Frontline', 'Reliable', 'Weapon master'],
    primaryAbility: 'str',
    role: 'Martial Defender',
    title: 'Fighter',
    weapons: 'Simple and martial weapons',
  },
  {
    armor: 'Light armor',
    assetKey: 'class.rogue',
    description: 'A precise opportunist who turns openings into victories.',
    difficulty: 'Beginner friendly',
    features: ['Sneak Attack', 'Expertise'],
    id: 'Rogue',
    metadata: ['Skirmisher', 'Skills', 'Precision'],
    primaryAbility: 'dex',
    role: 'Agile Striker',
    title: 'Rogue',
    weapons: 'Simple weapons, finesse blades',
  },
  {
    armor: 'Light and medium armor',
    assetKey: 'class.cleric',
    description: 'A divine champion balancing support and battle prayers.',
    difficulty: 'Beginner friendly',
    features: ['Spellcasting', 'Divine Order'],
    id: 'Cleric',
    metadata: ['Support', 'Divine magic', 'Durable'],
    primaryAbility: 'wis',
    role: 'Divine Support',
    title: 'Cleric',
    weapons: 'Simple weapons',
  },
  {
    armor: 'None',
    assetKey: 'class.wizard',
    description: 'A scholarly spellcaster who shapes reality through study.',
    difficulty: 'Intermediate',
    features: ['Spellcasting', 'Arcane Recovery'],
    id: 'Wizard',
    metadata: ['Arcane', 'Controller', 'Prepared spells'],
    primaryAbility: 'int',
    role: 'Arcane Controller',
    title: 'Wizard',
    weapons: 'Simple weapons',
  },
  {
    armor: 'Light and medium armor',
    assetKey: 'class.ranger',
    description: 'A wilderness expert with keen senses and sharp arrows.',
    difficulty: 'Intermediate',
    features: ['Favored Enemy', 'Deft Explorer'],
    id: 'Ranger',
    metadata: ['Explorer', 'Marksman', 'Tracker'],
    primaryAbility: 'dex',
    role: 'Wilderness Striker',
    title: 'Ranger',
    weapons: 'Simple and martial weapons',
  },
  {
    armor: 'All armor and shields',
    assetKey: 'class.paladin',
    description: 'A sworn protector who blends steel, oath, and divine force.',
    difficulty: 'Intermediate',
    features: ['Lay on Hands', 'Divine Sense'],
    id: 'Paladin',
    metadata: ['Protector', 'Oaths', 'Radiant'],
    primaryAbility: 'str',
    role: 'Holy Defender',
    title: 'Paladin',
    weapons: 'Simple and martial weapons',
  },
  {
    armor: 'Light armor',
    assetKey: 'class.bard',
    description: 'A performer and lorekeeper who wins with charm and talent.',
    difficulty: 'Intermediate',
    features: ['Bardic Inspiration', 'Spellcasting'],
    id: 'Bard',
    metadata: ['Support', 'Face', 'Versatile'],
    primaryAbility: 'cha',
    role: 'Inspiring Support',
    title: 'Bard',
    weapons: 'Simple weapons',
  },
  {
    armor: 'Light armor',
    assetKey: 'class.warlock',
    description: 'A pact-bound caster with dangerous gifts from beyond.',
    difficulty: 'Advanced',
    features: ['Pact Magic', 'Eldritch Invocations'],
    id: 'Warlock',
    metadata: ['Pact magic', 'Mystery', 'Focused power'],
    primaryAbility: 'cha',
    role: 'Occult Striker',
    title: 'Warlock',
    weapons: 'Simple weapons',
  },
];

export const backgroundChoices: BackgroundChoiceCard[] = [
  {
    assetKey: 'background.sage',
    description: 'A seeker of knowledge who spent years in study.',
    feature: 'Researcher',
    id: 'Sage',
    languages: ['Draconic', 'Celestial'],
    metadata: ['Arcana', 'History', 'Researcher'],
    proficiencies: ['Arcana', 'History'],
    title: 'Sage',
    tools: ["Scholar's Kit"],
  },
  {
    assetKey: 'background.acolyte',
    description: 'You served a temple, deity, or religious order.',
    feature: 'Shelter of the Faithful',
    id: 'Acolyte',
    languages: ['Celestial', 'Infernal'],
    metadata: ['Insight', 'Religion', 'Temple ties'],
    proficiencies: ['Insight', 'Religion'],
    title: 'Acolyte',
    tools: ['Holy Symbol'],
  },
  {
    assetKey: 'background.criminal',
    description: 'You survived by wit, stealth, and careful timing.',
    feature: 'Criminal Contact',
    id: 'Criminal',
    languages: ["Thieves' Cant"],
    metadata: ['Stealth', 'Deception', 'Contacts'],
    proficiencies: ['Deception', 'Stealth'],
    title: 'Criminal',
    tools: ["Thieves' Tools"],
  },
  {
    assetKey: 'background.soldier',
    description: 'You trained in combat and understand the cost of war.',
    feature: 'Military Rank',
    id: 'Soldier',
    languages: ['Goblin'],
    metadata: ['Athletics', 'Intimidation', 'Rank'],
    proficiencies: ['Athletics', 'Intimidation'],
    title: 'Soldier',
    tools: ['Gaming Set'],
  },
  {
    assetKey: 'background.entertainer',
    description: 'You thrive in the spotlight and know how to move a room.',
    feature: 'By Popular Demand',
    id: 'Entertainer',
    languages: ['Elvish'],
    metadata: ['Acrobatics', 'Performance', 'Fame'],
    proficiencies: ['Acrobatics', 'Performance'],
    title: 'Entertainer',
    tools: ['Lute'],
  },
  {
    assetKey: 'background.noble',
    description: 'You come from privilege and a web of influence.',
    feature: 'Position of Privilege',
    id: 'Noble',
    languages: ['Dwarvish'],
    metadata: ['History', 'Persuasion', 'Courtly'],
    proficiencies: ['History', 'Persuasion'],
    title: 'Noble',
    tools: ['Signet Ring'],
  },
  {
    assetKey: 'background.hermit',
    description: 'You withdrew from society for study or revelation.',
    feature: 'Discovery',
    id: 'Hermit',
    languages: ['Sylvan'],
    metadata: ['Medicine', 'Religion', 'Solitude'],
    proficiencies: ['Medicine', 'Religion'],
    title: 'Hermit',
    tools: ['Herbalism Kit'],
  },
];

export const skillOptions = [
  'Arcana',
  'Athletics',
  'History',
  'Insight',
  'Investigation',
  'Medicine',
  'Perception',
  'Persuasion',
  'Stealth',
  'Survival',
];

export const languageOptions = [
  'Common',
  'Elvish',
  'Dwarvish',
  'Draconic',
  'Celestial',
  'Infernal',
  'Sylvan',
  'Goblin',
];

export const toolOptions = [
  "Scholar's Kit",
  "Thieves' Tools",
  'Herbalism Kit',
  "Calligrapher's Supplies",
  'Lute',
];

export const cantripOptions = [
  'Fire Bolt',
  'Mage Hand',
  'Minor Illusion',
  'Prestidigitation',
  'Ray of Frost',
];

export const equipmentOptions = [
  'Quarterstaff',
  'Dagger',
  'Arcane Focus',
  "Scholar's Pack",
  'Spellbook',
  "Explorer's Pack",
  'Shield',
  'Traveling Clothes',
];

export const spellOptions = [
  'Magic Missile',
  'Shield',
  'Sleep',
  'Detect Magic',
  'Find Familiar',
  'Chromatic Orb',
];
