# Character Builder Asset Request

The `/characters` Character Library and Character Builder use local generated
assets plus CSS/Tailwind fallbacks. This document tracks the product assets
used by the current browser UI without adding remote runtime dependencies.

Generated asset metadata is also available at:

```text
apps/web/public/assets/character-builder/asset-manifest.json
```

## Generated Status

Satisfied in this asset slice:

- sample character portraits for Elara, Thorn, Mirelle, and Kael,
- SRD species card art for Human, Elf, Dwarf, Halfling, Dragonborn, Tiefling,
  Gnome, Goliath, and Orc,
- simple-builder race, class, and background card PNGs plus symbol PNGs for
  the current `/characters/new` flow,
- class emblems for Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin,
  Ranger, Rogue, Sorcerer, Warlock, and Wizard,
- background icons for Acolyte, Criminal, Sage, and Soldier in the generated
  registry,
- common equipment icons for quarterstaff, dagger, shield, leather armor,
  chain mail, holy symbol, arcane focus, component pouch, scholar pack,
  explorer pack, spellbook, and traveler clothes,
- spell icons for Fire Bolt, Mage Hand, Prestidigitation, Magic Missile,
  Shield, Detect Magic, Sleep, and Chromatic Orb,
- spell-school fallback icons for Abjuration, Conjuration, Divination,
  Enchantment, Evocation, Illusion, Necromancy, and Transmutation,
- local textures, painted frame pieces, and simple SVG ornaments for the
  character product shell.

Still missing or intentionally placeholder-only:

- expanded background art for Entertainer, Noble, and Hermit, which are
  reserved as WebP registry slots; the active simple-builder uses local PNG
  cards for those backgrounds,
- one illustration per SRD spell beyond the generated spell-school fallbacks,
- exact icons for every weapon, tool, pack, and adventuring-gear label in the
  rules data,
- hand-authored production art direction, accessibility review, and final
  compression pass.

## Recommended Folder Structure

```text
apps/web/public/assets/character-builder/
  portraits/
  races/
    symbols/
  species/
  classes/
    symbols/
  backgrounds/
    symbols/
  equipment/
  spells/
  icons/
  textures/
  frames/
```

Prefer `webp` for illustrated raster art, `svg` for icons/frames/ornaments, and
transparent `png` only when painterly cutouts require alpha.

## Priority 1: Core Page Art

| File                            | Size / Ratio         | Format | Usage                                           |
| ------------------------------- | -------------------- | ------ | ----------------------------------------------- |
| `textures/sidebar-citadel.webp` | 1024x1024, crop-safe | WebP   | Left navigation background atmosphere.          |
| `textures/parchment-card.webp`  | 1024x1024, crop-safe | WebP   | Character cards, choice cards, builder panels.  |
| `textures/dark-panel.webp`      | 1024x1024, crop-safe | WebP   | Dark panel fallback texture.                    |
| `frames/gold-corner-frame.svg`  | Scalable             | SVG    | Card borders and ornate gold corner flourishes. |
| `icons/compass-rose.svg`        | 128x128              | SVG    | Product mark and primary button ornament.       |
| `icons/step-complete.svg`       | 64x64                | SVG    | Completed stepper state.                        |
| `icons/step-active.svg`         | 64x64                | SVG    | Purple active stepper glow/marker.              |

## Priority 1: Sample Character Portraits

| File                              | Size / Ratio | Format | Usage                                            |
| --------------------------------- | ------------ | ------ | ------------------------------------------------ |
| `portraits/elara-nightbloom.webp` | 1024x1024    | WebP   | Elara card and builder identity/summary preview. |
| `portraits/thorn-blackoak.webp`   | 1024x1024    | WebP   | Thorn library card.                              |
| `portraits/mirelle-dawnsong.webp` | 1024x1024    | WebP   | Mirelle library card.                            |
| `portraits/kael-emberstep.webp`   | 1024x1024    | WebP   | Kael library card.                               |
| `frames/avatar-token-frame.svg`   | Scalable     | SVG    | Summary portrait frame and future token framing. |

## Priority 2: Species Card Art

Use 768x768 square WebP illustrations for the generated scaffold. Keep the
face, silhouette, and ornamental corners inside the central safe area so the art
also survives future responsive crops.

| File                      | Usage                      |
| ------------------------- | -------------------------- |
| `species/human.webp`      | Human selection card.      |
| `species/elf.webp`        | Elf selection card.        |
| `species/dwarf.webp`      | Dwarf selection card.      |
| `species/halfling.webp`   | Halfling selection card.   |
| `species/dragonborn.webp` | Dragonborn selection card. |
| `species/tiefling.webp`   | Tiefling selection card.   |
| `species/gnome.webp`      | Gnome selection card.      |
| `species/goliath.webp`    | Goliath selection card.    |
| `species/orc.webp`        | Orc selection card.        |

