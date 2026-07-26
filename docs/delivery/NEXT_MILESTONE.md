# Next Milestone

## Current Status Addendum

Status as of 2026-06-05: the Training Room Skirmish polish sequence, Character
Library -> runtime bridge confidence sequence, and saved-character-to-Training
Room combined DB-mode browser evidence harness are complete for the current
local evidence. The combined harness is available as:

```bash
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

The fresh product-confidence intake and Combined Harness Evidence Closure
Packet after the combined harness are complete. The Human Review / Merge
Decision packet approved the reviewed slice with cautions, and the Curated
Merge Or Optional Screenshot Packet recommended curated merge preparation. The
curated slice has now landed on `main` as merge commit `c8d4015`, and the
Post-Merge Main Verification / Closure packet is complete in
`docs/delivery/POST_MERGE_MAIN_VERIFICATION_CLOSURE.md`. The next useful step
is a fresh human-approved product goal or playtest brief, or a separately
approved optional screenshot packet only if visual reviewer evidence is needed.
Do not automatically expand into runtime protocol, replay/catch-up, production
auth, DB/auth schema work, Character Library bridge behavior, PDF/portrait
mechanics, combat automation, or broader D&D systems without fresh evidence
and approval.

## Recommendation

Training Room Skirmish / Phase 6 playable flow polish.

The Character Library -> runtime assignment bridge already has a server-side
path, Player-mode submit UI, DM preview/assignment flow, and narrow DB
transaction/outbox coverage on the injected DB path. The next useful milestone
is to make the first named demo scenario feel coherent for a real DM-player
playtest without adding new protocol, combat automation, replay, or production
auth scope.

## Goal

Polish the Training Room Skirmish presentation and manual playtest script so a
reviewer can run the named scenario, understand the product direction, and see
the current DM-first tabletop loop through existing runtime commands and current
local sample data.

## Scope

- Keep the named Training Room Skirmish scenario as the first playable demo
  path.
- Clarify DM setup, scene state, player readiness, assignment, turn state,
  encounter status, recovery status, and action feedback where the current UI
  already exposes those concepts.
- Tighten English/Persian copy and preserve LTR/RTL behavior.
- Improve manual playtest guidance around the existing scenario.
- Keep existing read-model recovery through `reconnect_session`, `get_scene`,
  `get_active_scene_state`, `get_encounter_state`, and `get_character`.
- Document current limitations directly and honestly.

## Non-Goals

- New runtime protocol or command semantics.
- New combat rules automation, full spell automation, ranged/inventory/death
  save systems, opportunity attacks, or monster AI.
- Fog of war, line of sight, lighting, traps, locks, scripts, or automatic
  transition automation.
- Durable replay, stream cursors, catch-up API, exactly-once delivery, startup
  auto-redelivery, or multi-process subscriber coordination.
- Production auth, account security expansion, deployment, monitoring, or
  alerting.
- Mutating reusable Character Library entries with live HP, placement,
  conditions, movement usage, encounter membership, or DM overrides.

## Risks

- Accidentally turning a presentation polish slice into protocol or combat-rule
  work.
- Adding English-only copy or breaking Persian RTL layout.
- Making the browser appear authoritative instead of rendering server responses
  and read models.
- Suggesting that outbox visibility or read-model recovery is replay/catch-up.
- Hiding known MVP limits behind demo-only copy.

## Acceptance Criteria

- The named Training Room Skirmish path remains runnable with existing runtime
  commands and current local sample data.
- The DM can understand the next setup/play action without reading protocol
  JSON.
- Player and DM surfaces keep assignment, readiness, turn, encounter, and
  recovery state clear enough for a manual playtest.
- New or changed user-facing copy is localization-aware and preserves
  English/Persian direction.
- Docs continue to state that SSE is live delivery only and clients recover
  current truth through read models.
- No new claims are made for replay, stream cursors, catch-up, exactly-once
  delivery, multi-process coordination, production auth, or broader D&D
  automation.

## Suggested Small Slices For Codex

### Slice 1: Scenario Presentation Audit

Inspect the current named demo scenario setup, runtime sample data, manual
validation script, and smoke path. Identify only the UI/docs wording needed to
make the existing flow easier to run.

### Slice 2: Training Room Skirmish Presentation Polish

Tighten the scenario-facing runtime copy and state presentation without changing
runtime protocol, combat semantics, auth, DB requirements, or read-model
recovery behavior.

### Slice 3: Manual Playtest Script Pass

Update the manual validation path so a reviewer can run the Training Room
Skirmish flow, recover after refresh, confirm Player-mode guardrails, and see
known limitations without internal implementation context.

Status: implemented.

### Slice 4: Playtest Evidence Triage

Use one completed Training Room Skirmish run template and checklist result to
choose the next narrow UI polish slice. Keep this as triage only unless a human
explicitly approves implementation. Do not broaden into protocol, combat
automation, replay/catch-up, production auth, or broader D&D systems.

Status: implemented from the Codex browser run recorded in
`docs/delivery/TRAINING_ROOM_SKIRMISH_CODEX_BROWSER_RUN.md`.

### Slice 5: Persian / RTL Runtime Status Polish

Polish Persian/RTL scanability for the Training Room runtime status and setup
panels by localizing remaining high-traffic demo/status labels and making mixed
Persian plus canonical ID rows easier to scan. Keep this frontend-only and do
not change runtime protocol, command semantics, combat automation, auth, DB
requirements, or read-model recovery behavior.

Status: implemented.

### Slice 6: Post-Slice-5 Playtest Evidence Triage

Use the completed one-profile and two-profile Training Room smoke evidence plus
source inspection to choose the next narrow UI polish slice. Keep this as
triage only unless a human explicitly approves implementation. Do not broaden
into protocol, combat automation, replay/catch-up, production auth, DB/auth
requirements, or broader D&D systems.

Status: implemented from the post-Slice-5 triage recorded in
`docs/delivery/TRAINING_ROOM_SKIRMISH_CODEX_BROWSER_RUN.md`.

### Slice 7: Persian Readiness / Roster Microcopy Polish

Polish remaining Persian readiness/roster microcopy in the Training Room flow by
replacing mixed English/Persian high-traffic labels with localization-aware
Persian equivalents while preserving canonical IDs, `runtime`, `Session ID`,
and server URLs where they are intentionally stable. Keep this
frontend/i18n-only and do not change runtime protocol, command semantics,
combat automation, auth, DB requirements, or read-model recovery behavior.

Status: implemented.

### Slice 8: Persian Table Setup / Disabled Helper Microcopy Polish

Polish remaining Persian Table Setup and disabled-reason helper copy in the
Training Room flow by replacing mixed English/Persian setup blockers with
localization-aware Persian equivalents while preserving canonical IDs,
`runtime`, `Session ID`, server URLs, and protocol/debug labels where they are
intentionally stable. Keep this frontend/i18n-only and do not change runtime
protocol, command semantics, combat automation, auth, DB requirements, or
read-model recovery behavior.

Status: implemented.

### Slice 9: Persian Assignment Bridge Microcopy Polish

Polish remaining Persian Assignment Request and Character Library bridge copy in
the Training Room flow by replacing mixed English/Persian helper terms such as
`pending`, `preview`, `submit`, `recover`, and `session` with
localization-aware Persian equivalents while preserving canonical IDs,
`runtime`, `Session ID`, source-library identifiers, server URLs, and
protocol/debug labels where they are intentionally stable. Keep this
frontend/i18n-only and do not change runtime protocol, command semantics,
Character Library/runtime separation, combat automation, auth, DB requirements,
or read-model recovery behavior.

Status: implemented.

### Slice 10: Persian Recovery / Stream Status Microcopy Polish

Polish remaining Persian Recovery Status, stream/event-feed, and active-scene
status copy in the Training Room flow by replacing mixed English/Persian helper
terms such as `session`, `scene`, `read model`, `stream`, `subscribe`,
`recover`, `feed`, and `condition` with localization-aware Persian equivalents
while preserving canonical IDs, `runtime`, `Session ID`, SSE, server URLs, and
protocol/debug labels where they are intentionally stable. Keep this
frontend/i18n-only and do not change runtime protocol, command semantics,
replay/catch-up claims, SSE behavior, combat automation, auth, DB requirements,
or read-model recovery behavior.

Status: implemented.

### Slice 11: Persian Debug / Scene Builder Helper Microcopy Polish

Polish remaining Persian Debug panel and Scene Builder helper copy in the
Training Room flow by replacing mixed English/Persian helper terms such as
`Payload`, `protocol`, `debug`, `command`, `ledger`, `entity`, `cell`, and
draft/prerequisite wording with localization-aware Persian equivalents while
preserving canonical command IDs, protocol payload names, `SSE`, server URLs,
and debug labels where they are intentionally stable. Keep this
frontend/i18n-only and do not change runtime protocol, command semantics,
scene authority, combat automation, auth, DB requirements, or read-model
recovery behavior.

Status: implemented.

### Slice 12: Persian Combatant / DM Override Helper Microcopy Polish

Polish remaining Persian Combatant, action, and DM override helper copy in the
Training Room flow by replacing mixed English/Persian helper terms such as
`combatant`, `attack`, `target`, `damage`, `override`, `turn`, `movement`,
`reaction`, and draft/prerequisite wording with localization-aware Persian
equivalents while preserving canonical command IDs, `DM`, `HP`, `AC`,
`monster/NPC`, dice notation, protocol/debug labels, and server-owned combat
authority where they are intentionally stable. Keep this frontend/i18n-only
and do not change runtime protocol, command semantics, target legality,
damage automation, turn validation, auth, DB requirements, or read-model
recovery behavior.

Status: implemented.

### Slice 13: Post-Microcopy Phase 6 Closure Triage

Use the completed one-profile and two-profile Training Room smoke evidence plus
a bilingual browser pass to decide whether Phase 6 presentation work can close
or needs one final narrow UI polish slice. Keep this as evidence/triage only
unless a human explicitly approves implementation. Do not broaden into runtime
protocol, combat automation, replay/catch-up, production auth, DB/auth
requirements, or broader D&D systems.

Recommended effort: `medium`.

Status: implemented from the post-Slice-12 bilingual browser and smoke triage
recorded in `docs/delivery/TRAINING_ROOM_SKIRMISH_CODEX_BROWSER_RUN.md`.

Closure decision: keep Phase 6 open for one final narrow frontend/i18n polish
slice.

### Slice 14: Persian Residual Runtime Status / Validation Copy Closure

Close the remaining high-traffic Persian runtime copy gaps found by the Slice
13 bilingual browser pass: transition-draft validation and disabled reasons,
combatant-selection disabled reasons, derived empty/status values such as
`No active turn` and `none`, and character-card stat/status labels. Preserve
canonical IDs, command IDs, `DM`, `HP`, `AC`, `monster/NPC`, class/sample
names, dice notation, protocol/debug labels, and server-owned runtime
authority. Keep this frontend/i18n-only and do not change runtime protocol,
command semantics, combat automation, replay/catch-up, auth, DB requirements,
or read-model recovery behavior.

Recommended effort: `medium`.

Status: implemented.

Closure decision: the currently triaged Phase 6 Training Room presentation
work is complete. Choose any further Phase 6 polish from new playtest evidence
rather than extending the microcopy sequence automatically.

## Post-Phase-6 Playtest And Next-Milestone Triage

Fresh one-profile and two-profile smoke evidence plus a bilingual DM/Player
browser playtest confirm that the Training Room flow remains functional and
its server-authoritative guardrails remain intact. The strongest remaining
product issue is runtime action hierarchy rather than missing capability:
current-role primary actions sit several viewports below the Tactical Grid and
current-turn guidance.

### Post-Phase-6 Slice 1: Role-Focused Runtime Primary Actions

Reorder existing `/runtime` panels so the current role's primary action surface
stays near the Tactical Grid and current-turn guidance. During an active
encounter, show `Turn & Target` before DM authoring panels; when a Player has
an assigned character or active turn, show it before Player Character
onboarding and secondary status panels. Preserve the no-encounter setup path,
existing controls, commands, server validation, DM gates, Character
Library/runtime separation, English/Persian i18n, RTL/LTR behavior, and
recovery semantics.

Do not duplicate action controls, add sticky action bars, change protocol or
command semantics, add combat automation, claim replay/catch-up behavior, or
broaden into additional D&D systems.

Recommended effort: `medium`.

Status: implemented. The existing `Turn & Target` panel now promotes above DM
authoring panels during active encounters and above Player onboarding after the
Player has an assigned character or active turn, without duplicating controls
or changing runtime commands.

### Post-Phase-6 Slice 2: Fresh Browser Playtest & Residual UX Triage

Rerun the Training Room browser evidence after Slice 1 to decide whether the
post-Phase-6 role-focused action hierarchy needs another narrow UX polish slice
or whether this polish sequence should close. Keep this evidence/triage-only:
do not add new runtime commands, duplicate controls, sticky action bars, combat
automation, replay/catch-up semantics, production auth, DB requirements, or
broader D&D systems.

Recommended effort: `medium`.

Status: implemented from fresh one-profile and two-profile browser smoke
evidence. The two-profile smoke now verifies the promoted `Turn & Target`
hierarchy for active DM and Player flows, and no residual blocking UX issue was
found that justifies extending this polish sequence automatically.

Closure decision: close the current post-Phase-6 action-hierarchy polish
sequence. Choose the next milestone from a fresh human-approved product goal or
playtest brief rather than extending runtime UI polish by default.

## Phase 7: Character Library Runtime Bridge Confidence

The next milestone focuses on proving and tightening the saved Character
Library -> Runtime bridge as a DM-first tabletop product flow. The bridge
already has server-side command support, Player-mode saved-character submit UI,
DM pending-assignment preview, separate runtime copies, and narrow DB
transaction/outbox coverage on covered paths. Phase 7 should improve confidence
and repeatability before adding new runtime capabilities.

### Phase 7 Slice 1: Character Library -> Runtime Bridge DB-Mode Playtest Triage

Use docs and automated evidence to determine whether the DB-mode bridge needs a
new implementation slice, a repeatable browser playtest harness, or a product
scope reset. Keep this evidence/triage-only. Do not add new protocol, schema,
combat automation, replay/catch-up semantics, production auth, or broad D&D
systems.

Recommended effort: `high`.

Status: implemented. Server and web tests passed and cover the core bridge
behavior, including authenticated ownership isolation, runtime-copy creation,
pending assignment, duplicate retry idempotency, and reusable library-entry
separation. A real browser DB-mode pass was blocked because `DATABASE_URL` was
not available in this shell.

### Phase 7 Slice 2: Character Library -> Runtime Bridge DB-Mode Browser Playtest Harness

Create or document a repeatable DB-mode browser playtest harness for the saved
Character Library -> Runtime bridge path. It should make the existing manual
validation path easy to rerun with a known DB-mode setup: login, finalized
saved character availability, Player `/runtime` submission, DM pending
assignment preview, DM assignment, and runtime-copy/source-library provenance
after assignment.

Preserve HttpOnly-cookie auth behavior and do not print secrets. Do not add
new runtime protocol, DB schema, production auth claims, replay/catch-up
semantics, combat automation, or broader D&D systems.

Recommended effort: `high`.

Status: implemented. `apps/web/scripts/runtime-bridge-db-smoke.mjs` and
`corepack pnpm --filter @dnd/web test:smoke:bridge-db` now provide a
repeatable DB-mode browser harness for the saved Character Library -> Runtime
bridge. The harness requires a configured, migrated `DATABASE_URL`; it does not
create a database or run migrations implicitly.

Next recommendation: run the harness against a migrated DB environment and
treat any failure as the next narrow implementation slice.

### Phase 7 Slice 3: Run DB-Mode Bridge Harness & Failure Triage

Run the DB-mode bridge harness against the current local environment and turn
any failure into the next narrow implementation or setup slice. Keep this
evidence/triage-only unless the failure is inside the harness itself. Do not
change runtime protocol, DB schema, auth semantics, combat automation,
replay/catch-up behavior, or broader D&D systems.

Recommended effort: `high`.

Status: implemented. The harness now loads repo-local `.env` values before
checking `DATABASE_URL` and redacts loaded sensitive values from captured error
output. The harness then reached real DB-backed server startup, which failed
with PostgreSQL password authentication for user `dnd_web`; the browser bridge
phase did not run.

Next recommendation: **Phase 7 Slice 4: DB-Mode Local Environment Readiness
Check**. Add or document a non-secret preflight that verifies DB connection and
required migration tables before running the bridge browser harness.

### Phase 7 Slice 4: DB-Mode Local Environment Readiness Check

Add or document a non-secret DB readiness check that verifies `DATABASE_URL`,
opens a PostgreSQL connection, and confirms the required current migration
tables exist before the bridge browser harness starts server/browser processes.
Do not print `DATABASE_URL`, passwords, cookies, or raw connection strings. Do
not create/drop databases, run migrations implicitly, seed data, or change
runtime/Character Library records.

Recommended effort: `high`.

Status: implemented. `corepack pnpm --filter @dnd/db check:readiness` now
performs the non-mutating DB preflight, and `corepack pnpm --filter @dnd/web
test:smoke:bridge-db` runs it before DB-backed server and browser startup. In
the current local environment, the preflight still fails on PostgreSQL password
authentication for user `dnd_web`, so the browser bridge phase remains blocked.

Next recommendation: **Phase 7 Slice 5: Fix/Provision Local DB Credentials &
Migration State**. Make the local DB environment pass the readiness check, then
rerun the DB-mode bridge browser harness for real Player/DM evidence.

### Phase 7 Slice 5: Fix/Provision Local DB Credentials & Migration State

Make the local DB environment pass `corepack pnpm --filter @dnd/db
check:readiness`, apply the required migration state if needed, and rerun the
DB-mode bridge browser harness for real Player/DM evidence. Keep this as local
environment/setup plus validation work. Do not change runtime protocol, DB
schema, Character Library/runtime separation, combat automation,
replay/catch-up semantics, or production auth scope.

Recommended effort: `high`.

Status: implemented. PostgreSQL was already installed, but the existing system
service credentials were not usable and Docker Desktop was unavailable, so a
project-local PostgreSQL dev cluster was provisioned under the ignored
`apps/server/data/` tree on port `55432`. The local ignored `.env` DB endpoint
now targets that cluster, `packages/db/migrations/0001` through `0010` were
applied, `corepack pnpm --filter @dnd/db check:readiness` passes, and
`corepack pnpm --filter @dnd/web test:smoke:bridge-db` passes all 9 steps.

Next recommendation: **Phase 7 Slice 6: Bridge DB-Mode Evidence Closure & Next
Confidence Triage**. Use the now-passing browser harness evidence to decide
whether Phase 7 bridge confidence can close or needs one narrow follow-up.

### Phase 7 Slice 6: Bridge DB-Mode Evidence Closure & Next Confidence Triage

Use the passing DB-mode browser harness evidence to decide whether Phase 7
bridge confidence can close or needs one narrow follow-up. Keep this
evidence/triage-only unless a failure appears in current code. Do not add
runtime protocol, DB schema, production auth, replay/catch-up semantics, combat
automation, or broader D&D systems.

Recommended effort: `medium`.

Status: implemented. Phase 7 bridge confidence is closed for the current local
single-process DB-mode browser path. `corepack pnpm --filter @dnd/db
check:readiness` passes, and `corepack pnpm --filter @dnd/web
test:smoke:bridge-db` passes all 9 steps through Player saved-character
submission, DM runtime-copy assignment, and authoritative runtime-copy/source
library separation validation.

Closure decision: do not extend the bridge confidence sequence automatically.
Use fresh product/playtest evidence or a newly observed failure before starting
another bridge slice.

## Next Recommended Milestone: Fresh Product Playtest / Next-Goal Intake

Run or define the next human-approved product playtest goal before starting
another implementation sequence. Good candidates are a fresh Training Room
Skirmish DM-player playtest, Character Library builder/export polish triage, or
another narrow evidence-driven UX pass. Keep the next task scoped by observed
evidence and avoid adding runtime protocol, combat automation, production auth,
replay/catch-up semantics, or broader D&D systems by default.

Recommended effort: `medium`.

Status: implemented. Fresh runtime one-profile smoke, runtime two-profile
smoke, and DB-mode bridge smoke passed. No fresh runtime or bridge failure
justifies extending Phase 6 or Phase 7 automatically. The next product
confidence gap is the persisted Character Library Builder / PDF export journey,
which is documented for manual DB-mode validation but has not been the focus of
the newest browser evidence sequence.

## Phase 8: Character Library Builder / Export Product Confidence

The next milestone should prove the persisted Character Library Builder and PDF
export journey as a reusable-character product surface before adding more
runtime capability. Keep this milestone evidence-driven and narrow: DB-mode
auth and persistence are in scope for validation, but production auth,
production asset storage, DB schema changes, runtime protocol changes, CRPG
automation, and broader D&D systems are out of scope by default.

### Phase 8 Slice 1: Character Library Builder / Export DB-Mode Browser Playtest Triage

Run a fresh DB-mode browser playtest of the persisted Character Library Builder
and PDF export path, then decide whether the next task should be a narrow
Builder/Library/PDF polish slice or closure. Cover login/register,
`/characters` list, new character creation, portrait validation,
rules-profile/species/class/background choices, derived HP/AC/speed/proficiency
previews, Save Draft, reload persistence, Review/finalize, PDF export from
Review and from the card, and fallback messaging.

Recommended effort: `high`.

Keep this evidence/triage-first. Do not change runtime protocol, DB schema,
production auth/security posture, production asset storage, Character
Library/runtime separation, combat automation, spell automation, inventory, or
broader D&D systems.

Status: implemented. The browser playtest registered a DB-backed user through
`/login`, opened `/characters`, built a Persian Human Fighter Soldier through
required language, class-skill, and background skill-overlap gates, and reached
the Review/sheet surface with derived AC, HP, speed, proficiency, skills,
features, equipment, notes, and PDF buttons visible. Persistence blocked at
`Save to Library`: PostgreSQL rejected the Persian Character Library JSON with
error `22P05` because the project-local DB was initialized with `WIN1252`
encoding.

Status: **Phase 8 Slice 2 implemented**. The project-local PostgreSQL dev
cluster was reprovisioned with UTF-8, migrations `0001` through `0010` were
reapplied, `@dnd/db check:readiness` now verifies UTF8 server/client encoding
plus a Persian Unicode round-trip probe, and
`@dnd/web test:smoke:builder-export-db` passes through authenticated Persian
draft creation, persisted browser reload, edit/review sheet access, Review PDF
affordance, authenticated finalize, card PDF affordance, and finalized-state
reread.

### Phase 8 Slice 3: Character Library Finalize UI & Builder/Export Flow Closure

Expose the missing Character Library card-level finalize affordance so the
persisted Builder/Export path can be completed from browser UI instead of a
direct command-route shortcut. Keep this slice UI/API-only: do not change
runtime protocol, DB schema, Character Library/runtime separation, production
auth/security posture, portrait storage, PDF template semantics, combat
automation, spell automation, inventory, or broader D&D systems.

Recommended effort: `medium`.

Status: **Phase 8 Slice 3 implemented**. Draft cards in `/characters` now show
a localized `Finalize Character` action when the persisted entry has an owner,
call the existing authenticated Character Library finalize API, update the card
state in place from the returned entry, and reuse the existing notice surface
for success/failure. The Builder/Export DB smoke now finalizes through the
browser card UI, exercises card PDF affordance after the card becomes finalized,
and rereads server state to confirm finalized persistence.

Next recommendation: choose one narrow Phase 8 closure slice: PDF artifact
verification or manual portrait-upload closure. Recommended effort: `medium`.
Do not continue DB readiness work unless a new UTF-8/migration/environment
blocker appears.

### Phase 8 Slice 4: Builder/Export PDF Artifact Verification

Close the remaining PDF evidence gap by proving the browser-generated PDF
artifact, not just the presence of PDF buttons or UI notices. Keep this slice
limited to the Character Library Builder/Export PDF path and smoke evidence; do
not change runtime protocol, DB schema, production auth, production asset
storage, Character Library/runtime separation, combat automation, spell
automation, inventory, or broader D&D systems.

Recommended effort: `medium`.

Status: **Phase 8 Slice 4 implemented**. The PDF generator now falls back to
the simple local PDF when an explicitly selected template cannot be parsed or
filled, so a broken or incompatible official template no longer turns the
browser export into a hard failure. The web unit tests cover this explicit
template fallback. The DB-mode Builder/Export smoke now enables a browser-only
artifact capture hook before Review/card PDF clicks and verifies the generated
PDF header, byte length, `.pdf` file name, UI notice, browser finalize flow,
and finalized-state reread.

Next recommendation: run a narrow manual portrait-upload closure slice.
Recommended effort: `medium`.

### Phase 8 Slice 5: Manual Portrait-Upload Closure

Close the remaining portrait evidence gap by proving the edit-page file input,
portrait compression/preview, persisted storage, and library-card rendering
path in DB mode. Keep this slice limited to Character Library Builder/Export
portrait handling and smoke evidence; do not change runtime protocol, DB
schema, production auth, production asset storage, Character Library/runtime
separation, combat automation, spell automation, inventory, or broader D&D
systems.

Recommended effort: `medium`.

Status: **Phase 8 Slice 5 implemented**. The DB-mode Builder/Export smoke now
creates a temporary PNG, uploads it through the edit-page file input with Chrome
DevTools file-input automation, verifies the browser preview, saves the draft,
confirms the uploaded portrait persists through the Character Library command
route, reloads `/characters`, and verifies the card renders the stored
portrait. This pass also fixed stored portrait rendering in the web app:
server-relative portrait URLs now resolve against `NEXT_PUBLIC_SERVER_URL`, and
uploaded portraits render with a plain `<img>` instead of `next/image` so
remote server images do not hit Next host restrictions.

Next recommendation: run a narrow Phase 8 Builder/Export closure/readout or
choose a fresh product-confidence target. Recommended effort: `medium`.

### Phase 8 Slice 6: Builder/Export Closure Readout

Use the completed Phase 8 DB-mode Builder/Export evidence to decide whether the
confidence sequence can close or needs one narrow follow-up. Keep this
docs/readout-only unless a fresh failure appears. Do not change runtime
protocol, DB schema, production auth, production asset storage, Character
Library/runtime separation, combat automation, spell automation, inventory, PDF
semantics, portrait storage, or broader D&D systems.

Recommended effort: `medium`.

Status: **Phase 8 Slice 6 implemented**. Phase 8 Builder/Export confidence is
closed for the current local single-process DB-mode browser path. DB readiness
requires required tables, UTF8 server/client encoding, and a Persian Unicode
round-trip. The Builder/Export smoke covers authenticated Persian draft
persistence, browser reload, edit/review access, PNG portrait upload and
persisted card rendering, Review/card PDF artifact capture, card-level
finalization, and finalized-state reread.

Closure decision: do not extend DB readiness, PDF artifact verification, or
portrait-upload coverage automatically unless a new failure or playtest blocker
appears. Choose the next task from a fresh human-approved product-confidence
target or playtest brief.

## Next Recommended Milestone: Character Library Usability Playtest Triage

The next useful milestone is not another automatic Builder/Export hardening
slice. Run a focused `/characters` usability playtest/triage pass in DB mode to
learn whether a reviewer can understand the Character Library, Builder,
draft/finalized card states, portrait behavior, PDF export affordances, and the
finalized saved-entry -> runtime submission boundary without internal
implementation context.

Keep this evidence-first. Do not change runtime protocol, DB schema, production
auth, replay/catch-up semantics, combat automation, production asset storage,
PDF semantics, portrait storage, Character Library/runtime separation, or
broader D&D systems by default.

Recommended effort: `medium`.

### Slice 1: Character Library Usability Playtest Triage

Run a fresh DB-mode browser usability pass for `/characters` and record issues
by category: UX/copy, i18n/RTL, persistence/auth, export, portrait,
runtime-bridge affordance, environment, or product scope. Choose any
implementation slice only from observed evidence.

Recommended effort: `medium`.

Status: implemented. DB readiness passed, and
`corepack pnpm --filter @dnd/web test:smoke:builder-export-db` passed all 9
steps through authenticated Persian draft persistence, browser reload, portrait
upload persistence, Review/card PDF artifact capture, card-level finalization,
and finalized-state reread. Source/manual-flow inspection found no mechanics
blocker, but did find mixed-locale `/characters` copy around the hardcoded
`Builder` nav label and card-level PDF/export affordances.

### Slice 2: Character Library Card Export / Bridge-Affordance Copy Polish

Polish high-traffic `/characters` library/card copy so the Builder nav, library
intro, card PDF export controls, PDF notices, and finalized saved-entry ->
runtime-submission affordance are localization-aware and understandable in both
English and Persian. Keep this frontend/i18n-only and do not change runtime
protocol, DB schema, auth, PDF generation, portrait storage, Character
Library/runtime separation, bridge behavior, combat automation,
replay/catch-up semantics, production auth, production asset storage, or
broader D&D systems.

Recommended effort: `medium`.

Status: implemented. Character Library shell/card/export copy now uses the
existing i18n system for the shell badge, `Builder` nav label, intro, create
and edit labels, AC/level labels, card pending affordances, PDF button labels,
PDF pending state, and PDF success/failure notices. Finalized cards now include
a localized hint that saved entries are submitted from Player-mode `runtime`,
where the server creates a separate runtime copy and live HP, movement,
conditions, and DM overrides do not mutate the reusable library entry.

### Slice 3: Character Sheet PDF Preview Before Download

Change the Review/Sheet and Character Library card PDF affordances so they show
a simple web preview of the generated character sheet before the user downloads
the PDF. Keep the preview driven by the same Character Library entry and mapped
PDF fields, and keep the actual PDF download inside the preview dialog.

Do not change runtime protocol, DB schema, auth, PDF template semantics,
portrait storage, Character Library/runtime separation, bridge behavior,
combat automation, replay/catch-up semantics, production auth, production
asset storage, or broader D&D systems.

Recommended effort: `medium`.

Status: implemented. The Review/Sheet PDF buttons and Character Library card
PDF buttons now open a reusable HTML character-sheet preview first. The
existing local template/fallback PDF generator still owns the downloaded PDF,
and the DB-mode Builder/Export smoke now verifies preview readiness, PDF
artifact generation, and explicit download from the preview dialog.

### Slice 4: Character Sheet PDF Preview Browser Verification / Closure

Close the preview evidence gap by proving the generated web preview is visible
and reviewable in the browser before download. Keep this verification-only
unless a fresh preview failure appears. Do not change runtime protocol, DB
schema, auth, PDF template semantics, portrait storage, Character
Library/runtime separation, bridge behavior, combat automation,
replay/catch-up semantics, production auth, production asset storage, or
broader D&D systems.

Recommended effort: `medium`.

Status: implemented. The DB-mode Builder/Export smoke now verifies the Review
and Character Library card preview dialogs before download, including the
dialog controls, the Persian character name, the printable LTR sheet surface,
and mapped character-sheet fields such as character name, class/level, species,
background, and armor class. Web tests, web typecheck, web build, lint,
format:check, `git diff --check`, and
`corepack pnpm --filter @dnd/web test:smoke:builder-export-db` passed.

Next recommendation: use the fresh product-confidence target selected below.
Do not continue DB readiness, PDF export, portrait upload, runtime polish, or
bridge confidence automatically unless a new blocker appears. Recommended
effort: `medium`.

## Completed Milestone: End-to-End Saved Character To Training Room Product-Flow Playtest Triage

The fresh product-confidence target intake chose the next useful evidence gap:
the full current product journey across Character Library and runtime surfaces.
Run an evidence-first browser/manual triage pass that starts with an
authenticated reusable Character Library entry, follows the finalized saved
entry into Player-mode `/runtime`, verifies DM pending-assignment preview and
assignment of the separate runtime copy, then exercises Training Room placement,
encounter start, first turn feedback, recovery/local reset, and English/Persian
scanability.

Keep this triage/readout-first. Do not change runtime protocol, DB schema,
auth, PDF generation, portrait storage, Character Library/runtime separation,
bridge behavior, combat automation, replay/catch-up semantics, production auth,
production asset storage, fog of war, spell automation, inventory, or broader
D&D systems by default.

Recommended effort: `medium`.

### Slice 1: Saved Character To Training Room Product-Flow Triage

Run a fresh end-to-end product-flow pass and classify any issue as UX/copy,
i18n/RTL, persistence/auth, export, portrait, runtime-bridge affordance,
runtime action clarity, recovery/local state, environment, or product scope.
Choose any implementation follow-up only from observed evidence.

Recommended effort: `medium`.

Status: implemented. DB readiness, DB-mode Builder/Export smoke, DB-mode
bridge smoke, and two-profile Training Room runtime smoke all passed. The
triage found no mechanics blocker and no boundary violation. The observed
product-confidence gap is that the evidence is split across separate browser
harnesses; no single run currently follows one saved Character Library entry
through Player submission, DM runtime-copy assignment, Training Room placement,
encounter start, first-turn feedback, recovery, and Local Reset.

## Implemented: Saved Character To Training Room Combined Browser Evidence Harness

The combined DB-mode browser smoke now follows one saved Character Library
entry through Player submission, DM runtime-copy assignment, Training Room
placement, encounter start, first-turn feedback, recovery, and Local Reset in
one evidence record.

Validation command:

```bash
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

