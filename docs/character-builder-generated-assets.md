# Character Builder Generated Assets

## Scope

This frontend-only slice generated and wired local visual assets for the
Character Library and Character Builder scaffold. Assets live under:

```text
apps/web/public/assets/character-builder/
```

The generated files are referenced through
`apps/web/lib/character-builder-assets.ts` and the machine-readable manifest at:

```text
apps/web/public/assets/character-builder/asset-manifest.json
```

## Generator / Capability

Assets were generated with the local Codex image generation capability through
the `$imagegen` workflow. The generated contact sheets were cropped into
optimized WebP files with the repo-local Sharp package already present in
`node_modules/.pnpm`; no remote image URLs or external downloaded assets were
added.

Reference screenshots inspected for style direction:

- `docs/design/character-builder-reference/01-character-library.png`
- `docs/design/character-builder-reference/02-builder-identity.png`
- `docs/design/character-builder-reference/03-builder-species.png`
- `docs/design/character-builder-reference/04-builder-class.png`
- `docs/design/character-builder-reference/05-builder-background.png`
- `docs/design/character-builder-reference/06-builder-ability-scores.png`
- `docs/design/character-builder-reference/07-builder-proficiencies.png`
- `docs/design/character-builder-reference/08-builder-equipment.png`
- `docs/design/character-builder-reference/09-builder-spells.png`
- `docs/design/character-builder-reference/10-builder-review.png`

The screenshots were used only for mood, palette, framing, and UI-art direction.
The generated files avoid embedded text, logos, remote references, and copied
external artwork.

## Style Notes

The generated direction is dark fantasy tabletop RPG card art: painterly
subjects, readable silhouettes, parchment/gold framing, dark stone textures,
and purple arcane accents. UI text remains React/CSS text rather than embedded
image text.

## Generated Categories

- `portraits/`: four sample library portraits for Elara Nightbloom, Thorn
  Blackoak, Mirelle Dawnsong, and Kael Emberstep.
- `species/`: Human, Elf, Dwarf, Halfling, Dragonborn, Tiefling, Gnome,
  Goliath, and Orc card art.
- `classes/`: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger,
  Rogue, Sorcerer, Warlock, and Wizard emblems.
- `backgrounds/`: Acolyte, Criminal, Sage, and Soldier icons.
- `equipment/`: common equipment icons plus generic aliases for armor, weapons,
  and basic gear fallback behavior.
- `spells/`: requested spell icons plus all eight spell-school fallback icons.
- `textures/`: dark sidebar/citadel, parchment, and dark-panel textures.
- `frames/`: generated painted frame pieces plus local SVG frame assets.
- `icons/`: generated ornament/ring assets plus local SVG compass and stepper
  state icons.

## Remaining Gaps

- Entertainer, Noble, and Hermit background assets are reserved as missing
  registry slots because those backgrounds are not in the current SRD-backed
  local builder set.
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
