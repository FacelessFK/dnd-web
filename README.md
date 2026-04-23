# D&D DM-Driven Platform

Browser-based, DM-authoritative Dungeons & Dragons runtime built as a
TypeScript monorepo. The current backend is an in-memory authoritative runtime
with explicit protocol schemas, server-owned validation, SSE updates, and a
small reliability baseline.

## Current Status

The runtime foundation is complete through **Phase 8 — Runtime Reliability &
Reconnect Readiness**. The project is now in **Phase 9 — Runtime/API Surface
Cleanup & Manual Validation Readiness**.

Implemented so far:

- pnpm workspace monorepo with shared domain, protocol, rules, server, web, and
  database-placeholder packages
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
- backend DM current HP, active-scene reposition, turn-usage override, and
  encounter-end commands
- in-memory command idempotency for successful mutating command retries
- reconnect recovery through read models
- documented event/revision semantics and transaction-boundary limitations
- ESLint, Prettier, tests, and TypeScript validation

Not implemented yet:

- persistence-backed runtime storage
- durable idempotency, event replay, event cursors, or distributed coordination
- full transaction/outbox persistence boundaries
- opportunity attacks or out-of-turn reaction windows
- full condition engine, death saves, spells, weapons, ranged attacks, or monster
  AI
- frontend battle UX or character builder/library UI
- authentication, production deployment, or multi-process scaling

## Stack Summary

- TypeScript
- pnpm workspaces
- Next.js + React + Tailwind CSS
- Node.js
- Colyseus-ready server package
- PostgreSQL + Drizzle package placeholder
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
  db/       Database package placeholder
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
- `GET /api/sessions/:sessionId/stream?participantId=:participantId`

Current SSE event types:

- `session_state`: snapshot-style session state update with session revision
- `movement_state`: live partial movement/placement/reposition update
- `encounter_state`: snapshot-style encounter state update
- `combat_event`: transient combat result notification
- `character_state`: live partial character state update for DM HP overrides

Reliability notes:

- Mutating commands use `commandId` and are protected by in-memory idempotency.
- Duplicate successful mutating command retries return the cached success
  response without repeating side effects.
- Failed command responses are not cached.
- Read commands are intentionally not cached by idempotency.
- Idempotency is process-local and does not survive server restart.
- Missed transient SSE events are not replayed.
- After reconnect, clients should recover current authoritative state through
  read models: reconnect/session snapshot, `get_active_scene_state`,
  `get_encounter_state`, and `get_character`.

## Manual Validation

For the complete copy-pasteable scenario, see
[docs/manual-validation.md](docs/manual-validation.md). It walks through session
creation, SSE subscription, character setup, scene activation, placement,
encounter start, reaction/attack usage, reconnect recovery, read-model checks,
downed actor gating, and idempotent retry behavior.

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
- [docs/manual-validation.md](docs/manual-validation.md)
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
