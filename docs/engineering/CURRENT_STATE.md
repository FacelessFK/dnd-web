# Current State

This document summarizes the current implementation reality for planning and
Codex task execution. For exact payloads, use `docs/api-surface.md` and
`packages/protocol`.

## What Exists Now

- TypeScript pnpm monorepo.
- Next.js web app with `/runtime`, `/maps`, `/characters`, and `/login`.
- Node/TypeScript authoritative runtime with HTTP command endpoints and SSE.
- Zod protocol schemas in `packages/protocol`.
- Shared domain primitives in `packages/shared`.
- Deterministic helpers in `packages/rules`.
- Drizzle/Postgres schema, migrations, adapters, and unit-of-work boundaries in
  `packages/db`.

## Runtime Surface

`/runtime` currently supports:

- DM and Player modes;
- session create/join/reconnect;
- SSE session stream;
- read-model recovery after refresh;
- scene create/activate/read, with `get_scene` projected per role so a player
  never receives entities the DM marked hidden;
- passive scene entity create/update/reposition/delete;
- compact DM scene entity palette that fills the existing placement draft with
  wall, cover, marker, hidden prop, player spawn, and monster spawn presets;
- transition node create/update/delete/activation;
- compact DM transition preset palette that fills the existing transition draft
  with door, stairs, portal, gate, and other exit presets;
- character placement and movement;
- a canvas tactical map that renders the scene terrain layer, blocking props,
  transition markers, and tokens, with drag-to-pan, wheel zoom anchored under
  the cursor, fit-to-map, hover and selection feedback, per-token HP arcs, a
  pulsing current-turn ring, and a movement-range overlay;
- a culled, focusable accessibility grid layered over the canvas so cell
  selection and arrow-key navigation stay available without a pointer;
- DM-facing Table Setup checklist derived from session, player assignment,
  scene, token placement, and encounter read state;
- named Training Room Skirmish demo scenario setup that uses existing runtime
  commands and current local sample data;
- mixed player/combatant encounters with server-rolled initiative
  (`d20 + initiative modifier`) ordering the turn list at encounter start;
- compact current-turn rail that shows the current actor, remaining movement,
  and used action/bonus/reaction state from loaded read models;
- selected target and latest combat-result feedback derived from loaded read
  models and live event log entries;
- selected movement destination and turn-budget feedback derived from loaded
  character, scene, active-scene, and encounter read models;
- encounter status feedback that shows loaded encounter status, round/turn
  progress, current and next actors, latest encounter update, and latest combat
  result from read models and the live event log;
- player readiness feedback that shows session, joined, character, assignment,
  scene, placement, and turn-ready states plus move/attack/action readiness;
- recovery status feedback that shows session, scene, active-scene placement,
  characters, encounter, and recovery notes for local refresh/recover checks;
- browser smoke diagnostics that report step numbers, the current URL,
  summarized cockpit local state, visible enabled buttons, page text, and recent
  process output when local runtime smoke waits fail;
- browser smoke coverage that verifies Local Reset removes stale recovered demo
  table text from the visible runtime surface;
- browser smoke coverage that restores the same session ID after Local Reset
  and recovers the backend runtime session again;
- browser smoke coverage that confirms the post-reset recovery includes the
  table, Recovery Status summary, and Encounter Status summary;
- action economy feedback that shows current action, bonus action, and
  reaction readiness plus per-resource blockers around the existing turn
  controls;
- turn usage;
- narrow melee attack handling;
- readable combat/event feed;
- DM assignment request previews for pending Player-submitted runtime
  characters, including source Character Library entry IDs when present;
- assigned character cards preserve the runtime copy/source library entry
  provenance after DM assignment;
- DB-mode combined browser smoke coverage follows one saved Character Library
  entry through Player submission, DM runtime-copy assignment, Training Room
  scene activation, placement, encounter start, DM/Player recovery, first-turn
  feedback, and Player Local Reset recovery;
- DM HP, condition, reposition, combatant, current-turn, turn-usage, and
  encounter-end controls.

