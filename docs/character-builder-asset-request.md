# Character Builder Asset Request

The `/characters` Character Library and Character Builder are currently
frontend-only and use CSS/Tailwind placeholders. This document lists the local
assets needed to replace those placeholders without adding remote dependencies.

## Recommended Folder Structure

```text
apps/web/public/assets/character-builder/
  portraits/
  species/
  classes/
  backgrounds/
  equipment/
  spells/
  icons/
  textures/
  frames/
```

Prefer `webp` for illustrated raster art, `svg` for icons/frames/ornaments, and
transparent `png` only when painterly cutouts require alpha.

## Priority 1: Core Page Art

| File                            | Size / Ratio                     | Format | Usage                                           |
| ------------------------------- | -------------------------------- | ------ | ----------------------------------------------- |
| `textures/sidebar-citadel.webp` | 768x1536, vertical               | WebP   | Left navigation background atmosphere.          |
| `textures/parchment-card.webp`  | 1024x1024, tileable or crop-safe | WebP   | Character cards, choice cards, builder panels.  |
| `frames/gold-corner-frame.svg`  | Scalable                         | SVG    | Card borders and ornate gold corner flourishes. |
| `icons/compass-rose.svg`        | 128x128                          | SVG    | Product mark and primary button ornament.       |
| `icons/step-complete.svg`       | 64x64                            | SVG    | Completed stepper state.                        |
| `icons/step-active.svg`         | 64x64                            | SVG    | Purple active stepper glow/marker.              |

## Priority 1: Sample Character Portraits

| File                              | Size / Ratio | Format | Usage                                            |
| --------------------------------- | ------------ | ------ | ------------------------------------------------ |
| `portraits/elara-nightbloom.webp` | 768x512, 3:2 | WebP   | Elara card and builder identity/summary preview. |
| `portraits/thorn-blackoak.webp`   | 768x512, 3:2 | WebP   | Thorn library card.                              |
| `portraits/mirelle-dawnsong.webp` | 768x512, 3:2 | WebP   | Mirelle library card.                            |
| `portraits/kael-emberstep.webp`   | 768x512, 3:2 | WebP   | Kael library card.                               |
| `frames/avatar-token-frame.svg`   | Scalable     | SVG    | Summary portrait frame and future token framing. |

## Priority 2: Species Card Art

Use 768x512 WebP illustrations. Each should read clearly when cropped into a
wide card.

| File                      | Usage                      |
| ------------------------- | -------------------------- |
| `species/human.webp`      | Human selection card.      |
| `species/elf.webp`        | Elf selection card.        |
| `species/dwarf.webp`      | Dwarf selection card.      |
| `species/halfling.webp`   | Halfling selection card.   |
| `species/dragonborn.webp` | Dragonborn selection card. |
| `species/tiefling.webp`   | Tiefling selection card.   |
| `species/gnome.webp`      | Gnome selection card.      |
| `species/orc.webp`        | Orc selection card.        |

## Priority 2: Class Icons / Art

Use 512x512 transparent PNG or SVG emblem art. These should work over parchment
and dark panels.

| File                          | Usage                           |
| ----------------------------- | ------------------------------- |
| `classes/fighter-sword.webp`  | Fighter class card and preview. |
| `classes/rogue-daggers.webp`  | Rogue class card and preview.   |
| `classes/cleric-sun.webp`     | Cleric class card and preview.  |
| `classes/wizard-sigil.webp`   | Wizard class card and preview.  |
| `classes/ranger-bow.webp`     | Ranger class card and preview.  |
| `classes/paladin-shield.webp` | Paladin class card and preview. |
| `classes/bard-lute.webp`      | Bard class card and preview.    |
| `classes/warlock-eye.webp`    | Warlock class card and preview. |

## Priority 3: Background Icons / Art

Use 512x512 transparent PNG or SVG icon/emblem art.

| File                                 | Usage                                    |
| ------------------------------------ | ---------------------------------------- |
| `backgrounds/sage-tome.webp`         | Sage background list and preview.        |
| `backgrounds/acolyte-medallion.webp` | Acolyte background list and preview.     |
| `backgrounds/criminal-raven.webp`    | Criminal background list and preview.    |
| `backgrounds/soldier-banner.webp`    | Soldier background list and preview.     |
| `backgrounds/entertainer-lute.webp`  | Entertainer background list and preview. |
| `backgrounds/noble-crown.webp`       | Noble background list and preview.       |
| `backgrounds/hermit-lantern.webp`    | Hermit background list and preview.      |

## Priority 3: Equipment and Spell Icons

Use 256x256 transparent PNG/WebP icons.

| File                           | Usage                        |
| ------------------------------ | ---------------------------- |
| `equipment/arcane-focus.webp`  | Equipment choice and review. |
| `equipment/quarterstaff.webp`  | Equipment choice and review. |
| `equipment/scholar-pack.webp`  | Equipment choice and review. |
| `equipment/spellbook.webp`     | Equipment choice and review. |
| `equipment/shield.webp`        | Equipment choice and review. |
| `spells/fire-bolt.webp`        | Cantrip/spell selection.     |
| `spells/mage-hand.webp`        | Cantrip/spell selection.     |
| `spells/minor-illusion.webp`   | Cantrip/spell selection.     |
| `spells/prestidigitation.webp` | Cantrip/spell selection.     |
| `spells/magic-missile.webp`    | Spell selection and preview. |
| `spells/shield.webp`           | Spell selection and preview. |
| `spells/sleep.webp`            | Spell selection and preview. |
| `spells/detect-magic.webp`     | Spell selection and preview. |

## Placeholder Behavior

Until these assets exist, the app uses CSS gradients, initials, parchment
colors, and local labels. Missing files must not break the build. The helper in
`apps/web/lib/character-builder-assets.ts` maps future logical asset keys to
local paths and allows UI components to fall back to generated placeholders.
