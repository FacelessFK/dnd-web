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
  | 'species.orc'
  | 'class.fighter'
  | 'class.rogue'
  | 'class.cleric'
  | 'class.wizard'
  | 'class.ranger'
  | 'class.paladin'
  | 'class.bard'
  | 'class.warlock'
  | 'background.sage'
  | 'background.acolyte'
  | 'background.criminal'
  | 'background.soldier'
  | 'background.entertainer'
  | 'background.noble'
  | 'background.hermit'
  | 'equipment.arcane_focus'
  | 'equipment.quarterstaff'
  | 'equipment.scholar_pack'
  | 'spell.fire_bolt'
  | 'spell.mage_hand'
  | 'spell.magic_missile'
  | 'texture.sidebar'
  | 'texture.parchment'
  | 'frame.gold';

const assetBasePath = '/assets/character-builder';

const characterBuilderAssetPaths: Partial<
  Record<CharacterBuilderAssetKey, string>
> = {
  'background.acolyte': `${assetBasePath}/backgrounds/acolyte-medallion.webp`,
  'background.criminal': `${assetBasePath}/backgrounds/criminal-raven.webp`,
  'background.entertainer': `${assetBasePath}/backgrounds/entertainer-lute.webp`,
  'background.hermit': `${assetBasePath}/backgrounds/hermit-lantern.webp`,
  'background.noble': `${assetBasePath}/backgrounds/noble-crown.webp`,
  'background.sage': `${assetBasePath}/backgrounds/sage-tome.webp`,
  'background.soldier': `${assetBasePath}/backgrounds/soldier-banner.webp`,
  'class.bard': `${assetBasePath}/classes/bard-lute.webp`,
  'class.cleric': `${assetBasePath}/classes/cleric-sun.webp`,
  'class.fighter': `${assetBasePath}/classes/fighter-sword.webp`,
  'class.paladin': `${assetBasePath}/classes/paladin-shield.webp`,
  'class.ranger': `${assetBasePath}/classes/ranger-bow.webp`,
  'class.rogue': `${assetBasePath}/classes/rogue-daggers.webp`,
  'class.warlock': `${assetBasePath}/classes/warlock-eye.webp`,
  'class.wizard': `${assetBasePath}/classes/wizard-sigil.webp`,
  'equipment.arcane_focus': `${assetBasePath}/equipment/arcane-focus.webp`,
  'equipment.quarterstaff': `${assetBasePath}/equipment/quarterstaff.webp`,
  'equipment.scholar_pack': `${assetBasePath}/equipment/scholar-pack.webp`,
  'frame.gold': `${assetBasePath}/frames/gold-corner-frame.svg`,
  'portrait.elara': `${assetBasePath}/portraits/elara-nightbloom.webp`,
  'portrait.kael': `${assetBasePath}/portraits/kael-emberstep.webp`,
  'portrait.mirelle': `${assetBasePath}/portraits/mirelle-dawnsong.webp`,
  'portrait.thorn': `${assetBasePath}/portraits/thorn-blackoak.webp`,
  'species.dragonborn': `${assetBasePath}/species/dragonborn.webp`,
  'species.dwarf': `${assetBasePath}/species/dwarf.webp`,
  'species.elf': `${assetBasePath}/species/elf.webp`,
  'species.gnome': `${assetBasePath}/species/gnome.webp`,
  'species.halfling': `${assetBasePath}/species/halfling.webp`,
  'species.human': `${assetBasePath}/species/human.webp`,
  'species.orc': `${assetBasePath}/species/orc.webp`,
  'species.tiefling': `${assetBasePath}/species/tiefling.webp`,
  'spell.fire_bolt': `${assetBasePath}/spells/fire-bolt.webp`,
  'spell.mage_hand': `${assetBasePath}/spells/mage-hand.webp`,
  'spell.magic_missile': `${assetBasePath}/spells/magic-missile.webp`,
  'texture.parchment': `${assetBasePath}/textures/parchment-card.webp`,
  'texture.sidebar': `${assetBasePath}/textures/sidebar-citadel.webp`,
};

export function getCharacterBuilderAssetPath(
  key: CharacterBuilderAssetKey,
): string | null {
  return characterBuilderAssetPaths[key] ?? null;
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
