export type CharacterBuilderAssetCategory =
  | 'portraits'
  | 'species'
  | 'classes'
  | 'backgrounds'
  | 'equipment'
  | 'spells'
  | 'icons'
  | 'textures'
  | 'frames';

export type CharacterBuilderAssetStatus =
  | 'generated'
  | 'placeholder'
  | 'missing';

export type CharacterBuilderAssetKey =
  | 'portrait.elara'
  | 'portrait.thorn'
  | 'portrait.mirelle'
  | 'portrait.kael'
  | 'species.human'
  | 'species.elf'
  | 'species.dwarf'
  | 'species.halfling'
  | 'species.dragonborn'
  | 'species.tiefling'
  | 'species.gnome'
  | 'species.goliath'
  | 'species.orc'
  | 'class.barbarian'
  | 'class.fighter'
  | 'class.rogue'
  | 'class.cleric'
  | 'class.druid'
  | 'class.monk'
  | 'class.wizard'
  | 'class.ranger'
  | 'class.paladin'
  | 'class.bard'
  | 'class.sorcerer'
  | 'class.warlock'
  | 'background.sage'
  | 'background.acolyte'
  | 'background.criminal'
  | 'background.soldier'
  | 'background.entertainer'
  | 'background.noble'
  | 'background.hermit'
  | 'equipment.arcane_focus'
  | 'equipment.armor_fallback'
  | 'equipment.basic_gear'
  | 'equipment.chain_mail'
  | 'equipment.component_pouch'
  | 'equipment.dagger'
  | 'equipment.explorer_pack'
  | 'equipment.holy_symbol'
  | 'equipment.leather_armor'
  | 'equipment.quarterstaff'
  | 'equipment.scholar_pack'
  | 'equipment.shield'
  | 'equipment.spellbook'
  | 'equipment.traveler_clothes'
  | 'spell.fire_bolt'
  | 'spell.mage_hand'
  | 'spell.prestidigitation'
  | 'spell.magic_missile'
  | 'spell.shield'
  | 'spell.detect_magic'
  | 'spell.sleep'
  | 'spell.chromatic_orb'
  | 'spell.school_abjuration'
  | 'spell.school_conjuration'
  | 'spell.school_divination'
  | 'spell.school_enchantment'
  | 'spell.school_evocation'
  | 'spell.school_illusion'
  | 'spell.school_necromancy'
  | 'spell.school_transmutation'
  | 'texture.sidebar'
  | 'texture.parchment'
  | 'texture.dark_panel'
  | 'frame.gold'
  | 'frame.gold_ornamental_corner'
  | 'frame.purple_selected_glow'
  | 'frame.level_badge'
  | 'frame.status_badge'
  | 'frame.avatar_token'
  | 'icon.stepper_ring'
  | 'icon.compass_star_divider'
  | 'icon.compass_rose'
  | 'icon.step_active'
  | 'icon.step_complete';

export type CharacterBuilderAssetManifestEntry = {
  category: CharacterBuilderAssetCategory;
  fallbackPath: string | null;
  key: CharacterBuilderAssetKey;
  path: string | null;
  status: CharacterBuilderAssetStatus;
  usage: string;
};

type CharacterBuilderAssetMetadata = Omit<
  CharacterBuilderAssetManifestEntry,
  'key'
>;

const assetBasePath = '/assets/character-builder';
const darkPanelFallback = `${assetBasePath}/textures/dark-panel.webp`;
const explorerPackFallback = `${assetBasePath}/equipment/explorer-pack.webp`;
const evocationFallback = `${assetBasePath}/spells/evocation.webp`;

