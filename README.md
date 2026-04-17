# D&D DM-Driven Platform

Minimal Phase 0 monorepo foundation for a browser-based, DM-authoritative Dungeons & Dragons runtime. This repository is intentionally focused on project structure, tooling, and local workflow so Phase 1 can start from a clean baseline.

## Current Status

The repository is currently at **Phase 0: Foundation & Repo Setup**.

Implemented in this phase:

- pnpm workspace monorepo
- minimal Next.js web app
- minimal Node.js TypeScript server app
- shared package placeholders for future domain work
- ESLint, Prettier, test baseline, and CI

Not implemented in this phase:

- gameplay systems
- rules engine logic
- movement, combat, or dice handling
- session runtime features

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
  shared/   Shared utilities and cross-app primitives
  protocol/ Shared protocol and validation package placeholder
  rules/    Rules engine package placeholder
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
    "payload": {}
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

## Available Scripts

- `pnpm dev` runs the web and server apps in parallel
- `pnpm lint` runs ESLint across the workspace
- `pnpm format` formats the repository with Prettier
- `pnpm format:check` checks formatting without writing changes
- `pnpm test` runs the placeholder Phase 0 smoke tests
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
