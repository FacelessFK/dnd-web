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
Playable MVP Phase 6: polish the Training Room Skirmish DM-player product flow
using existing runtime commands and current local sample data.

The Character Library -> runtime bridge already has a server-side command,
Player-mode saved-character submit UI, DM pending-assignment preview, separate
runtime character copies, and narrow DB transaction/outbox coverage on covered
paths. Treat bridge hardening as historical/current infrastructure, not the
immediate next product milestone.

The next work should tighten the named Training Room Skirmish presentation and
manual playtest script without adding new runtime protocol, combat automation,
replay, cursor, catch-up, production auth, or broader D&D systems.

Break this into small Codex tasks:

1. inspect current named demo scenario commands, runtime sample data, and demo
   setup UI when changing scenario behavior;
2. polish the named Training Room Skirmish scenario presentation without
   introducing new runtime protocol or combat automation;
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
