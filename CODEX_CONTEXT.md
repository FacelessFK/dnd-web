# Codex Context

This is the short execution context for future AI/Codex work in DND-web. Read
it after `AGENTS.md`, which is the durable Codex-native instruction file.

## Source Of Truth Order

Use current implementation and current operational docs before raw context.
When docs conflict with code, current code and `packages/protocol` schemas are
final truth.

1. `docs/engineering/CURRENT_STATE.md`
2. `docs/project-handoff.md`
3. `docs/api-surface.md`
4. `docs/persistence-boundaries.md`
5. `docs/product/PRODUCT_BRIEF.md`
6. `docs/product/USER_FLOWS.md`
7. `docs/product/I18N_POLICY.md`
8. `docs/domain/DOMAIN_MODEL.md`
9. `docs/delivery/PLAYABLE_MVP_PHASES.md`
10. `docs/delivery/NEXT_MILESTONE.md` when it remains consistent with the
    current-state docs above.

`docs/context/brainstorm-source.md` and
`docs/context/current-project-handoff.md` are archive/input material. They are
not source-of-truth product docs.

## Product Thesis

DND-web is a DM-first, top-down tactical D&D tabletop runtime and character
product surface. The server owns authoritative runtime state. Players submit
structured intent. The DM keeps final authority through explicit server-side
controls.

The product is not a CRPG, monster AI engine, full D&D automation engine, or
production auth/deployment project unless a future task explicitly asks for
that scope.

## Repo Shape

- `apps/web`: Next.js / React / Tailwind surfaces for `/runtime`, `/maps`,
  `/characters`, and `/login`.
- `apps/server`: Node/TypeScript authoritative HTTP/SSE runtime.
- `packages/protocol`: Zod schemas and inferred protocol types.
- `packages/shared`: shared domain primitives.
- `packages/rules`: deterministic rules helpers.
- `packages/db`: Drizzle/Postgres schema, adapters, migrations, and unit of
  work boundaries.

## Current Implementation State

- Scenes carry a paintable `terrain` layer: a run-length encoded, row-major
  tile array validated in `packages/rules`, mutated by the DM-only
  `paint_scene_terrain` command, and enforced in movement (blocking tiles join
  the existing blocking-occupancy check).
- `/runtime` renders a canvas tactical map instead of a DOM cell grid: terrain
  art, raised walls, liquids, props, transition markers, tokens with HP arcs
  and a current-turn ring, movement-range overlay, drag-pan, cursor-anchored
  zoom, and a culled focusable grid overlay for keyboard/screen-reader access.
- `/maps` is a standalone map builder (paint tools, prop placement, undo/redo,
  resize, JSON import/export, Training Room preset) that publishes a painted
  map to a table via `create_scene` + `place_entity_in_scene`.
- `/runtime` is a live tactical cockpit with DM and Player modes, session
  create/join/reconnect, SSE subscription, read-model recovery, scene creation
  and activation, passive scene entities, compact scene entity presets,
  transition nodes, compact transition presets, placement/movement, local
  tactical board camera controls, tactical board state badges, tactical board
  keyboard navigation, a named Training Room Skirmish demo setup, DM-facing
  Table Setup checklist, mixed
  player/combatant encounters ordered by server-rolled initiative, compact
  current-turn rail, encounter status
  feedback, player readiness feedback, action economy feedback, narrow melee
  attacks with rolled damage, turn usage, readable event feed, recovery status
  feedback, and explicit DM controls.
- Runtime smoke coverage now reports numbered steps and richer wait-failure
  diagnostics: current URL, summarized cockpit local state, visible enabled
  buttons, visible page text, and recent child-process output.
- Runtime smoke also verifies Local Reset clears stale recovered demo table text
  from the visible runtime surface after a recovered playable session.
- Runtime smoke then restores the same session ID and recovers the backend
  runtime session again to verify Local Reset stays browser-local.
- Runtime smoke's final Phase 5 assertion confirms that post-reset recovery
  includes the table, Recovery Status summary, and Encounter Status summary.
- `/characters` is a Character Library and Builder surface for reusable
  build/identity records.
- `/login` is the auth surface for the DB-backed Character Library session MVP.
- Character Library auth requires DB mode and uses opaque HttpOnly-cookie
  sessions with DB-backed users and sessions.
- DB-backed slices cover character records, Character Library entries, auth
  users/sessions, session snapshots, scene records, active encounters, command
  idempotency records/claims, covered transaction boundaries, and
  single-process outbox dispatch for covered live-command paths.
