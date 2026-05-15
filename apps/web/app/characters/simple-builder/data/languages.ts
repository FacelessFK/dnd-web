export const LANGUAGE_DESCRIPTIONS: Record<string, string> = {
  Abyssal: 'Language of demons and chaotic fiends from the Abyss.',
  Celestial: 'Language of angels, divine servants, and upper planes.',
  Common: 'The everyday trade tongue shared across many cultures.',
  'Deep Speech': 'Alien tongue of aberrations and deep underground horrors.',
  Draconic: 'Ancient language of dragons, dragonborn, and arcane lore.',
  Druidic: 'Secret language used by druids for speech and hidden messages.',
  Dwarvish: 'Sturdy speech of dwarves, stone halls, mines, and clans.',
  Elvish: 'Flowing language of elves, old songs, fey courts, and poetry.',
  Giant: 'Booming tongue of giants, ogres, trolls, and giant-kin.',
  Gnoll: 'Harsh language used by gnolls and their raiding packs.',
  Gnomish: 'Quick, technical language of gnomes, inventors, and tinkerers.',
  Goblin: 'Rough tongue of goblins, bugbears, hobgoblins, and warbands.',
  Halfling: 'Warm, practical language of halfling families and travelers.',
  Infernal: 'Precise contract language of devils and the Nine Hells.',
  Orc: 'Direct, forceful language of orcs, raiders, and warrior clans.',
  Primordial: 'Elemental root language of air, earth, fire, and water beings.',
  Sylvan: 'Musical speech of fey creatures, old forests, and enchantment.',
  "Thieves' Cant": 'Coded slang and signs used by rogues and criminal circles.',
  Undercommon: 'Trade language of the Underdark and its shadowed cities.',
};

export function getLanguageDescription(language: string): string {
  return (
    LANGUAGE_DESCRIPTIONS[language] ??
    'A spoken and written language your character can understand.'
  );
}
