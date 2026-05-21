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
- transition node create/update/delete/activation;
- character placement and movement;
- mixed player/combatant encounters;
- turn usage;
- narrow melee attack handling;
- readable combat/event feed;
- DM assignment request previews for pending Player-submitted runtime
  characters, including source Character Library entry IDs when present;
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
  copies before assignment.

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
  `session_state` outbox row.

## What Is DB-Backed

DB mode is opt-in:

```bash
SERVER_PERSISTENCE_MODE=db
DATABASE_URL=postgres://user:password@localhost:5432/dnd_web
```

Apply `packages/db/migrations/` before DB-mode verification.

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