Status: implemented.

## Implemented: Fresh Product-Confidence Intake

Review the combined evidence and choose the next narrow slice only from fresh
observed product friction. Do not automatically expand runtime protocol,
replay/catch-up, production auth, DB/auth schema work, Character Library bridge
behavior, PDF/portrait mechanics, combat automation, or broader D&D systems.

Status: implemented in
`docs/delivery/FRESH_PRODUCT_CONFIDENCE_AFTER_COMBINED_HARNESS.md`.

## Implemented: Combined Harness Evidence Closure / Review Packet

Create a short reviewer-facing closure packet from the existing combined
harness evidence: command, 12-step meaning, covered product loop, boundaries
verified, known non-claims, and remaining manual review notes. Keep it
docs-only unless screenshot automation is explicitly approved.

Status: implemented in
`docs/delivery/COMBINED_HARNESS_EVIDENCE_CLOSURE_PACKET.md`.

## Implemented: Human Review / Merge Decision

Review the combined harness implementation, fresh product-confidence intake,
and closure packet. If the current evidence is sufficient, decide whether to
merge this slice. If visual evidence is needed, approve a separate optional
screenshot packet for the same combined harness path.

Status: implemented in
`docs/delivery/HUMAN_REVIEW_MERGE_DECISION_COMBINED_HARNESS.md`.

