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
- `GET /api/sessions/:sessionId/stream?participantId=:participantId`

Current SSE event types:

- `session_state`: snapshot-style session state update with session revision
- `movement_state`: live partial movement/placement update
- `encounter_state`: snapshot-style encounter state update
- `combat_event`: transient combat result notification

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

Start the server:

```bash
pnpm --filter @dnd/server dev
```

Check server status:

```bash
curl http://127.0.0.1:2567/
```

Create a session:

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

Set the returned session ID for later commands:

```bash
export SESSION_ID="<SESSION_ID>"
```

Subscribe to the session stream in another terminal:

```bash
curl -N "http://127.0.0.1:2567/api/sessions/$SESSION_ID/stream?participantId=dm-001"
```

Join two players:

```bash
curl -X POST http://127.0.0.1:2567/api/session/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"join-player-1\",
    \"type\": \"join_session\",
    \"actor\": {
      \"participantId\": \"player-001\",
      \"displayName\": \"Player One\",
      \"role\": \"player\"
    },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\"
    }
  }"

curl -X POST http://127.0.0.1:2567/api/session/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"join-player-2\",
    \"type\": \"join_session\",
    \"actor\": {
      \"participantId\": \"player-002\",
      \"displayName\": \"Player Two\",
      \"role\": \"player\"
    },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\"
    }
  }"
```

Create one character for each player. Copy the returned character IDs into
`CHARACTER_ONE_ID` and `CHARACTER_TWO_ID`.

```bash
curl -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"character-create-1\",
    \"type\": \"create_character\",
    \"actor\": { \"participantId\": \"player-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"ownerParticipantId\": \"player-001\",
      \"character\": {
        \"name\": \"Aria\",
        \"level\": 5,
        \"className\": \"Wizard\",
        \"speciesOrRace\": \"Elf\",
        \"background\": \"Sage\",
        \"abilities\": {
          \"str\": 8,
          \"dex\": 14,
          \"con\": 13,
          \"int\": 16,
          \"wis\": 12,
          \"cha\": 10
        },
        \"hp\": { \"max\": 26, \"current\": 26, \"temp\": 0 },
        \"armorClass\": 13,
        \"speed\": 30
      }
    }
  }"

curl -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"character-create-2\",
    \"type\": \"create_character\",
    \"actor\": { \"participantId\": \"player-002\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"ownerParticipantId\": \"player-002\",
      \"character\": {
        \"name\": \"Borin\",
        \"level\": 5,
        \"className\": \"Fighter\",
        \"speciesOrRace\": \"Dwarf\",
        \"background\": \"Guard\",
        \"abilities\": {
          \"str\": 16,
          \"dex\": 12,
          \"con\": 14,
          \"int\": 10,
          \"wis\": 10,
          \"cha\": 8
        },
        \"hp\": { \"max\": 34, \"current\": 34, \"temp\": 0 },
        \"armorClass\": 16,
        \"speed\": 30
      }
    }
  }"
```

Finalize and assign both characters:

```bash
export CHARACTER_ONE_ID="<CHARACTER_ONE_ID>"
export CHARACTER_TWO_ID="<CHARACTER_TWO_ID>"

curl -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"finalize-character-1\",
    \"type\": \"finalize_character\",
    \"actor\": { \"participantId\": \"player-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"characterId\": \"$CHARACTER_ONE_ID\"
    }
  }"

curl -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"finalize-character-2\",
    \"type\": \"finalize_character\",
    \"actor\": { \"participantId\": \"player-002\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"characterId\": \"$CHARACTER_TWO_ID\"
    }
  }"

curl -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"assign-character-1\",
    \"type\": \"assign_character_to_participant\",
    \"actor\": { \"participantId\": \"dm-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"participantId\": \"player-001\",
      \"characterId\": \"$CHARACTER_ONE_ID\"
    }
  }"

curl -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"assign-character-2\",
    \"type\": \"assign_character_to_participant\",
    \"actor\": { \"participantId\": \"dm-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"participantId\": \"player-002\",
      \"characterId\": \"$CHARACTER_TWO_ID\"
    }
  }"
```