const characterBuilderAssetEntries = {
  'background.acolyte': {
    category: 'backgrounds',
    fallbackPath: null,
    path: `${assetBasePath}/backgrounds/acolyte-medallion.webp`,
    status: 'generated',
    usage: 'Background choice card for Acolyte.',
  },
  'background.criminal': {
    category: 'backgrounds',
    fallbackPath: null,
    path: `${assetBasePath}/backgrounds/criminal-raven.webp`,
    status: 'generated',
    usage: 'Background choice card for Criminal.',
  },
  'background.entertainer': {
    category: 'backgrounds',
    fallbackPath: darkPanelFallback,
    path: null,
    status: 'missing',
    usage: 'Reserved background art slot for future expanded data.',
  },
  'background.hermit': {
    category: 'backgrounds',
    fallbackPath: darkPanelFallback,
    path: null,
    status: 'missing',
    usage: 'Reserved background art slot for future expanded data.',
  },
  'background.noble': {
    category: 'backgrounds',
    fallbackPath: darkPanelFallback,
    path: null,
    status: 'missing',
    usage: 'Reserved background art slot for future expanded data.',
  },
  'background.sage': {
    category: 'backgrounds',
    fallbackPath: null,
    path: `${assetBasePath}/backgrounds/sage-tome.webp`,
    status: 'generated',
    usage: 'Background choice card for Sage.',
  },
  'background.soldier': {
    category: 'backgrounds',
    fallbackPath: null,
    path: `${assetBasePath}/backgrounds/soldier-banner.webp`,
    status: 'generated',
    usage: 'Background choice card for Soldier.',
  },
  'class.barbarian': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/barbarian-axe.webp`,
    status: 'generated',
    usage: 'Class emblem for Barbarian cards and previews.',
  },
  'class.bard': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/bard-lute.webp`,
    status: 'generated',
    usage: 'Class emblem for Bard cards and previews.',
  },
  'class.cleric': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/cleric-sun.webp`,
    status: 'generated',
    usage: 'Class emblem for Cleric cards and previews.',
  },
  'class.druid': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/druid-leaf.webp`,
    status: 'generated',
    usage: 'Class emblem for Druid cards and previews.',
  },
  'class.fighter': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/fighter-sword.webp`,
    status: 'generated',
    usage: 'Class emblem for Fighter cards and previews.',
  },
  'class.monk': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/monk-hand.webp`,
    status: 'generated',
    usage: 'Class emblem for Monk cards and previews.',
  },
  'class.paladin': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/paladin-shield.webp`,
    status: 'generated',
    usage: 'Class emblem for Paladin cards and previews.',
  },
  'class.ranger': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/ranger-bow.webp`,
    status: 'generated',
    usage: 'Class emblem for Ranger cards and previews.',
  },
  'class.rogue': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/rogue-daggers.webp`,
    status: 'generated',
    usage: 'Class emblem for Rogue cards and previews.',
  },
  'class.sorcerer': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/sorcerer-spark.webp`,
    status: 'generated',
    usage: 'Class emblem for Sorcerer cards and previews.',
  },
  'class.warlock': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/warlock-eye.webp`,
    status: 'generated',
    usage: 'Class emblem for Warlock cards and previews.',
  },
  'class.wizard': {
    category: 'classes',
    fallbackPath: null,
    path: `${assetBasePath}/classes/wizard-sigil.webp`,
    status: 'generated',
    usage: 'Class emblem for Wizard cards and previews.',
  },
  'equipment.arcane_focus': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/arcane-focus.webp`,
    status: 'generated',
    usage: 'Equipment icon for arcane or druidic focus labels.',
  },
  'equipment.armor_fallback': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/chain-mail.webp`,
    status: 'generated',
    usage: 'Equipment icon fallback for armor without exact art.',
  },
  'equipment.basic_gear': {
    category: 'equipment',
    fallbackPath: null,
    path: explorerPackFallback,
    status: 'generated',
    usage: 'Equipment icon fallback for generic gear metadata.',
  },
  'equipment.chain_mail': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/chain-mail.webp`,
    status: 'generated',
    usage: 'Equipment icon for chain mail and heavy armor labels.',
  },
  'equipment.component_pouch': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/component-pouch.webp`,
    status: 'generated',
    usage: 'Equipment icon for component pouch and small kit labels.',
  },
  'equipment.dagger': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/dagger.webp`,
    status: 'generated',
    usage: 'Equipment icon for dagger and simple weapon fallbacks.',
  },
  'equipment.explorer_pack': {
    category: 'equipment',
    fallbackPath: null,
    path: explorerPackFallback,
    status: 'generated',
    usage: 'Equipment icon for Explorer Pack style loadouts.',
  },
  'equipment.holy_symbol': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/holy-symbol.webp`,
    status: 'generated',
    usage: 'Equipment icon for Holy Symbol labels.',
  },
  'equipment.leather_armor': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/leather-armor.webp`,
    status: 'generated',
    usage: 'Equipment icon for leather and light armor labels.',
  },
  'equipment.quarterstaff': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/quarterstaff.webp`,
    status: 'generated',
    usage: 'Equipment icon for Quarterstaff labels.',
  },
  'equipment.scholar_pack': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/scholar-pack.webp`,
    status: 'generated',
    usage: 'Equipment icon for Scholar Pack style loadouts.',
  },
  'equipment.shield': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/shield.webp`,
    status: 'generated',
    usage: 'Equipment icon for Shield labels.',
  },
  'equipment.spellbook': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/spellbook.webp`,
    status: 'generated',
    usage: 'Equipment icon for Spellbook and book labels.',
  },
  'equipment.traveler_clothes': {
    category: 'equipment',
    fallbackPath: null,
    path: `${assetBasePath}/equipment/traveler-clothes.webp`,
    status: 'generated',
    usage: 'Equipment icon for traveler clothing labels.',
  },
  'frame.avatar_token': {
    category: 'frames',
    fallbackPath: null,
    path: `${assetBasePath}/frames/avatar-token-frame.svg`,
    status: 'generated',
    usage: 'SVG frame reserved for avatar/token compositions.',
  },
  'frame.gold': {
    category: 'frames',
    fallbackPath: null,
    path: `${assetBasePath}/frames/gold-corner-frame.svg`,
    status: 'generated',
    usage: 'SVG gold ornamental frame for cards.',
  },
  'frame.gold_ornamental_corner': {
    category: 'frames',
    fallbackPath: null,
    path: `${assetBasePath}/frames/gold-ornamental-corner.webp`,
    status: 'generated',
    usage: 'Painted gold ornamental corner art.',
  },
  'frame.level_badge': {
    category: 'frames',
    fallbackPath: null,
    path: `${assetBasePath}/frames/level-badge.webp`,
    status: 'generated',
    usage: 'Painted level badge frame art.',
  },
  'frame.purple_selected_glow': {
    category: 'frames',
    fallbackPath: null,
    path: `${assetBasePath}/frames/purple-selected-glow.webp`,
    status: 'generated',
    usage: 'Painted purple selected-state frame art.',
  },
  'frame.status_badge': {
    category: 'frames',
    fallbackPath: null,
    path: `${assetBasePath}/frames/status-badge.webp`,
    status: 'generated',
    usage: 'Painted status badge frame art.',
  },
  'icon.compass_rose': {
    category: 'icons',
    fallbackPath: null,
    path: `${assetBasePath}/icons/compass-rose.svg`,
    status: 'generated',
    usage: 'SVG compass/star divider ornament.',
  },
  'icon.compass_star_divider': {
    category: 'icons',
    fallbackPath: null,
    path: `${assetBasePath}/icons/compass-star-divider.webp`,
    status: 'generated',
    usage: 'Painted compass/star divider ornament.',
  },
  'icon.step_active': {
    category: 'icons',
    fallbackPath: null,
    path: `${assetBasePath}/icons/step-active.svg`,
    status: 'generated',
    usage: 'SVG active step marker.',
  },
  'icon.step_complete': {
    category: 'icons',
    fallbackPath: null,
    path: `${assetBasePath}/icons/step-complete.svg`,
    status: 'generated',
    usage: 'SVG completed step marker.',
  },
  'icon.stepper_ring': {
    category: 'icons',
    fallbackPath: null,
    path: `${assetBasePath}/icons/stepper-ring.webp`,
    status: 'generated',
    usage: 'Painted stepper ring ornament.',
  },
  'portrait.elara': {
    category: 'portraits',
    fallbackPath: null,
    path: `${assetBasePath}/portraits/elara-nightbloom.webp`,
    status: 'generated',
    usage: 'Library card and builder avatar for Elara Nightbloom.',
  },
  'portrait.kael': {
    category: 'portraits',
    fallbackPath: null,
    path: `${assetBasePath}/portraits/kael-emberstep.webp`,
    status: 'generated',
    usage: 'Library card and builder avatar for Kael Emberstep.',
  },
  'portrait.mirelle': {
    category: 'portraits',
    fallbackPath: null,
    path: `${assetBasePath}/portraits/mirelle-dawnsong.webp`,
    status: 'generated',
    usage: 'Library card and builder avatar for Mirelle Dawnsong.',
  },
  'portrait.thorn': {
    category: 'portraits',
    fallbackPath: null,
    path: `${assetBasePath}/portraits/thorn-blackoak.webp`,
    status: 'generated',
    usage: 'Library card and builder avatar for Thorn Blackoak.',
  },
  'species.dragonborn': {
    category: 'species',
    fallbackPath: null,
    path: `${assetBasePath}/species/dragonborn.webp`,
    status: 'generated',
    usage: 'Species choice card for Dragonborn.',
  },
  'species.dwarf': {
    category: 'species',
    fallbackPath: null,
    path: `${assetBasePath}/species/dwarf.webp`,
    status: 'generated',
    usage: 'Species choice card for Dwarf.',
  },
  'species.elf': {
    category: 'species',
    fallbackPath: null,
    path: `${assetBasePath}/species/elf.webp`,
    status: 'generated',
    usage: 'Species choice card for Elf.',
  },
  'species.gnome': {
    category: 'species',
    fallbackPath: null,
    path: `${assetBasePath}/species/gnome.webp`,
    status: 'generated',
    usage: 'Species choice card for Gnome.',
  },
  'species.goliath': {
    category: 'species',
    fallbackPath: null,
    path: `${assetBasePath}/species/goliath.webp`,
    status: 'generated',
    usage: 'Species choice card for Goliath.',
  },
  'species.halfling': {
    category: 'species',
    fallbackPath: null,
    path: `${assetBasePath}/species/halfling.webp`,
    status: 'generated',
    usage: 'Species choice card for Halfling.',
  },
  'species.human': {
    category: 'species',
    fallbackPath: null,
    path: `${assetBasePath}/species/human.webp`,
    status: 'generated',
    usage: 'Species choice card for Human.',
  },
  'species.orc': {
    category: 'species',
    fallbackPath: null,
    path: `${assetBasePath}/species/orc.webp`,
    status: 'generated',
    usage: 'Species choice card for Orc.',
  },
  'species.tiefling': {
    category: 'species',
    fallbackPath: null,
    path: `${assetBasePath}/species/tiefling.webp`,
    status: 'generated',
    usage: 'Species choice card for Tiefling.',
  },
  'spell.chromatic_orb': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/chromatic-orb.webp`,
    status: 'generated',
    usage: 'Spell icon for Chromatic Orb.',
  },
  'spell.detect_magic': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/detect-magic.webp`,
    status: 'generated',
    usage: 'Spell icon for Detect Magic.',
  },
  'spell.fire_bolt': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/fire-bolt.webp`,
    status: 'generated',
    usage: 'Spell icon for Fire Bolt.',
  },
  'spell.mage_hand': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/mage-hand.webp`,
    status: 'generated',
    usage: 'Spell icon for Mage Hand.',
  },
  'spell.magic_missile': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/magic-missile.webp`,
    status: 'generated',
    usage: 'Spell icon for Magic Missile.',
  },
  'spell.prestidigitation': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/prestidigitation.webp`,
    status: 'generated',
    usage: 'Spell icon for Prestidigitation.',
  },
  'spell.school_abjuration': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/abjuration.webp`,
    status: 'generated',
    usage: 'Fallback spell icon for Abjuration spells.',
  },
  'spell.school_conjuration': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/conjuration.webp`,
    status: 'generated',
    usage: 'Fallback spell icon for Conjuration spells.',
  },
  'spell.school_divination': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/divination.webp`,
    status: 'generated',
    usage: 'Fallback spell icon for Divination spells.',
  },
  'spell.school_enchantment': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/enchantment.webp`,
    status: 'generated',
    usage: 'Fallback spell icon for Enchantment spells.',
  },
  'spell.school_evocation': {
    category: 'spells',
    fallbackPath: null,
    path: evocationFallback,
    status: 'generated',
    usage: 'Fallback spell icon for Evocation spells.',
  },
  'spell.school_illusion': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/illusion.webp`,
    status: 'generated',
    usage: 'Fallback spell icon for Illusion spells.',
  },
  'spell.school_necromancy': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/necromancy.webp`,
    status: 'generated',
    usage: 'Fallback spell icon for Necromancy spells.',
  },
  'spell.school_transmutation': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/transmutation.webp`,
    status: 'generated',
    usage: 'Fallback spell icon for Transmutation spells.',
  },
  'spell.shield': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/shield.webp`,
    status: 'generated',
    usage: 'Spell icon for Shield.',
  },
  'spell.sleep': {
    category: 'spells',
    fallbackPath: null,
    path: `${assetBasePath}/spells/sleep.webp`,
    status: 'generated',
    usage: 'Spell icon for Sleep.',
  },
  'texture.dark_panel': {
    category: 'textures',
    fallbackPath: null,
    path: darkPanelFallback,
    status: 'generated',
    usage: 'Dark panel texture for local UI styling.',
  },
  'texture.parchment': {
    category: 'textures',
    fallbackPath: null,
    path: `${assetBasePath}/textures/parchment-card.webp`,
    status: 'generated',
    usage: 'Parchment card texture for future UI treatment.',
  },
  'texture.sidebar': {
    category: 'textures',
    fallbackPath: null,
    path: `${assetBasePath}/textures/sidebar-citadel.webp`,
    status: 'generated',
    usage: 'Dark sidebar texture with citadel silhouette.',
  },
} satisfies Record<CharacterBuilderAssetKey, CharacterBuilderAssetMetadata>;

