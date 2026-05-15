# Character Builder Generated Assets

## Scope

This slice generated and wired local visual assets for the Character Library
and Character Builder. Product assets live under:

```text
apps/web/public/assets/character-builder/
```

The generated files are referenced through
`apps/web/lib/character-builder-assets.ts` and the machine-readable manifest at:

```text
apps/web/public/assets/character-builder/asset-manifest.json
```

## Generator / Capability

Assets were generated with local image-generation workflow output and cropped
into optimized WebP/SVG product files. Raw contact sheets, duplicate PNG
exports, old reference screenshots, and zip files are intentionally not kept in
the day-to-day repo. The generated files avoid embedded text, logos, remote
references, and copied external artwork.

## Style Notes

The generated direction is dark fantasy tabletop RPG card art: painterly
subjects, readable silhouettes, parchment/gold framing, dark stone textures,
and purple arcane accents. UI text remains React/CSS text rather than embedded
image text.

## Generated Categories

- `portraits/`: four sample library portraits for Elara Nightbloom, Thorn
  Blackoak, Mirelle Dawnsong, and Kael Emberstep.
- `races/`: active simple-builder race and subrace PNG card art plus symbol
  PNGs used by `/characters/new`.
- `species/`: Human, Elf, Dwarf, Halfling, Dragonborn, Tiefling, Gnome,
  Goliath, and Orc card art.
- `classes/`: active simple-builder class PNG card art plus symbol PNGs, and
  generated WebP emblems for Barbarian, Bard, Cleric, Druid, Fighter, Monk,
  Paladin, Ranger, Rogue, Sorcerer, Warlock, and Wizard.
- `backgrounds/`: active simple-builder background PNG card art plus symbol
  PNGs, and generated WebP registry icons for Acolyte, Criminal, Sage, and
  Soldier.
- `equipment/`: common equipment icons plus generic aliases for armor, weapons,
  and basic gear fallback behavior.
- `spells/`: requested spell icons plus all eight spell-school fallback icons.
- `textures/`: dark sidebar/citadel, parchment, and dark-panel textures.
- `frames/`: generated painted frame pieces plus local SVG frame assets.
- `icons/`: generated ornament/ring assets plus local SVG compass and stepper
  state icons.

## Remaining Gaps

- Entertainer, Noble, and Hermit remain placeholder-only in the generated WebP
  registry, but the active simple-builder has local PNG card and symbol assets
  for those backgrounds.
- Many SRD cantrips and level 1 spells use school fallback art rather than
  unique spell illustrations.
- Many equipment labels use class-based or category fallback icons rather than
  exact object art.
- These assets are generated placeholders for product scaffolding, not final
  hand-authored production art.

## Replacement Guidance

Future hand-authored assets should keep the same filenames where practical so
the existing asset registry and manifest remain stable. If a filename changes,
update `apps/web/lib/character-builder-assets.ts`, regenerate
`apps/web/public/assets/character-builder/asset-manifest.json`, and keep the CSS
fallback behavior intact.
