# Fresh Product Playtest / Next-Goal Intake

## Intake Run

- Date: 2026-06-04
- Branch/build: local working tree after Phase 7 bridge-confidence closure
- Runtime code changed during intake: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Fresh Evidence

Fresh validation evidence collected during this intake:

- `corepack pnpm --filter @dnd/web test:smoke` passed.
- `corepack pnpm --filter @dnd/web test:smoke:two-profile` passed all 8 steps:
  authoritative server startup, Next runtime UI startup, separate DM/Player
  browser profiles, Training Room build, encounter start, Player join/recover,
  Player guardrails, and Player Local Reset isolation from the DM profile.
- `corepack pnpm --filter @dnd/web test:smoke:bridge-db` passed all 9 steps:
  DB readiness, DB-backed server startup, Next runtime UI startup,
  authenticated saved-character seeding, runtime session creation, Player
  saved-character submission, DM runtime-copy assignment, and authoritative
  runtime-copy/source-library separation validation.

## Product Read

- The Training Room Skirmish runtime baseline remains healthy in both
  one-profile and two-profile browser smoke coverage.
- The Character Library -> Runtime bridge baseline remains healthy in DB mode.
- No fresh runtime or bridge failure currently justifies extending Phase 6 or
  Phase 7 automatically.
- The next useful product-confidence gap is the persisted Character Library /
  Builder / PDF export journey itself: `/characters` has a documented manual
  DB-mode path, local rules-derived previews, portrait validation, persisted
  draft/finalized cards, and template-backed PDF export, but it has not been
  the focus of the newest browser evidence sequence.

## Closure Decision

- Close the current generic fresh-product intake as complete.
- Do not start another runtime polish or bridge confidence slice from the
  current evidence.
- Start the next milestone as a Character Library product-confidence pass,
  scoped to browser evidence and triage first.

## Recommended Next Milestone

Phase 8: Character Library Builder / Export Product Confidence.

### Phase 8 Slice 1: Character Library Builder / Export DB-Mode Browser Playtest Triage

Goal:

Run a fresh DB-mode browser playtest of the persisted Character Library Builder
and PDF export path, then decide whether the next task should be a narrow
Builder/Library/PDF polish slice or closure. Cover login/register, `/characters`
list, new character creation, portrait validation, rules-profile/species/class/
background choices, derived HP/AC/speed/proficiency previews, Save Draft,
reload persistence, Review/finalize, PDF export from Review and from the card,
and fallback messaging.

Recommended effort: `high`.

Why `high`:

- The slice is evidence/triage-first, but it crosses DB-mode auth, persisted
  Character Library rows, browser UI, local file/PDF export behavior, and
  English/Persian product copy.

Non-goals:

- No runtime protocol changes.
- No DB schema or migration changes.
- No production auth/security claims.
- No production asset storage.
- No full D&D automation, inventory, spell automation, or CRPG expansion.
- No changes to Character Library/runtime separation.

Acceptance target:

- A fresh browser playtest record exists for the Builder/Library/PDF path.
- Any blocker is classified as environment, harness/manual validation, UI copy,
  persistence/auth, PDF/export, or product-scope issue.
- The next slice is chosen from observed evidence only.

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings: none.

Minor findings:

- The recommended next milestone touches DB-mode auth and PDF export, so it
  should stay evidence/triage-first until a narrow implementation need is
  observed.

Uncertainties / missing evidence:

- This intake did not run a fresh `/characters` browser playtest yet.
- PDF download/open verification may require browser automation support or a
  manual artifact check in the next slice.

Recommended next action:

Implement Phase 8 Slice 1 as a browser playtest/triage slice before changing
Builder, Library, PDF, auth, or DB behavior.

## Post-Phase-8 Intake Run

- Date: 2026-06-05
- Branch/build: local working tree after Phase 8 Builder/Export closure
- Runtime code changed during intake: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Current Evidence

Fresh evidence available after Phase 8:

- Phase 6 Training Room Skirmish polish is closed for the currently triaged
  smoke and bilingual browser evidence.
- Phase 7 Character Library -> Runtime bridge confidence is closed for the
  current local single-process DB-mode browser path.
