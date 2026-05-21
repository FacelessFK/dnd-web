# i18n Policy

## Product Constraint

DND-web supports English and Persian. This is a product constraint, not a theme
option or future nice-to-have.

Future work on Player surfaces, DM surfaces, Character Builder flows, runtime
copy, validation messages, errors, empty states, and success states must
preserve bilingual support.

## Current Direction

The web app uses `I18nProvider`. English is LTR. Persian is RTL.

The current Character Builder direction includes English/Persian UI copy and
localization helpers. Future UI work should follow that direction rather than
adding isolated hardcoded strings.

## Rules

- Keep user-facing strings localization-aware.
- Do not hardcode new user-facing copy outside the localization system when it
  belongs in product UI.
- Preserve LTR/RTL layout behavior.
- Do not store localized labels as canonical IDs.
- Keep canonical IDs stable: `rulesProfileId`, class/species/background/spell
  IDs, ability keys, command types, and database IDs.
- Do not auto-translate user-entered character data.
- Keep validation, error, status, empty-state, and success copy designed for
  translation.
- Avoid English-only UI assumptions in future product/UX docs and prompts.

## Player And DM Surfaces

Both Player and DM surfaces must preserve bilingual support.

Examples:

- runtime launcher labels;
- scene/encounter controls;
- DM override controls;
- player action and movement affordances;
- pending assignment states;
- Character Library list and cards;
- Character Builder steps;
- PDF/export status messages;
- auth/session messages.

## Implementation Guidance

When adding user-facing UI:

1. inspect existing i18n patterns first;
2. add keys/copy in the established location;
3. check both English and Persian strings;
4. preserve LTR/RTL behavior;
5. keep canonical IDs and localized labels separate;
6. include i18n expectations in tests or manual validation when practical.

## Documentation Guidance

Product and UX docs should explicitly mention English/Persian compatibility
when describing user flows, labels, validation copy, and DM/player-facing text.
