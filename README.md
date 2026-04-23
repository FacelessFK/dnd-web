# D&D DM-Driven Platform

DM-first, top-down, rules-assisted tactical Dungeons & Dragons platform built as
a TypeScript monorepo. Players submit structured intent, the server owns
authoritative state, and the Dungeon Master remains fully authoritative over
adjudication and overrides.

The current repository is backend-first: the runtime foundations are much
stronger than the product UI. The next product direction is to make that runtime
usable through character onboarding, session setup, top-down tactical play, DM
controls, and durable persistence.

## Current Status

The backend runtime foundation is complete through **Phase 8 — Runtime
Reliability & Reconnect Readiness**. **Phase 9 — Runtime/API Surface Cleanup &
Manual Validation Readiness** refreshed API/manual-validation docs, and backend
Roadmap Phase 8 DM controls are implemented as narrow server-authoritative
commands. Phase 10 persistence work now includes a DB-backed character
repository boundary, transactional durable idempotency for supported
character mutations, a narrow durable session snapshot baseline for
restart-safe reconnect, and a DB-backed scene persistence baseline for
restart-safe active-scene rereads. Phase 10 Slice 7 closes that initial
durable-runtime foundation without changing gameplay behavior; most live
runtime state still remains process-local.

The next recommended persistence step is a dedicated DB-backed active-encounter
repository groundwork slice, not gameplay expansion.

Implemented so far:

- pnpm workspace monorepo with shared domain, protocol, rules, server, web, and
  database packages
- minimal Next.js web app shell
- authoritative Node.js TypeScript session server
- session create, join, reconnect, presence tracking, and SSE session sync
- rules profile foundation
- character create, update, finalize, assign, and read flows
- derived character stats helpers
- scene create, read, activate, entity placement, and active-scene read model
- character placement and movement in the active scene
- encounter start, read, turn advancement, and turn usage tracking
- action, bonus action, reaction, and movement usage commands
- narrow attack action foundation with legality-before-RNG validation
- downed actor gating derived from `hp.current === 0`
- backend DM current HP, condition tag, active-scene reposition, turn-usage,
  current-turn, and encounter-end override commands
- in-memory command idempotency by default, plus a DB-backed durable
  idempotency boundary for supported character-record mutation commands
- reconnect recovery through read models
- narrow restart durability baseline for persisted character rereads when the
  DB-backed character store is injected
- narrow durable session snapshot baseline for restart-safe reconnect when the
  DB-backed session store is injected
- narrow durable scene baseline for restart-safe `get_scene` and
  `get_active_scene_state` recovery when the DB-backed scene store is injected
- documented event/revision semantics and transaction-boundary limitations
- Drizzle/Postgres character persistence and idempotency boundaries for the
  currently supported narrow scope, plus DB-backed session snapshot
  persistence boundary and DB-backed scene persistence boundary
- ESLint, Prettier, tests, and TypeScript validation

Not implemented yet:

- fully persistence-backed runtime storage for encounters, movement state,
  streams, and broad live tactical continuity
- command-surface-wide durable idempotency, event replay, event cursors, or
  distributed coordination
- full transaction/outbox persistence boundaries
- character builder/library product UI
- top-down tactical battle UX, map/adventure editor, or frontend DM panel
- opportunity attacks or out-of-turn reaction windows
- full condition engine, death saves, spells, weapons, ranged attacks, or monster
  AI
- authentication, production deployment, or multi-process scaling

## Stack Summary

- TypeScript
- pnpm workspaces
- Next.js + React + Tailwind CSS
- Node.js
- Colyseus-ready server package
- PostgreSQL + Drizzle persistence package
- Zod protocol package

## Repository Structure

```text
apps/
  web/      Next.js App Router client
  server/   Node.js TypeScript authoritative runtime server
packages/
  shared/   Shared domain models and primitives
  protocol/ Shared protocol contracts and Zod validation
  rules/    Pure deterministic rules and derivation helpers
  db/       Drizzle/Postgres persistence boundaries and migrations
docs/
  decisions/ Architecture and stack decision records
scripts/    Repository-level helper scripts and smoke tests
```

## Install

Use Node 20 and pnpm:

```bash
nvm use
pnpm install
```

## Run Development

Start the web app and server together:

```bash
pnpm dev
```

