---
name: dnd-i18n
description: Add or change user-facing copy in DND-web while preserving English/Persian bilingual support and LTR/RTL layout. Use whenever a task touches labels, validation messages, errors, empty states, status text, or any string a user reads.
---

# DND-web i18n Work

English and Persian support is a **product constraint**, not a theme option.
Persian (`fa`) is the default locale and renders RTL; English (`en`) is LTR.

## Where Copy Lives

| Surface                                            | File                                                     |
| -------------------------------------------------- | -------------------------------------------------------- |
| `/runtime`, `/characters`, `/login`, shared chrome | `apps/web/lib/i18n.tsx`                                  |
| Simple Builder step UI                             | `apps/web/app/characters/simple-builder/localization.ts` |
| SRD-style rules data labels                        | `apps/web/lib/character-builder-rules-data.ts`           |

Do not add a third mechanism. Use the one that already serves the surface.

## How `i18n.tsx` Works

```ts
const messages = {
  en: { 'panel.title': 'Encounter Status' /* … */ },
  fa: { 'panel.title': 'وضعیت درگیری' /* … */ },
} satisfies Record<Locale, Record<string, string>>;

type Messages = typeof messages.en;
type MessageKey = keyof Messages;
```

Consequences you must work with, not around:

- **`en` defines the key set.** Any key added to `en` and missing from `fa` is a
  typecheck error. That is the guardrail — fix it by writing the Persian string,
  never by loosening the type or falling back to English.
- Lookup is `messages[locale][key] ?? messages.en[key] ?? key`, so a wrong key
  silently renders as the key itself. Grep for the key after adding it.
- Interpolation is `{name}` placeholders replaced via
  `t('key', { name: value })`. Keep placeholder names identical in `en` and `fa`.
- Keys are flat dotted strings, alphabetically grouped by prefix
  (`common.*`, `home.*`, `nav.*`, `page.*`, `runtime.*`). Insert new keys into
  the existing alphabetical position in **both** maps.

Consume with `const { t, dir, locale } = useI18n()`.

## Rules

1. **No hardcoded user-facing strings** in components. If a user reads it, it
   goes through `t()`.
2. **Canonical IDs are never localized.** `rulesProfileId`, class / species /
   background / spell IDs, ability keys, command types, session IDs, and
   database IDs stay stable English identifiers. Localize the _label_, not the
   ID.
3. **Never auto-translate user-entered data.** Character names, backstory, and
   notes render exactly as typed.
4. **Some tokens stay English on purpose** even in Persian copy: `runtime`,
   `Session ID`, `SSE`, `DM`, `HP`, `AC`, server URLs, protocol/debug payload
   names, dice notation, and command IDs. This is an established convention in
   this repo — match the surrounding panels rather than translating them.
5. **Validation, error, empty-state, and success copy must be translatable.**
   Do not build sentences by concatenating fragments; use one key with
   placeholders.
6. **Preserve RTL layout.** Prefer logical CSS (`ms-*`/`me-*`, `ps-*`/`pe-*`,
   `text-start`/`text-end`) over `left`/`right`. `dir` from `useI18n()` is
   available when a component genuinely needs to branch.

## Writing Persian Copy

- Match the tone of the existing Persian strings — direct and operational, not
  literal machine translation of the English.
- Mixed Persian + Latin identifier rows are common in this product; keep them
  scannable by keeping the identifier at a predictable edge of the row.
- Numerals: follow the surrounding panel's existing choice rather than
  introducing a new one.

## Validate

```bash
corepack pnpm typecheck                      # catches missing fa keys
corepack pnpm --filter @dnd/web build
corepack pnpm --filter @dnd/web test:smoke   # if the copy is in /runtime
```

For anything visually significant, check both locales in the browser and confirm
the RTL layout does not overflow or reverse an intentionally LTR identifier.