The browser submits commands and renders server responses. It is not
authoritative.

## Map Builder

`/maps` is a standalone map editor. It edits a local document (persisted to
`localStorage` and exportable as JSON), then publishes to a table.

- Terrain painting with brush, rectangle (filled or outline), line, flood fill,
  and eraser tools over the full tile palette in `sceneTerrainTiles`.
- Prop placement for blocking/non-blocking objects, decor, player spawns, and
  monster markers, with an inspector for name and the movement/vision/hidden
  flags.
- Undo/redo (`Ctrl`/`Cmd`+`Z`, `Ctrl`/`Cmd`+`Shift`+`Z`), map resize that keeps
  painted terrain inside the new bounds, JSON import/export, and a Training
  Room preset.
- "Publish to table" reads the session and DM participant already stored by
  `/runtime`, then issues `create_scene` with the painted terrain followed by
  one `place_entity_in_scene` per prop. The scene is created but not activated;
  the DM activates it from the runtime table.

The builder is a design surface. It holds no authoritative state: nothing it
draws is real until the server accepts the publish commands.

## Character Library And Builder

`/characters` manages reusable library/build records, not live runtime
overlays.

Current implementation includes:

- library list and builder routes at `/characters`, `/characters/new`, and
  `/characters/:characterId/edit`;
- backend command endpoint at `POST /api/character-library/command`;
- DB table `character_library_entries`;
- local SRD-style rules data and derived previews;
- English/Persian UI direction through `I18nProvider`;
- portrait validation and MVP storage;
- generated local builder art;
- PDF export through local templates with simple fallback;
- server-side submission of finalized Character Library entries into runtime
  pending assignment via `submit_character_library_entry_for_assignment`;
- Player-mode `/runtime` UI for loading finalized saved Character Library
  entries for the authenticated user, selecting one, and submitting it into
  the live session pending-assignment path;
- DM-mode `/runtime` assignment request cards that preview submitted runtime
  copies before assignment;
- assigned runtime character cards that keep showing source library provenance
  after DM assignment.

Current bridge state:

- the bridge creates a separate ready runtime character from the reusable
  library entry, records the source library entry ID in runtime metadata, and
  sets the session participant's `pendingCharacterId` for DM assignment;
- the reusable library entry is not mutated by live runtime state;
- the browser API helper, Player-mode submit affordance, and DM-mode pending
  request preview are wired;
- in DB mode, the bridge path is covered by the DB-backed session transaction
  boundary when injected, including runtime character-copy creation, session
  pending assignment, durable idempotency success, and a post-commit
  `session_state` outbox row;
- the local DB-mode combined browser harness
  `corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db`
  proves the saved-character bridge and Training Room placement/encounter
  recovery loop together without mutating the reusable library entry.

## What Is DB-Backed

DB mode is opt-in:

```bash
SERVER_PERSISTENCE_MODE=db
DATABASE_URL=postgres://user:password@localhost:5432/dnd_web
```

Apply `packages/db/migrations/` before DB-mode verification.

`corepack pnpm --filter @dnd/db check:readiness` now verifies that the target
database and client connection are UTF8 and that a Persian Unicode probe
round-trips, in addition to checking the required tables. This is required
before DB-mode Character Library/Builder validation because Persian UI and
user-entered Unicode content are product constraints.

Covered DB-backed slices include:

- character records;
- Character Library entries;
- auth users and sessions;
- session snapshots;
- scene records;
- active encounters;
- completed command idempotency records and pre-execution claims;
- transaction boundaries for the current covered paths;
- single-process outbox dispatch for covered live-command paths;
- read-only outbox backlog status at `GET /api/outbox/status`.
- a compact manual `/runtime` DM-mode outbox status badge using that endpoint.

## What Is Still In-Memory Or Process-Local

- Default startup can be in-memory.
- SSE subscribers are process-local.
- Some runtime caches are still intentionally in-memory after DB preload.
- Presence/subscriber state resets on restart.
- Unpublished outbox rows are not auto-redelivered on cold boot.
- `GET /api/outbox/status` reports unpublished backlog counts, but it does not
  drain rows, expose row IDs, or implement replay/catch-up.