Default local URLs:

- Web: `http://localhost:3000`
- Server: `http://localhost:2567`

Run only the server:

```bash
pnpm --filter @dnd/server dev
```

## API Surface

Current command endpoints:

- `POST /api/session/command`
- `POST /api/characters/command`
- `POST /api/scenes/command`
- `POST /api/movement/command`
- `POST /api/encounters/command`
- `POST /api/dm/command`

Current stream endpoint:

- `GET /api/sessions/:sessionId/stream?participantId=:participantId`

Current command groups:

| Endpoint                  | Mutating commands                                                                                                                                                                                         | Read-only commands       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `/api/session/command`    | `create_session`, `join_session`, `reconnect_session`                                                                                                                                                     | none                     |
| `/api/characters/command` | `create_character`, `update_character`, `finalize_character`, `assign_character_to_participant`                                                                                                           | `get_character`          |
| `/api/scenes/command`     | `create_scene`, `activate_scene_for_session`, `place_entity_in_scene`                                                                                                                                     | `get_scene`              |
| `/api/movement/command`   | `place_character_in_active_scene`, `move_character_in_active_scene`                                                                                                                                       | `get_active_scene_state` |
| `/api/encounters/command` | `start_encounter`, `advance_turn`, `use_action`, `use_bonus_action`, `use_reaction`, `record_movement_usage`, `attack`                                                                                    | `get_encounter_state`    |
| `/api/dm/command`         | `dm_set_character_current_hp`, `dm_set_character_active_conditions`, `dm_reposition_character_in_active_scene`, `dm_set_current_turn_usage`, `dm_set_current_turn_participant`, `dm_end_active_encounter` | none                     |

Current SSE event types:

- `session_state`: snapshot-style session state update with session revision.
- `encounter_state`: snapshot-style encounter state update. It does not imply a
  session revision change.
- `movement_state`: live partial movement/placement/reposition update, not a
  durable full-scene snapshot.
- `combat_event`: transient combat result notification, currently used for
  resolved attacks.
- `character_state`: live partial character update for DM HP and condition-tag
  changes. Payloads always include authoritative HP and may include
  `activeConditions`.

Current response/error behavior:

- Successful command responses use `{ "ok": true, "data": ... }`.
- Failed command responses use `{ "ok": false, "error": { "code", "message" } }`.
- Validation problems generally return `400`.
- Missing resources generally return `404`.
- Valid commands rejected by current authoritative state generally return `409`.
- Role/DM authorization failures return `403`.
- Unexpected internal failures return `500`.

Reliability notes:

- Mutating commands use `commandId` and are protected by in-memory idempotency by
  default.
- Duplicate successful mutating command retries return the cached success
  response without repeating side effects.
- Failed command responses are not cached.
- Read commands are intentionally not cached by idempotency.
- Command idempotency is scoped by command category, command type, command ID,
  actor participant ID, and session ID when available.
- Phase 10 adds a DB-backed idempotency record boundary for supported
  character-record mutation commands when the DB-backed stores are injected:
  `create_character`, `update_character`, `finalize_character`,
  `dm_set_character_current_hp`, and
  `dm_set_character_active_conditions`.
- For those supported injected DB paths, character writes and durable
  successful-command idempotency records can be committed in the same real DB
  transaction.
- Default local startup still uses in-memory session, scene, encounter, and
  stream state.
- When the DB-backed session snapshot store is injected, session identity,
  participant membership, participant roles/display names, assigned character
  IDs, and the stored `activeSceneId` can survive runtime reinitialization and
  allow `reconnect_session` to succeed.
- When the DB-backed scene store is injected too, scene definitions can survive
  runtime reinitialization and `get_scene` can reread them after restart.
- When the DB-backed character store, DB-backed session snapshot store, and
  DB-backed scene store are all injected, `get_active_scene_state` can reread a
  narrow active-scene snapshot after restart if character overlays already
  contain valid active-scene placement.
- Internal runtime/store typing still carries deliberate technical debt here:
  some runtime methods stay externally stable while returning a Promise on
  injected DB-backed paths.
- Presence, subscriber state, encounter continuity, stream delivery, replay,
  and catch-up semantics remain non-durable; do not treat the whole command
  surface as restart-safe.
