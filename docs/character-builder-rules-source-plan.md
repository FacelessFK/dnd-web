# Character Builder Rules Source Plan

## Source Inspected

- Official D&D Beyond SRD page: <https://www.dndbeyond.com/srd>
- English System Reference Document 5.2.1 PDF:
  <https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf>
- Official D&D Free Rules 2024:
  <https://www.dndbeyond.com/sources/dnd/free-rules>
- Official D&D Basic Rules 2014:
  <https://www.dndbeyond.com/sources/dnd/basic-rules-2014>
- English System Reference Document 5.1 PDF:
  <https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf>

The local builder data added in this slice is based on the Dungeons & Dragons
System Reference Document 5.2.1 by Wizards of the Coast LLC. The SRD is
available under the Creative Commons Attribution 4.0 International License.

Attribution text is also stored in
`apps/web/lib/character-builder-rules-data.ts` so the frontend rules data can
carry its source note with the data itself.

## Rules Profiles

The builder now stores `rulesProfileId` on the local draft and uses the
selected profile to filter legal species/race, class, background, spell, score
method, and derived-stat behavior.

Implemented profile metadata:

- D&D SRD 5.2.1, System Reference Document 5.2.1, 2025, current SRD,
  CC-BY-4.0. This is the default and most complete local data profile.
- D&D Free Rules 2024, D&D Free Rules, 2024, current basic/free public source.
  This uses the same SRD-backed local subset and remains incomplete for
  non-SRD paid-book options.
- D&D SRD 5.1, System Reference Document 5.1, 2014 / CC 2023, legacy SRD,
  CC-BY-4.0. This profile uses legacy race-based ability boosts and omits
  local 2024-only species.
- D&D Basic Rules 2014, Basic Rules 2014, 2014, legacy basic/free public
  source. This narrows choices to the local basic-style race/class subset.
- 5E Compatible / Table Profile, table-defined compatible content, optional.
  This profile includes no third-party prose and exists as a local placeholder
  for future DM-approved compatible data.

## Implemented Data

This slice adds a frontend-only structured rules layer for the Character Builder:

- Species: Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, and
  Tiefling.
- Classes: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger,
  Rogue, Sorcerer, Warlock, and Wizard.
- Backgrounds: Acolyte, Criminal, Sage, and Soldier.
- Ability score metadata: SRD background ability-score options are stored, and
  the UI previews an automatic +2/+1 assignment biased toward the selected
  class primary ability. This is a preview convenience, not a full choice UI.
- Skills: all 18 SRD skills.
- Languages: SRD standard and rare language labels, with Common fixed and two
  standard-language choices previewed.
- Class metadata: hit die, primary abilities, saving throw proficiencies, armor
  and weapon proficiency labels, skill choice pools, tool choices where needed,
  level 1 feature labels, recommended equipment metadata, and level 1
  spellcasting metadata where applicable.
- Equipment metadata: starting class/background equipment labels plus simple AC
  metadata for common armor/shield items used by the recommended loadouts.
- Spells: SRD cantrips and level 1 spells for class spell list filtering,
  including spell level, school, class list membership, and a few short tags
  such as Ritual or Concentration.
- Level math: proficiency bonus by level, level 1 hit point preview from class
  hit die and final Constitution modifier, species speed, Dwarf hit point bonus,
  and simple AC preview from equipment metadata.
- Rules profile validation: illegal profile/species/class/background
  combinations are sanitized or blocked, Standard Array and Point Buy are
  validated, Manual entry has min/max limits, final score caps are enforced,
  and Finalize remains disabled until required profile-specific choices pass.

## Placeholder Or Incomplete Data

- Higher-level spells are not loaded yet; this MVP only covers cantrips and
  level 1 spells for level 1 setup.
- Subclasses, feats beyond background origin feat labels, species lineage
  choices, spell descriptions, spell effects, weapon mastery details, and
  equipment costs/weights are not automated.
- Background ability-score increases are previewed automatically for current
  profiles; the builder does not yet offer an explicit "choose +2/+1 or
  +1/+1/+1" UI.
- Human, Elf, Dragonborn, Gnome, Goliath, and Tiefling builder-impacting
  choices are represented as metadata but are not yet stored in draft state.
- The class equipment lists are recommended metadata, not a full official
  equipment choice engine.
- Armor Class preview is intentionally simple. It considers selected armor,
  shields, and Barbarian/Monk unarmored defense labels, but it does not enforce
  armor proficiency, stealth disadvantage, strength requirements, or inventory.
- Spellcasting metadata enforces simple local selection limits only. It does
  not execute spellcasting rules, effects, attack rolls, saves, components, or
  slot spending.

## Intentionally Not Automated

- Backend persistence or APIs for the Character Library.
- Runtime character commands or submit-to-session integration.
- Database schema, migrations, repositories, transactions, or protocol changes.
- Drag-and-drop or dropdown Standard Array assignment UI, full point-buy
  education text, or level-up flow.
- Inventory, currency, encumbrance, weapon attacks, damage, spell execution, or
  condition automation.
- Account ownership, authentication, marketplace/content ownership, uploads, or
  production asset storage.

## Future Tasks

- Add explicit background ability-score choice controls and tests.
- Add draft state for species lineages, ancestry choices, and granted spells or
  skills.
- Expand spell data beyond level 1 if the builder moves past level 1.
- Add source-attributed feat metadata only where legally available.
- Add a real equipment choice model that keeps alternative SRD starting
  packages separate from a single recommended loadout.
- Add class progression/level-up data only when the product is ready for a
  progression flow.
- Add a legal source review checklist before importing any non-SRD material.