const equipmentAssetKeysByNormalizedLabel: Partial<
  Record<string, CharacterBuilderAssetKey>
> = {
  arcane_focus: 'equipment.arcane_focus',
  book: 'equipment.spellbook',
  burglars_pack: 'equipment.basic_gear',
  burglar_s_pack: 'equipment.basic_gear',
  chain_mail: 'equipment.chain_mail',
  chain_shirt: 'equipment.chain_mail',
  component_pouch: 'equipment.component_pouch',
  dagger: 'equipment.dagger',
  druidic_focus: 'equipment.arcane_focus',
  dungeoneers_pack: 'equipment.explorer_pack',
  dungeoneer_s_pack: 'equipment.explorer_pack',
  explorers_pack: 'equipment.explorer_pack',
  explorer_s_pack: 'equipment.explorer_pack',
  holy_symbol: 'equipment.holy_symbol',
  leather_armor: 'equipment.leather_armor',
  parchment: 'equipment.scholar_pack',
  pouch: 'equipment.component_pouch',
  priests_pack: 'equipment.holy_symbol',
  priest_s_pack: 'equipment.holy_symbol',
  quarterstaff: 'equipment.quarterstaff',
  robe: 'equipment.traveler_clothes',
  scholars_pack: 'equipment.scholar_pack',
  scholar_s_pack: 'equipment.scholar_pack',
  shield: 'equipment.shield',
  spellbook: 'equipment.spellbook',
  studded_leather_armor: 'equipment.leather_armor',
  travelers_clothes: 'equipment.traveler_clothes',
  traveler_s_clothes: 'equipment.traveler_clothes',
};