- Session snapshots and scene records duplicate some invariants in both row
  columns and JSON payloads today; that is intentional for this narrow baseline
  but still a cleanup target for a later persistence phase.
- Missed transient SSE events are not replayed.
- After reconnect, clients should recover current authoritative state through
  read models: reconnect/session snapshot, `get_active_scene_state`,
  `get_encounter_state`, and `get_character`.

## Manual Validation

For the complete copy-pasteable scenario, see
[docs/manual-validation.md](docs/manual-validation.md). It walks through session
creation, SSE subscription, character setup, scene activation, placement,
encounter start, reaction/attack usage, reconnect recovery, read-model checks,
downed actor gating, DM override commands, and idempotent retry behavior.

Quick smoke flow:

```bash
pnpm --filter @dnd/server dev
```

```bash
curl http://127.0.0.1:2567/
```

```bash
curl -X POST http://127.0.0.1:2567/api/session/command \
  -H 'content-type: application/json' \
  -d '{
    "commandId": "create-1",
    "type": "create_session",
    "actor": {
      "participantId": "dm-001",
      "displayName": "Dungeon Master",
      "role": "dm"
    },
    "payload": {
      "rulesProfileId": "dnd5e-2024-core"
    }
  }'
```

## Available Scripts

- `pnpm dev` runs the web and server apps in parallel
- `pnpm lint` runs ESLint across the workspace
- `pnpm format` formats the repository with Prettier
- `pnpm format:check` checks formatting without writing changes
- `pnpm test` runs the server runtime tests and repo smoke test
- `pnpm typecheck` runs TypeScript checks for workspace packages that define it

## Environment Variables

Copy values from `.env.example` and keep secrets out of git. The initial
baseline includes:

- `DATABASE_URL`
- `SERVER_PORT`
- `NEXT_PUBLIC_APP_URL`

The server loads environment variables at startup via `dotenv/config`, so a
repo-root `.env` file works for local development.

## Main Docs

- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)
- [PRD.md](PRD.md)
- [ROADMAP.md](ROADMAP.md)
- [01_PRODUCT_BLUEPRINT.md](01_PRODUCT_BLUEPRINT.md)
- [02_DOMAIN_MODEL_AND_GAMEPLAY_FLOWS.md](02_DOMAIN_MODEL_AND_GAMEPLAY_FLOWS.md)
- [03_UX_AND_VIEW_POLICY.md](03_UX_AND_VIEW_POLICY.md)
- [04_CHARACTER_AND_CONTENT_STRATEGY.md](04_CHARACTER_AND_CONTENT_STRATEGY.md)
- [05_REVISED_PRODUCT_ROADMAP.md](05_REVISED_PRODUCT_ROADMAP.md)
- [docs/manual-validation.md](docs/manual-validation.md)
- [dnd_project_handoff_context.md](dnd_project_handoff_context.md)
- [TASKS_PHASE_0.md](TASKS_PHASE_0.md)
- [TASKS_PHASE_1.md](TASKS_PHASE_1.md)
- [TASKS_PHASE_3.md](TASKS_PHASE_3.md)
- [TASKS_PHASE_4.md](TASKS_PHASE_4.md)
- [TASKS_PHASE_5.md](TASKS_PHASE_5.md)
- [TASKS_PHASE_6.md](TASKS_PHASE_6.md)
- [TASKS_PHASE_7.md](TASKS_PHASE_7.md)
- [TASKS_PHASE_8.md](TASKS_PHASE_8.md)
- [TASKS_PHASE_9.md](TASKS_PHASE_9.md)
- [TASKS_ROADMAP_PHASE_8_DM_CONTROLS.md](TASKS_ROADMAP_PHASE_8_DM_CONTROLS.md)
- [STACK_DECISIONS.md](STACK_DECISIONS.md)
- [docs/decisions/0001-initial-stack.md](docs/decisions/0001-initial-stack.md)
- [docs/decisions/0002-dm-first-authority-and-intent-model.md](docs/decisions/0002-dm-first-authority-and-intent-model.md)
- [docs/decisions/0003-top-down-2d-tactical-visual-direction.md](docs/decisions/0003-top-down-2d-tactical-visual-direction.md)
- [docs/decisions/0004-character-builder-and-library-inside-monolith.md](docs/decisions/0004-character-builder-and-library-inside-monolith.md)