- Runtime character assignment supports the server-side bridge command
  `submit_character_library_entry_for_assignment`: a finalized reusable
  Character Library entry can be copied into a separate ready runtime character
  and submitted as `pendingCharacterId` for DM assignment. The reusable library
  entry is not mutated.
- `/runtime` Player mode now includes a localization-aware saved-character
  selector that lists finalized Character Library entries for the authenticated
  user, submits the selected entry through the bridge, and preserves existing
  DM assignment authority.
- `/runtime` DM mode previews pending Player-submitted assignment requests with
  the runtime copy's build, HP, AC, speed, runtime copy ID, and source Character
  Library entry ID when present.
- Assigned runtime character cards continue showing the runtime copy/source
  Character Library entry provenance after DM assignment.
- DB-mode local validation now has a non-secret readiness preflight and a
  passing combined bridge / Training Room browser smoke path: the local project
  DB cluster can pass required-table readiness, and
  `@dnd/web test:smoke:saved-character-training-room-db` proves Player
  saved-character submission -> DM runtime-copy assignment -> reusable
  library-entry separation -> Training Room placement -> encounter start ->
  DM/Player recovery -> Player Local Reset recovery in a single-process local
  DB-mode browser run. `@dnd/web test:smoke:bridge-db` remains an alias for the
  same harness.

## Known Limitations

- Terrain tiles carry movement/vision blocking only: no difficult-terrain
  movement cost, no hazard damage, and terrain `blocksVision` is stored but not
  consumed by any visibility system.
- The tactical map's light and vignette are atmosphere, not fog of war or line
  of sight; nothing is occluded.
- Role projection covers scene entities only. `get_scene` strips hidden entities
  for players; encounter state is not projected, so a hidden combatant still
  appears in the shared initiative order by entity ID (no name, position, HP, or
  stat block).
- `/maps` publishes new scenes only. It cannot re-open or overwrite a server
  scene, and it does not activate what it publishes.
- Default local startup may still be in-memory.
- Character Library auth is an MVP, not production account security.
- Auth brute-force limits on login/register are in-memory and per-process. They
  reset on restart and are not shared between processes, so they are not
  cluster-wide enforcement. A distributed many-IP attack on a single account is
  not blocked, and `register` still reveals whether an email is registered. See
  `docs/engineering/CURRENT_STATE.md` for the exact budgets.
- SSE subscribers are process-local.
- Unpublished outbox rows are not auto-redelivered on cold boot.
- `GET /api/outbox/status` reports unpublished outbox backlog counts without
  draining rows or exposing row details.
- `/runtime` DM mode has a manual outbox status badge backed by that endpoint;
  it is a development/operator visibility aid, not monitoring or alerting.
- DB-backed missed realtime delivery is covered by a recovery audit test:
  reconnect/read-model commands rebuild current truth, but late SSE subscribers
  do not receive historical event replay.
- There is no replay, cursor, catch-up API, exactly-once delivery, or
  multi-process coordination.
- Runtime rules remain narrow: no full spell system, full condition engine,
  opportunity attacks, broad weapon/ranged system, full monster stat blocks,
  monster AI, fog of war, line of sight, lighting, or production deployment
  posture.
- Combat now rolls real dice, but only at a baseline level. Initiative is
  `d20 + initiative modifier`, rolled once per participant at
  `start_encounter`. Attacks apply natural-20/natural-1 outcome rules and roll
  a baseline `1d8` plus the attacker's Strength modifier for damage, doubling
  the dice on a critical. There is still no weapon model, damage type,
  resistance, finesse/ranged ability selection, per-class damage die,
  initiative re-roll, or advantage/disadvantage.
- Character Library entries and live runtime overlays are intentionally
  separate; live damage, movement, conditions, and DM overrides must not mutate
  reusable library entries.

## Next Priorities