- Phase 8 Builder/Export confidence is closed for the current local
  single-process DB-mode browser path.
- `corepack pnpm --filter @dnd/web test:smoke:builder-export-db` now covers
  authenticated Persian draft persistence, browser reload, edit/review access,
  PNG portrait upload through the edit-page file input, persisted card portrait
  rendering, Review/card PDF artifact capture, card-level finalization, and
  finalized-state reread.

## Product Read

- The most recent Character Library work has strong technical confidence
  evidence, but it is still harness-led evidence rather than a fresh human-style
  usability pass.
- Continuing DB readiness, PDF artifact verification, portrait upload, runtime
  polish, or bridge confidence automatically would be scope creep without a new
  blocker.
- The next useful product-confidence target is a focused `/characters`
  usability playtest/triage pass: can a reviewer understand the Character
  Library, Builder, draft/finalized card states, portrait behavior, PDF export,
  and runtime-bridge affordance boundaries without internal implementation
  context?

## Closure Decision

- Close this post-Phase-8 intake as complete.
- Do not start another Phase 8 hardening slice from the current evidence.
- Start the next milestone as a Character Library usability playtest/triage
  slice, scoped to evidence and documentation first.

## Recommended Next Milestone

Character Library Usability Playtest Triage.

### Slice 1: Character Library Usability Playtest Triage

Goal:

Run a focused `/characters` browser usability pass in DB mode and record what a
reviewer can or cannot understand about the persisted Character Library product
surface. Cover login/register, empty library, draft card state, Builder
progression, save/reload, portrait affordance, finalized card state, PDF export
affordance, and the relationship between finalized saved entries and runtime
submission. Choose any follow-up slice only from observed evidence.

Recommended effort: `medium`.

Why `medium`:

- The task is evidence/triage-first and should not change DB schema, runtime
  protocol, auth semantics, PDF generation, portrait storage, or bridge
  behavior. It touches DB-mode setup and browser evidence, but the path already
  has a passing smoke harness.

Non-goals:

- No runtime protocol changes.
- No DB schema, migration, transaction, or auth changes.
- No production auth/security claims.
- No production asset storage or PDF compliance claims.
- No new Character Library -> Runtime bridge behavior.
- No combat automation, spell automation, inventory expansion, CRPG systems, or
  broader D&D systems.

Acceptance target:

- A fresh `/characters` usability triage record exists.
- Any issue is classified as UX/copy, i18n/RTL, persistence/auth, export,
  portrait, runtime-bridge affordance, environment, or product-scope issue.
- The next implementation slice, if any, is narrow and chosen from observed
  usability evidence only.

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings: none.

Minor findings:

- The next slice should stay triage-first because recent automation already
  proves the happy-path mechanics. The missing evidence is reviewer
  comprehension and product confidence, not another automatic harness
  expansion.

Uncertainties / missing evidence:

- No fresh human-style `/characters` usability pass has been recorded after
  Phase 8 closure.
- It is not yet known whether the strongest next issue is copy, visual
  hierarchy, empty/finalized states, PDF messaging, portrait messaging, or
  runtime-bridge affordance clarity.

Recommended next action:

Implement Character Library Usability Playtest Triage as an evidence-only
browser/docs slice before changing `/characters`, Builder, PDF, portrait,
auth, DB, or runtime bridge behavior.

## Post-Preview-Closure Intake Run

- Date: 2026-06-05
- Branch/build: local working tree after Character Sheet PDF Preview browser
  verification/closure
- Runtime code changed during intake: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Current Evidence After Preview Closure

Fresh evidence available after the latest closure:

- Phase 6 Training Room Skirmish runtime polish is closed for the currently
  triaged one-profile, two-profile, bilingual, and smoke evidence.
- Phase 7 Character Library -> Runtime bridge confidence is closed for the
  current local single-process DB-mode browser path.
- Phase 8 Builder/Export confidence is closed for the current local
  single-process DB-mode browser path.
- Character Library usability copy polish and Character Sheet PDF preview
  before download are implemented.
- The DB-mode Builder/Export smoke now verifies Review/card preview dialog
  content before download, including dialog controls, the Persian character
  name, printable LTR sheet surface, mapped sheet fields, PDF artifact capture,
  and explicit download from the preview dialog.