## Implemented: Curated Merge Or Optional Screenshot Packet

Use the human review / merge decision packet to choose one of two paths:
curated staging and merge of the approved slice, or a separately approved
optional screenshot evidence packet for the same combined harness path. Do not
merge the entire dirty working tree as one unreviewed unit.

Status: implemented in
`docs/delivery/CURATED_MERGE_OR_SCREENSHOT_PACKET.md`.

## Next Recommended Milestone: Explicit Staged Commit/PR Or Optional Screenshot Packet

If the human wants to proceed with merge, explicitly request staging/commit/PR
and confirm the exact file set because the current working tree contains
multiple prior dirty and untracked paths. If visual evidence is required first,
approve a separate optional screenshot evidence packet for the same combined
harness path.

Recommended effort: `medium`.

Status: superseded by the completed curated merge to `main` and post-merge
main verification / closure packet.

## Implemented: Post-Merge Main Verification / Closure

Verify the post-merge `main` state for the curated combined harness evidence
slice and close the merge operation without adding runtime behavior.

Status: implemented in
`docs/delivery/POST_MERGE_MAIN_VERIFICATION_CLOSURE.md`.

Closure decision: the curated combined harness evidence slice is closed on
`main` for the current local single-process DB-mode evidence path. Choose the
next task from a fresh human-approved product goal or playtest brief. Optional
screenshot evidence remains a separate reviewer-requested task only.

