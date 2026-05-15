# Character Sheet PDF Template Map

The Character Library PDF export uses local project-provided PDF templates in
`apps/web/public/assets/character-sheets/` for browser downloads.

Production distribution of these sheet assets should receive legal and asset
review before public release.

## Templates Found

| Template                                 | Public path                                                       | Pages | AcroForm fields | Use                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------- | ----: | --------------: | ------------------------------------------------------------------------------------------------- |
| `DnD_2024_Character-Sheet.pdf`           | `/assets/character-sheets/DnD_2024_Character-Sheet.pdf`           |     2 |               0 | Preferred for current and 2024-style rules profiles. Text is overlaid onto the existing template. |
| `dnd_5e_charactersheet_formfillable.pdf` | `/assets/character-sheets/dnd_5e_charactersheet_formfillable.pdf` |     3 |             334 | Preferred for legacy 2014-style rules profiles. AcroForm text fields are filled by name.          |

If the preferred template cannot be loaded or filled, the export falls back to
the repo-owned simple PDF layout and returns a visible fallback reason to the
UI.

## Template Selection

- `dnd-2025-srd-5-2-1` and `dnd-2024-free-rules` use the 2024 template.
- `dnd-2014-srd-5-1` and `dnd-2014-basic-rules` use the 2014 fillable
  template.
- Unknown or missing profile IDs resolve through the builder's default current
  profile and use the 2024 template if present.
- If one edition template is missing, the other local template is used before
  the simple fallback.

## 2014 AcroForm Field Map

The 2014 fillable PDF includes named fields. The MVP fills the following key
fields when present:

| Character data            | PDF fields                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Character name            | `CharacterName`, `CharacterName 2`                                                                                                                                                                                                          |
| Class and level           | `ClassLevel`                                                                                                                                                                                                                                |
| Species/race              | `Race `                                                                                                                                                                                                                                     |
| Background                | `Background`                                                                                                                                                                                                                                |
| Owner/dev player          | `PlayerName`                                                                                                                                                                                                                                |
| Ability scores            | `STR`, `DEX`, `CON`, `INT`, `WIS`, `CHA`                                                                                                                                                                                                    |
| Ability modifiers         | `STRmod`, `DEXmod `, `CONmod`, `INTmod`, `WISmod`, `CHamod`                                                                                                                                                                                 |
| Proficiency/combat basics | `ProfBonus`, `AC`, `Initiative`, `Speed`, `HPMax`, `HPCurrent`, `HPTemp`, `HDTotal`, `HD`                                                                                                                                                   |
| Saving throw values       | `ST Strength`, `ST Dexterity`, `ST Constitution`, `ST Intelligence`, `ST Wisdom`, `ST Charisma`                                                                                                                                             |
| Skill values              | `Acrobatics`, `Animal`, `Arcana`, `Athletics`, `Deception `, `History `, `Insight`, `Intimidation`, `Investigation `, `Medicine`, `Nature`, `Perception `, `Performance`, `Persuasion`, `Religion`, `SleightofHand`, `Stealth `, `Survival` |
| Passive Perception        | `Passive`                                                                                                                                                                                                                                   |
| Languages/tools/skills    | `ProficienciesLang`                                                                                                                                                                                                                         |
| Equipment metadata        | `Equipment`                                                                                                                                                                                                                                 |
| Rules profile/features    | `Features and Traits`                                                                                                                                                                                                                       |
| Concept/notes             | `PersonalityTraits `, `Ideals`, `Bonds`                                                                                                                                                                                                     |
| Spellcasting metadata     | `Spellcasting Class 2`, `SpellcastingAbility 2`, `SpellSaveDC  2`, `SpellAtkBonus 2`                                                                                                                                                        |
| Spell names               | `Spells 1014` through the later `Spells ...` fields                                                                                                                                                                                         |

The sheet also contains image button fields such as `CHARACTER IMAGE`, but this
slice does not embed portraits.

## 2024 Overlay Map

The provided 2024 PDF does not expose usable AcroForm fields. The MVP preserves
the original PDF pages and overlays text at measured positions for:

- character name,
- class/level,
- species,
- background,
- rules profile label,
- ability scores and modifiers,
- proficiency bonus,
- AC, initiative, speed,
- HP maximum/current,
- proficiencies, languages, tools,
- equipment,
- notes/concept,
- spellcasting summary and spell names on page 2.

Coordinates may need refinement if the provided template changes.

## Not Yet Filled

- Portrait/image embedding is not implemented.
- Some official sheet checkboxes are not toggled because the field names are
  opaque and vary by template.
- Alignment, XP, currency, attacks, death saves, personality ideals/bonds/flaws,
  and detailed spell slot state are only partially filled or left blank when the
  persisted character entry does not contain that data.
- The export uses builder metadata; it does not implement spell effects,
  inventory rules, attacks, encumbrance, or level-up automation.