const spellAssetKeysByNormalizedLabel: Partial<
  Record<string, CharacterBuilderAssetKey>
> = {
  chromatic_orb: 'spell.chromatic_orb',
  detect_magic: 'spell.detect_magic',
  fire_bolt: 'spell.fire_bolt',
  mage_hand: 'spell.mage_hand',
  magic_missile: 'spell.magic_missile',
  prestidigitation: 'spell.prestidigitation',
  shield: 'spell.shield',
  sleep: 'spell.sleep',
};

const spellSchoolAssetKeysByNormalizedLabel: Partial<
  Record<string, CharacterBuilderAssetKey>
> = {
  abjuration: 'spell.school_abjuration',
  conjuration: 'spell.school_conjuration',
  divination: 'spell.school_divination',
  enchantment: 'spell.school_enchantment',
  evocation: 'spell.school_evocation',
  illusion: 'spell.school_illusion',
  necromancy: 'spell.school_necromancy',
  transmutation: 'spell.school_transmutation',
};

function normalizeAssetLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getCharacterBuilderAssetPath(
  key: CharacterBuilderAssetKey,
): string | null {
  return characterBuilderAssetEntries[key].path;
}

export function getCharacterBuilderAssetCategory(
  key: CharacterBuilderAssetKey,
): CharacterBuilderAssetCategory {
  return characterBuilderAssetEntries[key].category;
}