## Product Read

- The major individual mechanics now have local automated confidence: Training
  Room runtime, saved-character bridge, Builder/Export persistence, portrait,
  finalize, PDF artifact, and preview-before-download.
- The remaining product-confidence gap is not another isolated mechanic. It is
  the full product journey across surfaces: can a reviewer create or reuse a
  saved Character Library entry, understand that it is reusable, submit it from
  Player-mode `/runtime`, wait for DM assignment, see the runtime copy/source
  provenance, place/act in the Training Room, and recover without mistaking
  browser-local state for authoritative state?
- Continuing DB readiness, PDF export, portrait upload, runtime polish, or
  bridge confidence automatically would repeat closed sequences without fresh
  evidence.

## Closure Decision

- Close this fresh product-confidence target intake as complete.
- Do not start another isolated PDF, portrait, DB readiness, bridge, or runtime
  polish slice from the current evidence.
- Start the next milestone as an end-to-end saved-character-to-Training-Room
  product-flow playtest/triage slice.

## Recommended Next Milestone

End-to-End Saved Character To Training Room Product-Flow Playtest Triage.

### Slice 1: Saved Character To Training Room Product-Flow Triage

Goal:

Run an evidence-first browser/manual triage pass for the full current product
loop: authenticated Character Library entry, finalized saved-character card,
Player-mode runtime saved-character submission, DM pending-assignment preview,
DM assignment of the separate runtime copy, token placement, Training Room
encounter start, first move/attack/action feedback, local reset/recovery, and
English/Persian scanability. Choose any implementation follow-up only from
observed evidence.

Recommended effort: `medium`.

Why `medium`:

- The task is triage/readout-first and should not change protocol, DB schema,
  auth, runtime commands, PDF generation, portrait storage, or bridge behavior.
  It crosses multiple product surfaces, but the underlying mechanics already
  have passing smoke evidence.

Non-goals:

- No runtime protocol changes.
- No DB schema, migration, transaction, idempotency, outbox, or auth changes.
- No production auth/security claims.
- No production asset storage or PDF compliance claims.
- No new Character Library -> Runtime bridge behavior.
- No combat automation, spell automation, inventory expansion, CRPG systems,
  fog of war, replay/catch-up semantics, or broader D&D systems.
- No implementation during the triage unless a fresh blocker is found and a
  separate narrow implementation prompt is approved.

Acceptance target:

- A fresh end-to-end product-flow triage record exists.
- Any issue is classified as UX/copy, i18n/RTL, persistence/auth, export,
  portrait, runtime-bridge affordance, runtime action clarity, recovery/local
  state, environment, or product scope.
- The next implementation slice, if any, is narrow and chosen from observed
  end-to-end evidence only.

Suggested validation / evidence:

- `corepack pnpm --filter @dnd/db check:readiness`
- `corepack pnpm --filter @dnd/web test:smoke:builder-export-db`
- `corepack pnpm --filter @dnd/web test:smoke:bridge-db`
- `corepack pnpm --filter @dnd/web test:smoke:two-profile`
- Optional manual/browser notes using `docs/manual-validation.md`, focused on
  the saved-character-to-runtime Training Room flow rather than repeating all
  backend curl checks.

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings: none.

Minor findings:

- The next slice should stay triage-first because the missing evidence is
  cross-surface product comprehension, not a known mechanics failure.

Uncertainties / missing evidence:

- No fresh human-style end-to-end run has been recorded after the PDF preview
  closure.
- It is not yet known whether the strongest next issue is Character Library
  affordance clarity, Player-mode submission clarity, DM assignment preview
  clarity, Training Room action hierarchy, recovery/local reset wording, or
  bilingual scanability.

Recommended next action:

Status: implemented in
`docs/delivery/SAVED_CHARACTER_TRAINING_ROOM_PRODUCT_FLOW_TRIAGE.md`.

Next action: implement the combined saved-character-to-Training-Room browser
evidence harness as a narrow test/harness slice before changing `/characters`,
`/runtime`, Builder, PDF, portrait, auth, DB, bridge behavior, or runtime
commands.
