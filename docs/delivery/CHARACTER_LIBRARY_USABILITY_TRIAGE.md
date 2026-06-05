# Character Library Usability Playtest Triage

## Slice 1: Character Library Usability Playtest Triage

- Date: 2026-06-05
- Branch/build: local working tree after Phase 8 Builder/Export closure
- Runtime code changed during triage: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Goal

Run a focused `/characters` DB-mode usability triage pass and decide whether
the next task should be a narrow product polish slice. This is evidence-first:
do not change `/characters`, Builder, PDF, portrait, auth, DB, runtime protocol,
or Character Library -> Runtime bridge behavior during triage.

## Evidence Collected

Validation / browser harness:

- `corepack pnpm --filter @dnd/db check:readiness` passed:
  the local `dnd_web` database connection is OK, UTF8 encoding is verified, and
  the required tables are present.
- `corepack pnpm --filter @dnd/web test:smoke:builder-export-db` passed all 9
  steps: DB-mode configuration, UTF-8 readiness, DB-backed authoritative
  server startup, Next `/characters` startup, authenticated Persian draft
  creation, persisted browser reload, portrait upload persistence, Review PDF
  artifact capture, card-level finalization, card PDF artifact capture, and
  finalized-state reread.
- The smoke reported a non-product cleanup warning while removing a temporary
  Chrome directory with `EPERM`. The smoke itself passed.

Source / UX inspection:

- `/characters` uses the existing `I18nProvider`, and the primary Character
  Library title, finalize action, finalize pending state, and finalize notices
  are localized.
- `/runtime` Player mode has explicit saved-entry -> runtime-copy copy that
  explains the saved Character Library entry remains reusable and live HP,
  movement, conditions, and DM overrides do not mutate it.
- `/runtime` DM mode assignment request copy explicitly labels runtime copies
  and source library entries.
- The `/characters` shell still has a high-traffic `Builder` nav label
  hardcoded in English.
- The `/characters` library intro/body and PDF/card export affordances include
  hardcoded Persian copy. In English mode, this can make the library card and
  PDF export path feel mixed-locale even though the underlying behavior works.
- Card-level PDF buttons and PDF failure/success notices are the strongest
  observed usability/copy gap because they sit beside the finalized card state
  and export affordance that the reviewer needs to trust.

## Triage Findings

Passed / healthy:

- Persistence/auth: the DB-mode happy path is healthy in the local
  single-process harness.
- Portrait: PNG upload through the edit-page file input persists and renders on
  the library card.
- Export: Review/card PDF artifacts are generated and verified by the browser
  harness.
- Finalized state: draft finalization through the `/characters` card UI
  persists and enables card export.
- Runtime boundary: source inspection confirms saved-entry submission copy
  still describes a separate runtime copy and reusable library entry.

Observed UX/copy issues:

- `UX/copy`: the Character Library shell nav mixes a hardcoded English
  `Builder` label with localized navigation.
- `i18n/RTL`: library card PDF labels, pending labels, and PDF failure copy are
  hardcoded Persian in the Character Library card surface, so English mode can
  show mixed-locale export controls.
- `UX/copy`: the current harness proves mechanics, but there is still no
  reviewer-style note that a finalized saved entry should be taken to
  `/runtime` Player mode for submission; the boundary is clearer in runtime
  than on the `/characters` card surface itself.

No current blocker:

- No DB readiness blocker.
- No persistence/auth blocker.
- No portrait persistence blocker.
- No PDF artifact blocker.
- No Character Library/runtime separation blocker.

## Recommended Next Slice

Character Library Card Export / Bridge-Affordance Copy Polish.

Recommended effort: `medium`.

Goal:

Polish high-traffic `/characters` library/card copy so the Builder nav, library
intro, card PDF export controls, PDF notices, and finalized saved-entry ->
runtime-submission affordance are localization-aware and understandable in both
English and Persian. Keep this frontend/i18n-only.

Scope:

- Localize the hardcoded `Builder` nav label in the Character Library shell.
- Move card-level PDF labels, pending copy, success/failure notices, and library
  intro copy into the existing i18n system.
- Add a small finalized-card hint or existing-link copy, if needed, that says a
  finalized saved entry can be submitted from Player-mode `/runtime` while live
  runtime changes remain separate.
- Preserve canonical IDs, class/species/background names, `PDF`, `runtime`,
  `DM`, `HP`, `AC`, and source/runtime identifiers where intentionally stable.

Non-goals:

- No runtime protocol changes.
- No DB schema, migration, transaction, idempotency, outbox, or auth changes.
- No PDF generation/template behavior changes.
- No portrait storage behavior changes.
- No new Character Library -> Runtime bridge behavior.
- No combat automation, spell automation, inventory expansion, CRPG systems,
  production auth/security, production asset storage, replay/catch-up, or
  broader D&D systems.

Suggested validation:

