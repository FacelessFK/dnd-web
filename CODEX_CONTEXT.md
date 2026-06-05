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

- `apps/web`: Next.js / React / Tailwind surfaces for `/runtime`,
  `/characters`, and `/login`.
- `apps/server`: Node/TypeScript authoritative HTTP/SSE runtime.
- `packages/protocol`: Zod schemas and inferred protocol types.
- `packages/shared`: shared domain primitives.
- `packages/rules`: deterministic rules helpers.
- `packages/db`: Drizzle/Postgres schema, adapters, migrations, and unit of
  work boundaries.

## Current Implementation State

- `/runtime` is a live tactical cockpit with DM and Player modes, session
  create/join/reconnect, SSE subscription, read-model recovery, scene creation
  and activation, passive scene entities, compact scene entity presets,
  transition nodes, compact transition presets, placement/movement, local
  tactical board camera controls, tactical board state badges, tactical board
  keyboard navigation, a named Training Room Skirmish demo setup, DM-facing
  Table Setup checklist, mixed
  player/combatant encounters, compact current-turn rail, encounter status
  feedback, player readiness feedback, action economy feedback, narrow melee
  attacks, turn usage, readable event feed, recovery status feedback, and
  explicit DM controls.
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

- Default local startup may still be in-memory.
- Character Library auth is an MVP, not production account security.
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
- Character Library entries and live runtime overlays are intentionally
  separate; live damage, movement, conditions, and DM overrides must not mutate
  reusable library entries.

## Next Priorities

Recommended next milestone:
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
`docs/delivery/CURATED_MERGE_OR_SCREENSHOT_PACKET.md`. It recommends curated
merge preparation as the default path, with screenshots only if a visual
reviewer asks for them. No git staging, commit, merge, push, or PR action has
been performed. If the human wants a real commit/PR, they should explicitly
request staging/commit/PR and confirm the exact file set because the working
tree contains multiple prior dirty and untracked paths.

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