- The `/runtime` outbox badge is a manual development/operator visibility aid,
  not production monitoring or alerting.

## Auth MVP Limitations

Auth currently supports the Character Library session MVP in DB mode:

- opaque `dnd_web_session` HttpOnly cookie;
- database stores only hashed session tokens;
- passwords are hashed with Node `scrypt`;
- logout revokes the current session row and clears the cookie.

It is not full production account security:

- no password reset;
- no email verification;
- no MFA;
- no OAuth;
- no account settings UI;
- no dedicated CSRF token beyond `SameSite=Lax`.

## SSE And Replay Limitations

SSE is live delivery only.

There is no:

- durable replay;
- stream cursor;
- catch-up API;
- exactly-once delivery;
- multi-process subscriber coordination;
- cold-boot outbox redelivery.

Clients recover current state by rereading authoritative read models such as
`reconnect_session`, `get_scene`, `get_active_scene_state`,
`get_encounter_state`, and `get_character`.

The server test suite now includes a DB-backed recovery audit for missed live
delivery: movement, encounter usage, and attack HP changes remain recoverable
through read models when no subscriber received the original SSE events, while
late subscribers still do not receive historical event replay.

## Runtime Limitations

Current runtime is intentionally narrow:

- condition tags are metadata only;
- attacks are narrow melee foundations: the server rolls a d20 against target
  AC with natural-20/natural-1 handling, then rolls a baseline `1d8` plus the
  attacker's Strength modifier for damage, doubling the dice on a critical.
  There is no weapon model, damage type, resistance, or per-class damage die;
- monster/NPC combatants are narrow DM-controlled actors, not full monster stat
  blocks;
- no monster AI;
- no full spell system;
- no opportunity attacks or reaction windows beyond current turn-resource
  foundations;
- no broad weapon, ranged, inventory, or death-save system;
- no full fog of war, line of sight, lighting, traps, locks, scripts, or
  automatic transition automation;
- terrain tiles carry only movement/vision blocking. There is no difficult
  terrain movement cost, no hazard damage (lava and deep water simply block
  movement), and terrain `blocksVision` is recorded but not yet consumed by any
  visibility system.
- Role projection currently covers scene entities only. `get_scene` strips
  hidden entities for players, but encounter state is not projected: a hidden
  combatant that the DM adds to an encounter still appears in the shared
  initiative order. It leaks only its entity ID and initiative - no name,
  position, HP, or stat block - and the cockpit falls back to rendering the raw
  ID, since the player's scene no longer carries the entity to resolve a name
  from. Whether a concealed creature belongs in a shared initiative order at all
  is an open product question, not just a filtering gap.
- Because a player's scene omits hidden blocking entities, the client movement
  preview can offer a cell the server rejects on submit. That is intended - the
  alternative reveals concealed blockers as holes in the reachable-cell overlay
  - but the resulting error text is generic rather than in-fiction.

## Frontend And Product Limitations

- `/runtime` is a functional cockpit, not final production UX.
- The tactical map's torch glow and vignette are atmosphere only. Nothing is
  occluded and there is no line-of-sight or fog-of-war system behind them.
- `/maps` publishes new scenes only. It cannot open, re-edit, or overwrite an
  existing server scene, and it does not activate what it publishes.
- `/characters` is a usable Character Library/Builder MVP, not a complete D&D
  character product.
- The Character Library to runtime assignment bridge has a server-side
  foundation, first Player-mode UI affordance, and narrow DB transaction/outbox
  coverage, but no replay/cursor/catch-up delivery guarantees.
- Adventure authoring and reusable map/content authoring are not complete
  product surfaces.
- Portrait uploads are MVP storage, not production asset storage.
- PDF export uses repo-owned local templates and a simple fallback.
- The local DB-mode Builder/Export smoke
  `corepack pnpm --filter @dnd/web test:smoke:builder-export-db` covers a
  Persian authenticated Character Library draft, persisted browser reload,
  portrait upload through the edit-page file input, persisted uploaded portrait
  reread/card rendering, edit/review sheet access, Review PDF artifact capture,
  draft finalization through the `/characters` card UI, card PDF artifact
  capture, and finalized-state persistence against a UTF-8 migrated local DB.
