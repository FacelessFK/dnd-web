# Current State

This document summarizes the current implementation reality for planning and
Codex task execution. For exact payloads, use `docs/api-surface.md` and
`packages/protocol`.

## What Exists Now

- TypeScript pnpm monorepo.
- Next.js web app with `/runtime`, `/characters`, and `/login`.
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
- scene create/activate/read;
- passive scene entity create/update/reposition/delete;
- compact DM scene entity palette that fills the existing placement draft with
  wall, cover, marker, hidden prop, player spawn, and monster spawn presets;
- transition node create/update/delete/activation;
- compact DM transition preset palette that fills the existing transition draft
  with door, stairs, portal, gate, and other exit presets;
- character placement and movement;
- local tactical board camera controls for zoom, bounded pan, and reset view;
- tactical board badges for selected movement cell, selected token,
  current-turn actor, and attack target affordances;
- tactical board keyboard affordances for roving selected-cell focus and
  arrow/Home/End navigation;
- DM-facing Table Setup checklist derived from session, player assignment,
  scene, token placement, and encounter read state;
- named Training Room Skirmish demo scenario setup that uses existing runtime
  commands and current local sample data;
- mixed player/combatant encounters;
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
- attacks are narrow melee foundations with fixed hit damage in the current
  MVP;
- monster/NPC combatants are narrow DM-controlled actors, not full monster stat
  blocks;
- no monster AI;
- no full spell system;
- no opportunity attacks or reaction windows beyond current turn-resource
  foundations;
- no broad weapon, ranged, inventory, or death-save system;
- no full fog of war, line of sight, lighting, traps, locks, scripts, or
  automatic transition automation.

## Frontend And Product Limitations

- `/runtime` is a functional cockpit, not final production UX.
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
  `docs/delivery/CURATED_MERGE_OR_SCREENSHOT_PACKET.md`; it recommends curated
  merge preparation by default, optional screenshots only on request, and no
  actual git staging/commit/merge until a human explicitly asks for it.

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