export function getCharacterBuilderAssetStatus(
  key: CharacterBuilderAssetKey,
): CharacterBuilderAssetStatus {
  return characterBuilderAssetEntries[key].status;
}

export function getCharacterBuilderAssetManifestEntries(): CharacterBuilderAssetManifestEntry[] {
  return Object.entries(characterBuilderAssetEntries).map(([key, entry]) => ({
    ...entry,
    key: key as CharacterBuilderAssetKey,
  }));
}

export function getCharacterBuilderAssetFallbackLabel(
  key: CharacterBuilderAssetKey,
): string {
  const label = key.split('.').at(-1) ?? key;

  return label
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getCharacterBuilderEquipmentAssetKey(
  label: string,
): CharacterBuilderAssetKey {
  const normalizedLabel = normalizeAssetLabel(label);
  const exactAssetKey = equipmentAssetKeysByNormalizedLabel[normalizedLabel];

  if (exactAssetKey) {
    return exactAssetKey;
  }

  if (normalizedLabel.includes('armor')) {
    return 'equipment.armor_fallback';
  }

  if (
    normalizedLabel.includes('axe') ||
    normalizedLabel.includes('bow') ||
    normalizedLabel.includes('flail') ||
    normalizedLabel.includes('javelin') ||
    normalizedLabel.includes('mace') ||
    normalizedLabel.includes('scimitar') ||
    normalizedLabel.includes('sickle') ||
    normalizedLabel.includes('spear') ||
    normalizedLabel.includes('sword')
  ) {
    return 'equipment.dagger';
  }

  return 'equipment.basic_gear';
}

export function getCharacterBuilderSpellAssetKey(
  label: string,
  school?: string,
): CharacterBuilderAssetKey | null {
  const normalizedLabel = normalizeAssetLabel(label);
  const exactAssetKey = spellAssetKeysByNormalizedLabel[normalizedLabel];

  if (exactAssetKey) {
    return exactAssetKey;
  }

  if (!school) {
    return null;
  }

  return (
    spellSchoolAssetKeysByNormalizedLabel[normalizeAssetLabel(school)] ?? null
  );
}
