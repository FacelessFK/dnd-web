# 0001: Initial Stack and Monorepo Baseline

## Status

Accepted

## Context

The project needs a browser-based, real-time, multiplayer foundation that preserves a DM-authoritative architecture while keeping early implementation simple enough for a solo developer to move quickly. Phase 0 is specifically about creating a stable monorepo baseline, not implementing gameplay.

## Decision

The repository uses the following initial stack:

- TypeScript across the workspace
- pnpm workspaces for monorepo management
- Next.js for `apps/web`
- Node.js for `apps/server`
- Colyseus as the intended room/server runtime direction
- PostgreSQL as the primary database direction
- Drizzle ORM for the database toolkit
- Zod for runtime validation and shared contracts

## Why This Was Chosen

- TypeScript keeps contracts consistent across client, server, and future shared packages.
- pnpm workspaces fit the planned monorepo shape with low overhead.
- Next.js provides a productive browser app baseline without forcing custom setup.
- Node.js aligns naturally with the TypeScript and Colyseus ecosystem.
- Colyseus matches the room-oriented, authoritative session model described in the design docs.
- PostgreSQL and Drizzle are a good fit for durable structured game data without adding unnecessary complexity in Phase 0.
- Zod supports the future need for runtime validation of client commands and shared payloads.

## Consequences

- Early development stays inside one TypeScript monorepo instead of splitting into multiple services.
- Shared contracts can live in `packages/` and evolve alongside both apps.
- More advanced infrastructure, authentication, and scaling concerns stay deferred until later phases prove the need.