Create and activate a scene. Copy the returned scene ID into `SCENE_ID`.

```bash
curl -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"scene-create-1\",
    \"type\": \"create_scene\",
    \"actor\": { \"participantId\": \"dm-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"scene\": {
        \"name\": \"Training Room\",
        \"grid\": {
          \"width\": 8,
          \"height\": 8,
          \"cellSizeFeet\": 5
        }
      }
    }
  }"

export SCENE_ID="<SCENE_ID>"

curl -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"scene-activate-1\",
    \"type\": \"activate_scene_for_session\",
    \"actor\": { \"participantId\": \"dm-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"sceneId\": \"$SCENE_ID\"
    }
  }"
```

Place both characters, start an encounter, and resolve one attack:

```bash
curl -X POST http://127.0.0.1:2567/api/movement/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"place-character-1\",
    \"type\": \"place_character_in_active_scene\",
    \"actor\": { \"participantId\": \"player-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"participantId\": \"player-001\",
      \"position\": { \"x\": 0, \"y\": 0 }
    }
  }"

curl -X POST http://127.0.0.1:2567/api/movement/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"place-character-2\",
    \"type\": \"place_character_in_active_scene\",
    \"actor\": { \"participantId\": \"player-002\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"participantId\": \"player-002\",
      \"position\": { \"x\": 1, \"y\": 0 }
    }
  }"

curl -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"encounter-start-1\",
    \"type\": \"start_encounter\",
    \"actor\": { \"participantId\": \"dm-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\"
    }
  }"

curl -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"attack-1\",
    \"type\": \"attack\",
    \"actor\": { \"participantId\": \"player-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"targetParticipantId\": \"player-002\"
    }
  }"
```

Reconnect and re-read authoritative state:

```bash
curl -X POST http://127.0.0.1:2567/api/session/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"reconnect-player-1\",
    \"type\": \"reconnect_session\",
    \"actor\": { \"participantId\": \"player-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\"
    }
  }"

curl -X POST http://127.0.0.1:2567/api/movement/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"read-active-scene-1\",
    \"type\": \"get_active_scene_state\",
    \"actor\": { \"participantId\": \"player-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\"
    }
  }"

curl -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"read-encounter-1\",
    \"type\": \"get_encounter_state\",
    \"actor\": { \"participantId\": \"player-001\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\"
    }
  }"

curl -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d "{
    \"commandId\": \"read-target-character-1\",
    \"type\": \"get_character\",
    \"actor\": { \"participantId\": \"player-002\" },
    \"payload\": {
      \"sessionId\": \"$SESSION_ID\",
      \"characterId\": \"$CHARACTER_TWO_ID\"
    }
  }"
```

Retry a successful mutating command with the same `commandId` and identical
payload to confirm the in-memory idempotency cache returns the same success
response without repeating side effects.

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
- [TASKS_PHASE_0.md](TASKS_PHASE_0.md)
- [TASKS_PHASE_1.md](TASKS_PHASE_1.md)
- [TASKS_PHASE_3.md](TASKS_PHASE_3.md)
- [TASKS_PHASE_4.md](TASKS_PHASE_4.md)
- [TASKS_PHASE_5.md](TASKS_PHASE_5.md)
- [TASKS_PHASE_6.md](TASKS_PHASE_6.md)
- [TASKS_PHASE_7.md](TASKS_PHASE_7.md)
- [TASKS_PHASE_8.md](TASKS_PHASE_8.md)
- [TASKS_PHASE_9.md](TASKS_PHASE_9.md)
- [STACK_DECISIONS.md](STACK_DECISIONS.md)
- [docs/decisions/0001-initial-stack.md](docs/decisions/0001-initial-stack.md)
