import { ALL_SKILLS } from './skills';
import type { Race } from '../types';

const raceImage = (id: string) => `/assets/character-builder/races/${id}.png`;
const raceSymbol = (id: string) =>
  `/assets/character-builder/races/symbols/${id}.png`;

export const RACES: Race[] = [
  {
    id: 'human',
    name: 'Human',
    tagline: 'Ambitious and adaptable, humanity shapes the world',
    imageUrl: raceImage('human'),
    symbolUrl: raceSymbol('human'),
    speed: 30,
    size: 'Medium',
    asi: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
    languages: ['Common'],
    languageChoiceCount: 1,
    traits: [
      {
        name: 'Ability Score Increase',
        description: 'Your ability scores each increase by 1.',
      },
      {
        name: 'Extra Language',
        description:
          'You can speak, read, and write Common and one extra language of your choice.',
      },
    ],
  },
  {
    id: 'elf',
    name: 'Elf',
    tagline: 'Ancient and perceptive, elves walk between two worlds',
    imageUrl: raceImage('elf'),
    symbolUrl: raceSymbol('elf'),
    speed: 30,
    size: 'Medium',
    asi: { DEX: 2 },
    languages: ['Common', 'Elvish'],
    traits: [
      {
        name: 'Darkvision',
        description:
          'Accustomed to twilit forests, you have superior vision in dark conditions up to 60 feet.',
      },
      {
        name: 'Keen Senses',
        description: 'You have proficiency in the Perception skill.',
      },
      {
        name: 'Fey Ancestry',
        description:
          "You have advantage on saving throws against being charmed, and magic can't put you to sleep.",
      },
      {
        name: 'Trance',
        description:
          "Elves don't need to sleep. Instead they meditate deeply for 4 hours a day.",
      },
    ],
    subraces: [
      {
        id: 'high-elf',
        name: 'High Elf',
        description: 'Keepers of ancient lore and arcane secrets.',
        imageUrl: raceImage('elf'),
        asi: { INT: 1 },
        languageChoiceCount: 1,
        traits: [
          {
            name: 'Elf Weapon Training',
            description:
              'You have proficiency with the longsword, shortsword, shortbow, and longbow.',
          },
          {
            name: 'Cantrip',
            description:
              'You know one cantrip of your choice from the wizard spell list (INT is your spellcasting ability).',
          },
          {
            name: 'Extra Language',
            description:
              'You can speak, read, and write one extra language of your choice.',
          },
        ],
      },
      {
        id: 'wood-elf',
        name: 'Wood Elf',
        description: 'Swift hunters at home in the ancient forests.',
        imageUrl: raceImage('wood-elf'),
        asi: { WIS: 1 },
        traits: [
          {
            name: 'Elf Weapon Training',
            description:
              'You have proficiency with the longsword, shortsword, shortbow, and longbow.',
          },
          {
            name: 'Fleet of Foot',
            description: 'Your base walking speed increases to 35 feet.',
          },
          {
            name: 'Mask of the Wild',
            description:
              'You can attempt to hide even when only lightly obscured by foliage, rain, snow, or mist.',
          },
        ],
      },
      {
        id: 'dark-elf',
        name: 'Dark Elf (Drow)',
        description: 'Deadly and cunning denizens of the Underdark.',
        imageUrl: raceImage('dark-elf'),
        asi: { CHA: 1 },
        traits: [
          {
            name: 'Superior Darkvision',
            description: 'Your darkvision has a radius of 120 feet.',
          },
          {
            name: 'Sunlight Sensitivity',
            description:
              'You have disadvantage on attack rolls and Perception checks in direct sunlight.',
          },
          {
            name: 'Drow Magic',
            description:
              'You know the Dancing Lights cantrip. At 3rd level, you can cast Faerie Fire once per day.',
          },
          {
            name: 'Drow Weapon Training',
            description:
              'You have proficiency with rapiers, shortswords, and hand crossbows.',
          },
        ],
      },
    ],
  },
  {
    id: 'half-elf',
    name: 'Half-Elf',
    tagline: 'Gifted with elven grace and human drive',
    imageUrl: raceImage('half-elf'),
    symbolUrl: raceSymbol('half-elf'),
    speed: 30,
    size: 'Medium',
    asi: { CHA: 2 },
    languages: ['Common', 'Elvish'],
    languageChoiceCount: 1,
    skillChoiceCount: 2,
    skillChoiceOptions: ALL_SKILLS,
    traits: [
      {
        name: 'Ability Score Increase',
        description:
          'Your Charisma score increases by 2, and two other ability scores of your choice increase by 1.',
      },
      {
        name: 'Darkvision',
        description:
          'You can see in dim light within 60 feet as if it were bright light.',
      },
      {
        name: 'Fey Ancestry',
        description:
          "You have advantage on saving throws against being charmed, and magic can't put you to sleep.",
      },
      {
        name: 'Skill Versatility',
        description: 'You gain proficiency in two skills of your choice.',
      },
    ],
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    tagline: 'Stoic and resilient, dwarves are born to endure',
    imageUrl: raceImage('dwarf'),
    symbolUrl: raceSymbol('dwarf'),
    speed: 25,
    size: 'Medium',
    asi: { CON: 2 },
    languages: ['Common', 'Dwarvish'],
    traits: [
      {
        name: 'Darkvision',
        description:
          'You can see in dim light within 60 feet as if it were bright light.',
      },
      {
        name: 'Dwarven Resilience',
        description:
          'You have advantage on saving throws against poison, and you have resistance against poison damage.',
      },
      {
        name: 'Dwarven Combat Training',
        description:
          'You have proficiency with the battleaxe, handaxe, light hammer, and warhammer.',
      },
      {
        name: 'Tool Proficiency',
        description:
          "You gain proficiency with the artisan's tools of your choice: smith's, brewer's, or mason's tools.",
      },
      {
        name: 'Stonecunning',
        description:
          'You have advantage on History checks related to the origin of stonework.',
      },
    ],
    subraces: [
      {
        id: 'hill-dwarf',
        name: 'Hill Dwarf',
        description: 'Wise and hardy, with a keen sense for danger.',
        imageUrl: raceImage('dwarf'),
        asi: { WIS: 1 },
        traits: [
          {
            name: 'Dwarven Toughness',
            description:
              'Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.',
          },
        ],
      },
      {
        id: 'mountain-dwarf',
        name: 'Mountain Dwarf',
        description: 'Strong and armored, the warrior dwarves of the peaks.',
        imageUrl: raceImage('mountain-dwarf'),
        asi: { STR: 2 },
        traits: [
          {
            name: 'Dwarven Armor Training',
            description: 'You have proficiency with light and medium armor.',
          },
        ],
      },
    ],
  },
  {
    id: 'halfling',
    name: 'Halfling',
    tagline: 'Small in size, boundless in luck and courage',
    imageUrl: raceImage('halfling'),
    symbolUrl: raceSymbol('halfling'),
    speed: 25,
    size: 'Small',
    asi: { DEX: 2 },
    languages: ['Common', 'Halfling'],
    traits: [
      {
        name: 'Lucky',
        description:
          'When you roll a 1 on a d20 for an attack roll, ability check, or saving throw, you can reroll and must use the new roll.',
      },
      {
        name: 'Brave',
        description:
          'You have advantage on saving throws against being frightened.',
      },
      {
        name: 'Halfling Nimbleness',
        description:
          'You can move through the space of any creature that is of a size larger than yours.',
      },
    ],
    subraces: [
      {
        id: 'lightfoot',
        name: 'Lightfoot Halfling',
        description: 'Subtle wanderers who live among other folk.',
        imageUrl: raceImage('halfling'),
        asi: { CHA: 1 },
        traits: [
          {
            name: 'Naturally Stealthy',
            description:
              'You can attempt to hide even when obscured only by a creature that is at least one size larger than you.',
          },
        ],
      },
      {
        id: 'stout',
        name: 'Stout Halfling',
        description: 'Hardier halflings with dwarven blood.',
        imageUrl: raceImage('stout'),
        asi: { CON: 1 },
        traits: [
          {
            name: 'Stout Resilience',
            description:
              'You have advantage on saving throws against poison, and you have resistance against poison damage.',
          },
        ],
      },
    ],
  },
  {
    id: 'gnome',
    name: 'Gnome',
    tagline: 'Inventive thinkers brimming with curiosity and magic',
    imageUrl: raceImage('forest-gnome'),
    symbolUrl: raceSymbol('gnome'),
    speed: 25,
    size: 'Small',
    asi: { INT: 2 },
    languages: ['Common', 'Gnomish'],
    traits: [
      {
        name: 'Darkvision',
        description:
          'You can see in dim light within 60 feet as if it were bright light.',
      },
      {
        name: 'Gnome Cunning',
        description:
          'You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic.',
      },
    ],
    subraces: [
      {
        id: 'forest-gnome',
        name: 'Forest Gnome',
        description: 'Gentle illusionists at home in wild places.',
        imageUrl: raceImage('forest-gnome'),
        asi: { DEX: 1 },
        traits: [
          {
            name: 'Natural Illusionist',
            description:
              'You know the Minor Illusion cantrip. Intelligence is your spellcasting ability for it.',
          },
          {
            name: 'Speak with Small Beasts',
            description:
              'Through sounds and gestures, you can communicate simple ideas to Small or smaller beasts.',
          },
        ],
      },
      {
        id: 'rock-gnome',
        name: 'Rock Gnome',
        description: 'Tinkerers and clockwork inventors.',
        imageUrl: raceImage('rock-gnome'),
        asi: { CON: 1 },
        traits: [
          {
            name: "Artificer's Lore",
            description:
              'Add twice your proficiency bonus to History checks related to magic items, alchemical objects, or technological devices.',
          },
          {
            name: 'Tinker',
            description:
              "You have proficiency with artisan's tools (tinker's tools). You can spend 1 hour to construct a Tiny clockwork device.",
          },
        ],
      },
    ],
  },
  {
    id: 'half-orc',
    name: 'Half-Orc',
    tagline: 'Fierce and relentless, half-orcs are born survivors',
    imageUrl: raceImage('half-orc'),
    symbolUrl: raceSymbol('half-orc'),
    speed: 30,
    size: 'Medium',
    asi: { STR: 2, CON: 1 },
    languages: ['Common', 'Orc'],
    traits: [
      {
        name: 'Darkvision',
        description:
          'You can see in dim light within 60 feet as if it were bright light.',
      },
      {
        name: 'Menacing',
        description: 'You gain proficiency in the Intimidation skill.',
      },
      {
        name: 'Relentless Endurance',
        description:
          "When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. Once you use this trait, you can't do so again until you finish a long rest.",
      },
      {
        name: 'Savage Attacks',
        description:
          "When you score a critical hit with a melee weapon attack, you can roll one of the weapon's damage dice one additional time and add it to the extra damage.",
      },
    ],
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    tagline: 'Touched by infernal power, defined by more than their heritage',
    imageUrl: raceImage('tiefling'),
    symbolUrl: raceSymbol('tiefling'),
    speed: 30,
    size: 'Medium',
    asi: { INT: 1, CHA: 2 },
    languages: ['Common', 'Infernal'],
    traits: [
      {
        name: 'Darkvision',
        description:
          'You can see in dim light within 60 feet as if it were bright light.',
      },
      {
        name: 'Hellish Resistance',
        description: 'You have resistance to fire damage.',
      },
      {
        name: 'Infernal Legacy',
        description:
          'You know the Thaumaturgy cantrip. At 3rd level, you can cast Hellish Rebuke once per day. At 5th level, you can cast Darkness once per day.',
      },
    ],
  },
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    tagline: 'Dragon-descended warriors with elemental breath',
    imageUrl: raceImage('dragonborn'),
    symbolUrl: raceSymbol('dragonborn'),
    speed: 30,
    size: 'Medium',
    asi: { STR: 2, CHA: 1 },
    languages: ['Common', 'Draconic'],
    traits: [
      {
        name: 'Draconic Ancestry',
        description:
          'You have draconic ancestry of a chosen dragon type, which determines your breath weapon and damage resistance. Common choices: Black (acid), Blue (lightning), Red (fire), White (cold), Green (poison).',
      },
      {
        name: 'Breath Weapon',
        description:
          'You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. Recharges on short or long rest.',
      },
      {
        name: 'Damage Resistance',
        description:
          'You have resistance to the damage type associated with your draconic ancestry.',
      },
    ],
  },
];
