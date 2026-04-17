# D&D DM-Driven Platform

Browser-based, DM-authoritative Dungeons & Dragons runtime built as a TypeScript monorepo. The current implementation includes the early authoritative session runtime plus the first rules-profile and character foundation slice.

## Current Status

The repository is currently at **Phase 2, Slice 1: Rules Profile + Character Foundation**.

Implemented so far:

- pnpm workspace monorepo
- minimal Next.js web app
- authoritative Node.js TypeScript session server
- session creation, join, reconnect, presence tracking, and SSE sync
- shared rules profile, character, encounter overlay, and derived stat models
- minimal in-memory character runtime and participant character assignment
- ESLint, Prettier, tests, and CI

Not implemented yet:

- gameplay systems
- map runtime
- combat, movement, or dice resolution
- persistence-backed character/session storage
- full rules engine behavior

## Stack Summary

- TypeScript
- pnpm workspaces
- Next.js + React + Tailwind CSS
- Node.js
- Colyseus-ready server package
- PostgreSQL + Drizzle package placeholder
- Zod-ready protocol package

## Repository Structure

```text
apps/
  web/      Next.js App Router client
  server/   Node.js TypeScript server skeleton
packages/
  shared/   Shared domain models and primitives
  protocol/ Shared protocol contracts and Zod validation
  rules/    Derived stat helpers and future rules engine surface
  db/       Database package placeholder
docs/
  decisions/ Architecture and stack decision records
scripts/    Repository-level helper scripts and placeholder tests
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

## Manual Validation

From the repo root, start the server:

```bash
pnpm --filter @dnd/server dev
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

Subscribe to authoritative session updates with the returned `sessionId`:

```bash
curl -N "http://127.0.0.1:2567/api/sessions/<SESSION_ID>/stream?participantId=dm-001"
```

Join from another terminal:

```bash
curl -X POST http://127.0.0.1:2567/api/session/command \
  -H 'content-type: application/json' \
  -d '{
    "commandId": "join-1",
    "type": "join_session",
    "actor": {
      "participantId": "player-001",
      "displayName": "Player One",
      "role": "player"
    },
    "payload": {
      "sessionId": "<SESSION_ID>"
    }
  }'
```

Create a character for the joined player:

```bash
curl -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d '{
    "commandId": "character-create-1",
    "type": "create_character",
    "actor": {
      "participantId": "player-001"
    },
    "payload": {
      "sessionId": "<SESSION_ID>",
      "ownerParticipantId": "player-001",
      "character": {
        "name": "Aria",
        "level": 5,
        "className": "Wizard",
        "speciesOrRace": "Elf",
        "background": "Sage",
        "abilities": {
          "str": 8,
          "dex": 14,
          "con": 13,
          "int": 16,
          "wis": 12,
          "cha": 10
        },
        "hp": {
          "max": 26,
          "current": 26,
          "temp": 0
        },
        "armorClass": 13,
        "speed": 30
      }
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

Copy values from `.env.example` and keep secrets out of git. The initial baseline includes:

- `DATABASE_URL`
- `SERVER_PORT`
- `NEXT_PUBLIC_APP_URL`

The server loads environment variables at startup via `dotenv/config`, so a repo-root `.env` file works for local development.

## Main Docs

- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)
- [PRD.md](PRD.md)
- [ROADMAP.md](ROADMAP.md)
- [TASKS_PHASE_0.md](TASKS_PHASE_0.md)
- [TASKS_PHASE_1.md](TASKS_PHASE_1.md)
- [STACK_DECISIONS.md](STACK_DECISIONS.md)
- [docs/decisions/0001-initial-stack.md](docs/decisions/0001-initial-stack.md)
