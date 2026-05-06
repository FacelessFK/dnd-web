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

The repository now has the first useful browser runtime cockpit at
`/runtime`, plus refreshed Phase 9 API and handoff documentation. The cockpit
lets a developer or DM manually operate the existing authoritative backend:
create a session, seed sample players and characters, create and activate a
scene, place tokens, start an encounter, drive turn/combat/DM controls, watch
SSE events, and recover current state through read models after refresh.

The backend is ahead of the original Phase 9 cleanup goal. Recent persistence
work includes DB-backed character, session snapshot, scene, active-encounter,
encounter-only transaction, combat transaction, movement, scene transaction,
pre-execution idempotency claim, and single-process outbox foundations for
covered DB-backed paths. Default local startup still uses the in-memory
runtime, and live SSE subscribers remain process-local. There is still no event
replay, stream cursor, catch-up API, or distributed coordination.

Implemented so far:

- pnpm workspace monorepo with shared domain, protocol, rules, server, web, and
  database packages
- Next.js runtime cockpit at `/runtime`
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
- narrow durable active-encounter baseline for restart-safe
  `get_encounter_state` recovery when DB-backed session, character, scene, and
  active-encounter stores are all injected
- encounter-only transactional durable idempotency for supported
  encounter-local mutation commands on the injected DB-backed path
- attack-first cross-store transactional durable idempotency on the injected
  DB-backed path for atomic target HP write + encounter usage write + durable
  completed-command success record commit
- movement-spending encounter-aware transactional durable idempotency on the
  injected DB-backed path for atomic character position write + encounter
  movement-usage write + durable completed-command success record commit
- documented API surface, event/revision semantics, reconnect guidance,
  cockpit usage, and transaction-boundary limitations
- Drizzle/Postgres character persistence and idempotency boundaries for the
  currently supported narrow scope, plus DB-backed session snapshot
  persistence boundary, DB-backed scene persistence boundary, and DB-backed
  active-encounter persistence boundary
- ESLint, Prettier, tests, and TypeScript validation

Not implemented yet:

- fully persistence-backed stream delivery and broad live tactical continuity
- command-surface-wide durable idempotency, event replay, event cursors, or
  distributed coordination beyond the currently covered DB-backed slices
- full transaction/outbox persistence boundaries across every command path
- character builder/library product UI
- product-grade player UX, map/adventure editor, or polished DM panel
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
- Runtime cockpit: `http://localhost:3000/runtime`

Run only the server:

```bash
pnpm --filter @dnd/server dev
```

## API Surface

See [docs/api-surface.md](docs/api-surface.md) for the detailed endpoint,
command, SSE, idempotency, and recovery surface. Current command endpoints:

- `POST /api/session/command`
- `POST /api/characters/command`
- `POST /api/scenes/command`
- `POST /api/movement/command`
- `POST /api/encounters/command`
- `POST /api/dm/command`

Current stream endpoint:

- `GET /api/sessions/:sessionId/stream?participantId=:participantId`

Current high-level command groups:

| Endpoint                  | Main commands                                        | Read commands            |
| ------------------------- | ---------------------------------------------------- | ------------------------ |
| `/api/session/command`    | create, join, reconnect                              | reconnect recovery       |
| `/api/characters/command` | create, update, finalize, assign                     | `get_character`          |
| `/api/scenes/command`     | create, activate, place scene entity                 | `get_scene`              |
| `/api/movement/command`   | place character, move character                      | `get_active_scene_state` |
| `/api/encounters/command` | start, advance, use turn resources, movement, attack | `get_encounter_state`    |
| `/api/dm/command`         | HP, conditions, reposition, turn overrides, end      | none                     |

Current SSE event types:

- `session_state`: snapshot-style session state update with session revision.
- `encounter_state`: snapshot-style encounter state update. It does not imply a
  session revision change.
- `movement_state`: live partial movement/placement/reposition update, not a
  durable full-scene snapshot.
- `combat_event`: transient combat result notification for resolved attacks.
- `character_state`: live partial character update for DM HP and condition-tag
  changes.

Missed transient SSE events are not replayed. After reconnect, clients should
recover current authoritative state through read models:
`reconnect_session`, `get_active_scene_state`, `get_encounter_state`, and
`get_character`.

## Manual Validation

For the complete copy-pasteable scenario, see
[docs/manual-validation.md](docs/manual-validation.md). It walks through session
creation, SSE subscription, character setup, scene activation, placement,
encounter start, reaction/attack usage, reconnect recovery, read-model checks,
downed actor gating, DM override commands, and idempotent retry behavior.

For browser-based manual operation, start both apps and open
`http://localhost:3000/runtime`.

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
- `NEXT_PUBLIC_SERVER_URL`

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
- [docs/api-surface.md](docs/api-surface.md)
- [docs/project-handoff.md](docs/project-handoff.md)
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