Latest completed slice (2026-07-27): **visual tactical map + map builder**.
Added the scene terrain layer end to end (shared/protocol/rules/server/movement),
replaced the runtime's DOM cell grid with a canvas renderer, rebuilt the demo
Training Room as an authored room layout, and shipped `/maps`. Validation:
`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (487),
`@dnd/web build`, `@dnd/web test:smoke`, `test:smoke:two-profile`, and the new
`test:smoke:map-builder` (which verifies the published scene on the server).

Natural follow-ups, none started: difficult-terrain movement cost, terrain
`blocksVision` feeding a visibility system, editing an existing server scene
from `/maps`, and token portraits on the map.

Earlier slice (2026-07-26): **real dice combat**. Initiative is now
rolled server-side at `start_encounter` (`d20 + initiative modifier`), and a
landed attack rolls a baseline `1d8` plus the attacker's Strength modifier
instead of applying a flat 1 damage. Natural 20 always hits and doubles the
damage dice; natural 1 always misses. `combat_event.roll` gained optional
`critical`/`criticalMiss` flags and the event gained an optional `damageRoll`
breakdown. `packages/rules` now has its own unit test suite wired into the root
`pnpm test`, and `InMemoryGameRuntime` exposes injectable `dieRoller` and
`initiativeRoller` plus a `withRollers()` builder for deterministic tests.

Known follow-ups deliberately left open: the runtime event feed detail strings
in `apps/web/lib/runtime-cockpit-helpers.ts` are still English-only
(pre-existing), and there is no weapon model, damage type, resistance,
finesse/ranged ability selection, per-class damage die, advantage/disadvantage,
or DM initiative-edit command.

Earlier recommended next milestone:
Explicit staged commit/PR request for the curated combined harness slice, or
an optional screenshot evidence packet if visual review is required.

The Phase 6 Training Room Skirmish polish sequence, Phase 7 Character Library
-> Runtime bridge confidence sequence, and the fresh next-goal intake are
closed for the currently triaged evidence. Fresh one-profile runtime,
two-profile runtime, and DB-mode bridge smokes passed. Do not extend runtime
polish or bridge confidence automatically.

Phase 8 Builder/Export confidence is now closed for the current local
single-process DB-mode browser path. The DB-mode Builder/Export smoke covers
authenticated Persian draft persistence, browser reload, edit/review access,
PNG portrait upload and persisted card rendering, Review/card PDF artifact
capture, card-level finalization, and finalized-state reread. The readiness
preflight requires required tables, UTF8 server/client encoding, and a Persian
Unicode round-trip.

The Character Library card export / bridge-affordance copy polish is
implemented, and PDF export now opens a reusable web character-sheet preview
before download on both the Review/Sheet surface and Character Library cards.
The preview is driven by the same mapped Character Library fields as PDF
generation; the existing local template/fallback PDF generator still owns the
downloaded artifact. The narrow browser visual verification/closure pass for
the preview is complete: web tests, web typecheck, web build, lint,
format:check, `git diff --check`, and the DB-mode Builder/Export smoke passed,
including preview dialog content and PDF artifact checks. Do not extend DB
readiness, PDF export mechanics, portrait upload mechanics, runtime polish, or
bridge confidence automatically unless a new blocker appears.

The end-to-end saved-character-to-Training-Room product-flow triage and
combined harness are complete for the current local evidence. DB readiness,
DB-mode Builder/Export smoke, DB-mode bridge/Training Room smoke, and
two-profile Training Room runtime smoke passed. The combined DB-mode browser
run now follows one saved Character Library entry through Player submission,
DM assignment of the separate runtime copy, Training Room placement, encounter
start, first-turn/action feedback, DM/Player recovery, reusable-entry
separation checks, and Player Local Reset recovery. Do not extend runtime
polish, Character Library bridge behavior, DB/auth, PDF/portrait, or combat
automation automatically unless fresh evidence identifies a narrow blocker.

The fresh product-confidence intake after the combined harness is complete.
It found no current mechanics blocker and no boundary violation. It
recommended reviewer-facing evidence packaging as the next docs-only closure
step rather than new runtime behavior.

The Combined Harness Evidence Closure Packet is complete in
`docs/delivery/COMBINED_HARNESS_EVIDENCE_CLOSURE_PACKET.md`. It summarizes the
validation command, 12-step product loop, reviewer evidence map, boundary
review, explicit non-claims, and closure decision. Recommended next action:
human review / merge decision. If visual evidence is needed, approve a
separate optional screenshot packet; do not broaden runtime protocol,
DB/auth, replay/catch-up, Character Library bridge behavior, combat
automation, PDF/portrait mechanics, or broader D&D systems automatically.

The Human Review / Merge Decision packet is complete in
`docs/delivery/HUMAN_REVIEW_MERGE_DECISION_COMBINED_HARNESS.md`. Verdict:
approve with cautions for the reviewed combined harness evidence slice. Main
caution: the working tree contains multiple previous dirty and untracked paths,
so do not merge the entire working tree as one unreviewed unit. Use curated
staging for the intended approved slice, or request a separate optional
screenshot evidence packet if visual review is required.

The Curated Merge Or Optional Screenshot Packet is complete in
`docs/delivery/CURATED_MERGE_OR_SCREENSHOT_PACKET.md`. The curated slice has
now landed on `main` through merge commit `c8d4015`.

The Post-Merge Main Verification / Closure packet is complete in
`docs/delivery/POST_MERGE_MAIN_VERIFICATION_CLOSURE.md`; it closes the curated
combined harness evidence slice on `main` for the current local single-process
DB-mode evidence path. The working tree was clean before this docs-only
closure update. The next useful action is a fresh human-approved product goal
or playtest brief, with optional screenshots only if a reviewer asks for visual
evidence.

The Post-Merge Fresh Product Playtest Intake is complete in
`docs/delivery/POST_MERGE_FRESH_PRODUCT_PLAYTEST_INTAKE.md`. It chose the
reviewer-facing Character Library -> Runtime handoff path at `medium` effort.
DB readiness, the DB-mode Builder/Export smoke, and the DB-mode
saved-character-to-Training-Room smoke passed on 2026-06-05. No fresh mechanics
blocker appeared; the recommended next narrow slice is a docs-only reviewer
playtest brief that maps `/characters`, Player-mode `runtime`, DM assignment,
Training Room recovery, Local Reset, and reusable-entry separation to the
existing evidence.

The Character Library -> Runtime Handoff Reviewer Playtest Brief is complete in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEWER_PLAYTEST_BRIEF.md`.
It gives reviewers the current manual review path and checkpoint map for
`/characters`, PDF preview/download, Player saved-character submission, explicit
DM runtime-copy assignment, Training Room recovery, Player Local Reset, and
Character Library/runtime separation. Do not extend the handoff sequence
automatically unless that review finds a concrete blocker.