## Priority 2: Class Icons / Art

Use 512x512 transparent PNG or SVG emblem art. These should work over parchment
and dark panels.

| File                          | Usage                             |
| ----------------------------- | --------------------------------- |
| `classes/fighter-sword.webp`  | Fighter class card and preview.   |
| `classes/barbarian-axe.webp`  | Barbarian class card and preview. |
| `classes/rogue-daggers.webp`  | Rogue class card and preview.     |
| `classes/cleric-sun.webp`     | Cleric class card and preview.    |
| `classes/druid-leaf.webp`     | Druid class card and preview.     |
| `classes/monk-hand.webp`      | Monk class card and preview.      |
| `classes/wizard-sigil.webp`   | Wizard class card and preview.    |
| `classes/ranger-bow.webp`     | Ranger class card and preview.    |
| `classes/paladin-shield.webp` | Paladin class card and preview.   |
| `classes/bard-lute.webp`      | Bard class card and preview.      |
| `classes/sorcerer-spark.webp` | Sorcerer class card and preview.  |
| `classes/warlock-eye.webp`    | Warlock class card and preview.   |

## Priority 3: Background Icons / Art

Use 512x512 transparent PNG or SVG icon/emblem art.

| File                                 | Usage                                 |
| ------------------------------------ | ------------------------------------- |
| `backgrounds/sage-tome.webp`         | Sage background list and preview.     |
| `backgrounds/acolyte-medallion.webp` | Acolyte background list and preview.  |
| `backgrounds/criminal-raven.webp`    | Criminal background list and preview. |
| `backgrounds/soldier-banner.webp`    | Soldier background list and preview.  |
| `backgrounds/entertainer-lute.webp`  | Future expanded background slot.      |
| `backgrounds/noble-crown.webp`       | Future expanded background slot.      |
| `backgrounds/hermit-lantern.webp`    | Future expanded background slot.      |

## Priority 3: Equipment and Spell Icons

Use 256x256 transparent PNG/WebP icons.

| File                              | Usage                        |
| --------------------------------- | ---------------------------- |
| `equipment/arcane-focus.webp`     | Equipment choice and review. |
| `equipment/quarterstaff.webp`     | Equipment choice and review. |
| `equipment/scholar-pack.webp`     | Equipment choice and review. |
| `equipment/explorer-pack.webp`    | Equipment choice and review. |
| `equipment/component-pouch.webp`  | Equipment choice and review. |
| `equipment/leather-armor.webp`    | Equipment choice and review. |
| `equipment/chain-mail.webp`       | Equipment choice and review. |
| `equipment/holy-symbol.webp`      | Equipment choice and review. |
| `equipment/dagger.webp`           | Equipment choice and review. |
| `equipment/spellbook.webp`        | Equipment choice and review. |
| `equipment/shield.webp`           | Equipment choice and review. |
| `equipment/traveler-clothes.webp` | Equipment choice and review. |
| `spells/fire-bolt.webp`           | Cantrip/spell selection.     |
| `spells/mage-hand.webp`           | Cantrip/spell selection.     |
| `spells/prestidigitation.webp`    | Cantrip/spell selection.     |
| `spells/magic-missile.webp`       | Spell selection and preview. |
| `spells/shield.webp`              | Spell selection and preview. |
| `spells/sleep.webp`               | Spell selection and preview. |
| `spells/detect-magic.webp`        | Spell selection and preview. |
| `spells/chromatic-orb.webp`       | Spell selection and preview. |

The rule-aware builder now exposes SRD cantrips and level 1 spells across Bard,
Cleric, Druid, Paladin, Ranger, Sorcerer, Warlock, and Wizard. Add generic
school/focus icons as a practical next step before creating one illustration per
spell:

| File                        | Usage                                   |
| --------------------------- | --------------------------------------- |
| `spells/abjuration.webp`    | Fallback for Abjuration spell cards.    |
| `spells/conjuration.webp`   | Fallback for Conjuration spell cards.   |
| `spells/divination.webp`    | Fallback for Divination spell cards.    |
| `spells/enchantment.webp`   | Fallback for Enchantment spell cards.   |
| `spells/evocation.webp`     | Fallback for Evocation spell cards.     |
| `spells/illusion.webp`      | Fallback for Illusion spell cards.      |
| `spells/necromancy.webp`    | Fallback for Necromancy spell cards.    |
| `spells/transmutation.webp` | Fallback for Transmutation spell cards. |

## Placeholder Behavior

The app renders local assets when a mapped file exists. Missing files still use
CSS gradients, initials, parchment colors, and local labels, and must not break
the build. The helper in `apps/web/lib/character-builder-assets.ts` maps
logical asset keys to local paths, explicit missing slots, and fallback labels.

Do not add old generated contact sheets, duplicate PNG exports, zip files, or
raw design screenshots unless a current UI path or doc explicitly references
them.