## Implemented: Post-Merge Fresh Product Playtest Intake

Choose the next fresh product-confidence path after main-branch closure and
collect current evidence before starting any new implementation sequence.

Status: implemented in
`docs/delivery/POST_MERGE_FRESH_PRODUCT_PLAYTEST_INTAKE.md`.

Chosen path: reviewer-facing Character Library -> Runtime handoff playtest
intake.

Recommended effort: `medium`.

Validation evidence: DB readiness, DB-mode Builder/Export smoke, and DB-mode
saved-character-to-Training-Room smoke passed on 2026-06-05.

Closure decision: no fresh mechanics blocker appeared. The next narrow slice is
a docs-only reviewer playtest brief that maps the existing `/characters`,
Player-mode `runtime`, DM assignment, Training Room recovery, Local Reset, and
reusable-entry separation checkpoints to the already-passing evidence.

## Implemented: Character Library -> Runtime Handoff Reviewer Playtest Brief

Create the docs-only reviewer guide for the current Character Library ->
Runtime handoff path, tying each review checkpoint to the existing smoke
evidence and project boundaries.

Status: implemented in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEWER_PLAYTEST_BRIEF.md`.

Recommended effort: `medium`.

Closure decision: use this brief as the current manual review guide. If review
finds no fresh blocker, choose the next product task from a new human-approved
playtest goal instead of extending this handoff sequence automatically.

## Implemented: Character Library -> Runtime Handoff Review Closure Packet

Create the reviewer result / closure packet for the current handoff review
brief, including verdict options, evidence sufficiency, boundary closure, and
follow-up rules.

Status: implemented in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_CLOSURE_PACKET.md`.

