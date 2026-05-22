# Codex Context

This is the short execution context for future AI/Codex work in DND-web. It is
intended to be read before implementation prompts.

## Source Of Truth Order

Use current implementation and current operational docs before raw context:

1. `docs/project-handoff.md`
2. `docs/engineering/CURRENT_STATE.md`
3. `docs/api-surface.md`
4. `docs/persistence-boundaries.md`
5. `docs/product/PRODUCT_BRIEF.md`
6. `docs/domain/DOMAIN_MODEL.md`
7. `docs/product/I18N_POLICY.md`

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
  keyboard navigation, DM-facing Table Setup checklist, mixed
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
Playable MVP Phase 5 follow-up: continue recovery and local playtest
reliability around refresh/recover, smoke diagnostics, and honest read-model
visibility.

The bridge hardening slice, Table Setup checklist, scene entity palette, and
transition preset palette are in place. Phase 4 Slice 1 now adds a compact
current-turn rail, Slice 2 adds selected target/action-result feedback from
loaded read models, Slice 3 adds selected movement destination and turn-budget
feedback, and Slice 4 adds action/bonus/reaction economy feedback around the
existing turn controls. Slice 5 adds encounter status, round progress, next
actor, latest encounter update, and latest combat result feedback. Slice 6 adds
player-facing readiness and turn-ready feedback. Phase 5 Slice 1 adds Recovery
Status feedback, Slice 2 adds playable-session script tightening plus
actionable smoke wait diagnostics, and Slice 3 verifies Local Reset clears
stale recovered demo table text from the visible runtime surface. Slice 4
verifies the same backend runtime session can be recovered again after Local
Reset. The next work should keep making refresh/recover and local smoke
coverage easier to trust without adding replay, cursor, catch-up, or broader
D&D automation.

Break this into small Codex tasks:

1. inspect current recovery helpers, browser smoke waits, and runtime read-model
   status surfaces;
2. continue local playtest reliability around recovery status, smoke
   assertions, and manual validation;
3. avoid adding replay, cursor, catch-up, or broader D&D automation;
4. validate helper tests, web typecheck, build, and runtime smoke honestly;
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