The Character Library -> Runtime Handoff Review Closure Packet is complete in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_CLOSURE_PACKET.md`. It
defines reviewer verdicts (`pass`, `follow-up`, `blocked`), evidence
sufficiency, boundary closure checks, and follow-up rules. If review passes,
close the current handoff sequence and choose the next task from a new
human-approved product goal rather than continuing this chain automatically.

The Character Library -> Runtime Handoff Review Verdict is complete in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_VERDICT.md`. Verdict:
`pass` with cautions. No follow-up slice is required from the current evidence.
Close the current handoff review sequence; the next Codex task should come from
a new human-approved product goal or playtest brief.

The Training Room Table Experience Fresh Goal Intake is complete in
`docs/delivery/TRAINING_ROOM_TABLE_EXPERIENCE_FRESH_GOAL_INTAKE.md`. It chose a
fresh Training Room table-experience reviewer pass at `medium` effort. Fresh
runtime evidence on 2026-06-05 passed `@dnd/web test:smoke` and
`@dnd/web test:smoke:two-profile` with two-profile session `SCU9S8`. No fresh
mechanics blocker appeared; the recommended next slice is a docs/evidence
reviewer pass using the Training Room playtest checklist, not immediate runtime
implementation.

For the next task:

1. inspect the current docs, existing smoke scripts, and both `/characters` and
   `/runtime` surfaces before planning;
2. keep the task scoped by observed evidence, not by broad product ambition;
3. avoid adding runtime protocol, replay, cursor, catch-up, production auth,
   combat automation, or broader D&D systems unless explicitly approved;
4. validate with the smallest honest set of tests/smokes for the touched area;
5. update docs after each slice.

## Coding Rules For Future Codex Tasks

- Inspect before editing.
- Keep changes narrow and repo-native.
- Do not use brainstorm text as implementation scope.
- Do not broaden product scope into CRPG automation, monster AI, production
  auth, or deployment unless explicitly requested.
- Keep DM-only actions role-gated server-side.
- Preserve the separation between reusable content/library records and live
  runtime state.
- Avoid hardcoded user-facing strings when they belong in the i18n system.
- Never print `.env` secrets.
- Report exact validation commands and blockers.

## AI-Assisted Workflow Expectations

- Prompts should state context, goal, non-goals, files to inspect first,
  product/UX requirements, i18n requirements, technical boundaries, acceptance
  criteria, validation commands, and report format.
- Prefer small scoped tasks over broad rewrites.
- Treat current docs as source of truth and raw context as archive only.
- Run practical validation before claiming success.
- Report files changed, behavior added, tests/docs updated, known limitations,
  and anything needed from the user.

## i18n Rule

English and Persian support is a product constraint. Future product work must
preserve localization-aware UI copy, LTR/RTL behavior, and the current
`I18nProvider` direction. User-entered character data must not be
auto-translated, and localized labels must not become canonical IDs.