- `git diff --check`
- `.\node_modules\.bin\prettier.CMD --check apps/web/app/characters/character-builder-ui.tsx apps/web/lib/i18n.tsx docs/delivery/CHARACTER_LIBRARY_USABILITY_TRIAGE.md`
- `..\..\node_modules\.bin\tsc.CMD --noEmit` from `apps/web`
- `corepack pnpm --filter @dnd/web test`
- `corepack pnpm --filter @dnd/web test:smoke:builder-export-db` if the polish
  changes PDF/finalize/card text that the smoke depends on

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings:

- The next slice should stay frontend/i18n-only. The observed gap is
  reviewer-facing copy and mixed-locale affordances, not mechanics.

Minor findings:

- The passing smoke has a non-product temp-directory cleanup warning:
  `EPERM` while removing a temporary Chrome directory. This does not block the
  Character Library product path, but it may leave local temp folders behind.

Uncertainties / missing evidence:

- This triage used the DB-mode browser smoke plus source/manual-flow
  inspection. It did not record screenshots from a separate human browser
  session.
- It is still worth checking the follow-up polish in both English and Persian
  after implementation, because the observed issue is mixed-locale UI copy.

## Slice 2: Character Library Card Export / Bridge-Affordance Copy Polish

- Date: 2026-06-05
- Runtime code changed during implementation: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Implementation:

- Localized the Character Library shell badge and `Builder` nav label.
- Moved high-traffic Character Library intro, create/edit/card action labels,
  armor class label, PDF button labels, PDF pending copy, PDF success/failure
  notices, and pending card affordance labels into the existing i18n system.
- Added a finalized-card hint explaining that saved entries are submitted from
  Player-mode `runtime`, where the server creates a separate runtime copy and
  live HP, movement, conditions, and DM overrides do not mutate the reusable
  Character Library entry.
- Kept all PDF generation, portrait storage, auth, DB, runtime protocol, and
  bridge behavior unchanged.

Validation evidence:

- `.\node_modules\.bin\prettier.CMD --write apps/web/app/characters/character-builder-ui.tsx apps/web/lib/i18n.tsx`
- `..\..\node_modules\.bin\tsc.CMD --noEmit` from `apps/web`
- `corepack pnpm --filter @dnd/web test`
- `corepack pnpm --filter @dnd/web test:smoke:builder-export-db`

Boundary review:

- Pass. This slice is frontend/i18n-only copy polish. It does not alter server
  authority, DM role gates, DB schema, auth/session semantics, PDF generation,
  portrait storage, Character Library/runtime separation, runtime bridge
  behavior, replay/cursor/catch-up claims, outbox semantics, combat automation,
  or broader D&D systems.
- The new finalized-card copy reinforces the existing boundary: saved
  Character Library entries stay reusable, and live runtime overlays belong to
  separate runtime copies.

Remaining limitations:

- The polish was validated through unit/typecheck coverage and the DB-mode
  Builder/Export smoke. It was not separately screenshot-reviewed in both
  English and Persian browser viewports.
- Search/filter/sort controls still have older Character Library copy patterns
  that may deserve a later small pass if fresh browser evidence says they are
  confusing.

## Slice 3: Character Sheet PDF Preview Before Download

- Date: 2026-06-05
- Runtime code changed during implementation: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Implementation:

- Changed the Review/Sheet PDF buttons and Character Library card PDF buttons
  so they open a web preview first instead of immediately starting a download.
- Added a reusable Character Sheet preview dialog that renders a simple
  D&D-sheet-like HTML page from the same mapped character fields used by PDF
  generation.
- Kept PDF download inside the preview dialog. The downloaded PDF still comes
  from the existing local template/fallback generator.
- Updated the DB-mode Builder/Export smoke so it verifies preview readiness,
  PDF artifact generation, and explicit download from the preview dialog.

Validation evidence:

- `.\node_modules\.bin\prettier.CMD --write apps/web/lib/character-sheet-pdf.ts apps/web/app/characters/character-sheet-pdf-preview.tsx apps/web/app/characters/character-builder-ui.tsx apps/web/app/characters/simple-builder/components/sheet/CharacterSheet.tsx apps/web/lib/i18n.tsx apps/web/lib/character-library-mappers.test.ts apps/web/scripts/character-builder-export-db-smoke.mjs`
- `..\..\node_modules\.bin\tsc.CMD --noEmit` from `apps/web`
- `corepack pnpm --filter @dnd/web test`

Boundary review:

- Pass. This slice is frontend/PDF UX only. It does not alter server
  authority, DM role gates, DB schema, auth/session semantics, Character
  Library/runtime separation, runtime bridge behavior, PDF template semantics,
  portrait storage, replay/cursor/catch-up claims, outbox semantics, combat
  automation, or broader D&D systems.

Remaining limitations:

- The preview is an HTML approximation of the provided D&D sheets using the
  same mapped fields, not a pixel-perfect reconstruction of every official PDF
  field.
- A separate screenshot/browser visual pass is still useful to tune spacing and
  verify English/Persian mode scanability.

Recommended next slice:

Run a narrow Character Sheet PDF Preview browser visual verification/closure
pass. Recommended effort: `medium`.