- The local DB-mode saved-character-to-Training-Room smoke
  `corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db`
  covers the combined saved Character Library entry -> Player runtime
  submission -> DM runtime-copy assignment -> Training Room placement ->
  encounter start -> browser recovery -> Player Local Reset recovery path
  against the same UTF-8 migrated local DB.
- The fresh product-confidence intake after that combined harness found no
  current mechanics blocker; the remaining optional confidence step is a
  reviewer-facing evidence closure packet, not new runtime behavior.
- The reviewer-facing combined harness closure packet is now recorded in
  `docs/delivery/COMBINED_HARNESS_EVIDENCE_CLOSURE_PACKET.md`; the recommended
  next action is human review / merge decision, with an optional separately
  approved screenshot packet only if visual evidence is needed.
- The human review / merge decision packet is now recorded in
  `docs/delivery/HUMAN_REVIEW_MERGE_DECISION_COMBINED_HARNESS.md`; it approves
  the reviewed combined harness evidence slice with cautions and recommends
  curated staging rather than merging the entire dirty working tree.
- The curated merge / optional screenshot decision packet is now recorded in
  `docs/delivery/CURATED_MERGE_OR_SCREENSHOT_PACKET.md`; it recommended
  curated merge preparation by default, with optional screenshots only on
  request.
- The post-merge main verification / closure packet is now recorded in
  `docs/delivery/POST_MERGE_MAIN_VERIFICATION_CLOSURE.md`; the curated
  combined harness evidence slice has landed on `main` as merge commit
  `c8d4015` and is closed for the current local single-process DB-mode evidence
  path.
- The post-merge fresh product playtest intake is now recorded in
  `docs/delivery/POST_MERGE_FRESH_PRODUCT_PLAYTEST_INTAKE.md`; it chose the
  reviewer-facing Character Library -> Runtime handoff path with `medium`
  effort. DB readiness, Builder/Export DB smoke, and saved-character Training
  Room DB smoke passed, and the next recommended slice is a docs-only reviewer
  playtest brief rather than new runtime or Character Library behavior.
- The Character Library -> Runtime handoff reviewer playtest brief is now
  recorded in
  `docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEWER_PLAYTEST_BRIEF.md`;
  it maps the current manual review checkpoints to existing smoke evidence and
  reiterates that the reusable Character Library entry, separate runtime copy,
  explicit DM assignment, Player Local Reset, and read-model recovery boundaries
  remain unchanged.
- The Character Library -> Runtime handoff review closure packet is now
  recorded in
  `docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_CLOSURE_PACKET.md`;
  it defines `pass`, `follow-up`, and `blocked` reviewer outcomes and keeps any
  follow-up scoped to the exact observed issue instead of automatic runtime or
  Character Library expansion.
- The Character Library -> Runtime handoff review verdict is now recorded in
  `docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_VERDICT.md`; verdict:
  `pass` with cautions. No follow-up slice is required from the current
  evidence, and the current handoff review sequence is closed.
- The Training Room table experience fresh goal intake is now recorded in
  `docs/delivery/TRAINING_ROOM_TABLE_EXPERIENCE_FRESH_GOAL_INTAKE.md`; fresh
  runtime smoke and two-profile runtime smoke passed on 2026-06-05, and the
  next recommended task is a docs/evidence Training Room reviewer pass rather
  than immediate runtime implementation.

## Current i18n Reality

The web app uses `I18nProvider` and has English/Persian direction. English is
LTR; Persian is RTL.

Future product work must preserve:

- localization-aware user-facing strings;
- Player and DM surfaces in both languages;
- validation/error copy compatible with translation;
- builder/runtime UI copy designed for both English and Persian;
- canonical IDs that are not localized labels;
- user-entered character data exactly as entered, without auto-translation.