Recommended effort: `medium`.

Closure decision: use the packet to record `pass`, `follow-up`, or `blocked`.
If review passes, close the current handoff sequence and choose the next task
from a new human-approved product goal.

## Implemented: Character Library -> Runtime Handoff Review Verdict

Record the reviewer verdict for the current Character Library -> Runtime
handoff review sequence.

Status: implemented in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_VERDICT.md`.

Verdict: `pass` with cautions.

Closure decision: no follow-up slice is required from the current evidence.
Close the current handoff review sequence and choose the next Codex task from a
new human-approved product goal or playtest brief.

## Implemented: Training Room Table Experience Fresh Goal Intake

Choose the next fresh product goal after the Character Library -> Runtime
handoff review verdict closed with `pass` and cautions.

Status: implemented in
`docs/delivery/TRAINING_ROOM_TABLE_EXPERIENCE_FRESH_GOAL_INTAKE.md`.

Chosen path: Training Room table experience reviewer pass.

Recommended effort: `medium`.

Validation evidence: `corepack pnpm --filter @dnd/web test:smoke` passed, and
`corepack pnpm --filter @dnd/web test:smoke:two-profile` passed all 8 steps
with session `SCU9S8` on 2026-06-05.

Closure decision: no fresh mechanics blocker appeared. The next narrow slice is
a docs/evidence reviewer pass using the Training Room playtest checklist, not
immediate runtime implementation.

## Historical Note

The previous read-model recovery and realtime delivery-boundary milestone is
implemented as a narrow observability/recovery slice:

- `GET /api/outbox/status` reports unpublished backlog counts without draining
  rows or exposing row details.
- A DB-backed missed-live-delivery test proves clients can recover current truth
  through read models while late SSE subscribers do not receive historical event
  replay.
- `/runtime` DM mode includes a compact manual outbox status badge as a
  development/operator visibility aid, not production monitoring, replay, or
  recovery automation.

Keep these as current limitations and supporting infrastructure, not the next
product milestone.

## Recommended Prompt Effort

Use Codex model effort `medium` for docs-only cleanup, small UI polish, and
small helper/test updates around the Training Room flow.

Use `high` for normal multi-file frontend/backend implementation or any DB,
transaction, idempotency, outbox, auth/security, or runtime data-model boundary
work.

Use `extra high` only if a task combines several high-risk areas.
