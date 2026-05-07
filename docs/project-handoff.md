# Project Handoff

## Current State

The repository is a TypeScript pnpm monorepo with:

- `apps/server`: authoritative Node runtime and HTTP/SSE command surface.
- `apps/web`: Next.js role-aware runtime surface.
- `packages/protocol`: shared Zod schemas and inferred protocol types.
- `packages/shared`: shared domain primitives.
- `packages/rules`: deterministic rules and derived-stat helpers.
- `packages/db`: Drizzle/Postgres schema, adapters, migrations, and unit of
  work boundaries.

The backend currently supports sessions, participants, character lifecycle,
scene creation/activation, active-scene placement and movement, encounter turn
state, attack foundation, downed actor gating, reaction usage, backend DM
controls, idempotent successful command retries, reconnect/read-model recovery,
DB-backed transactional slices, and single-process post-commit outbox dispatch
for covered live-command paths.

Cold boot remains honest: the server does not auto-drain unpublished outbox rows
because current SSE subscribers are process-local and there is no replay or
catch-up surface.

## Runtime Surface

The browser runtime surface lives at:

```text
http://localhost:3000/runtime
```

It is a dark-fantasy tactical tabletop MVP with role-aware DM and Player modes.
It can:

- launch in DM mode or Player mode,
- configure the active role participant ID and display name,
- create a DM-owned session,
- join a player to an existing session,
- run a DM-only fresh demo setup flow for local playtesting,
- seed sample players and characters from DM mode,
- create and activate an 8x8 scene from DM mode,
- place both sample characters from DM mode,
- start an encounter from DM mode,
- subscribe to the session SSE stream as the active role,
- display session, active-scene, encounter, assigned-character, tactical-grid,
  and readable live combat/event-feed state,
- recover state after refresh using session, scene, active-scene, encounter,
  and assigned-character read-model commands,
- paste an existing session ID and clear local cockpit state without touching
  backend state,
- let players create, update, and finalize their own character draft through
  the existing character command surface,
- let players submit finalized characters into authoritative session state for
  DM assignment,
- show pending assignment requests from session state and let DMs assign them,
- let players move only their own token, use their own action/bonus/reaction,
  and attack selected player targets,
- let DMs trigger turn advance, attack/movement for selected player actors, HP
  overrides, reposition, condition tags, turn actor override, turn usage
  override, and encounter end.

The UI intentionally submits commands to the authoritative server instead of
treating browser state as truth. It is role-aware, but it is not production
authentication or authorization.

## Running Locally

Install:

```bash
pnpm install
```

Run both apps:

```bash
pnpm dev
```

Default URLs:

- Web: `http://localhost:3000`
- Runtime server: `http://localhost:2567`

Override the runtime server used by the web app:

```bash
NEXT_PUBLIC_SERVER_URL=http://localhost:2567 pnpm --filter @dnd/web dev
```

Manual backend validation remains documented in:

```text
docs/manual-validation.md
```

## Validation

Expected repository validation:

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm format:check
```

The web package has lightweight Node test coverage for runtime API parsing and
cockpit recovery helpers. Backend behavior remains covered by the existing
server tests and smoke tests.

## Useful Docs

- `docs/api-surface.md`: endpoint, command, SSE, idempotency, and recovery
  surface.
- `docs/manual-validation.md`: copy-paste backend manual validation flow.
- `docs/persistence-boundaries.md`: persistence and transaction boundary notes.
- `TASKS_PHASE_9.md`: Phase 9 documentation/handoff checklist history.

## Known Limitations

- No authentication or production deployment posture.
- No durable event replay, stream cursor, or catch-up API.
- No multi-process SSE subscriber persistence or distributed coordination.
- No opportunity attacks, out-of-turn reaction windows, full condition engine,
  death saves, spells, weapons, ranged attacks, or monster AI.
- The runtime surface is a playable DM/player MVP, not production auth or a
  final product UX.
- The default local server still starts with the in-memory runtime unless
  composed with DB-backed stores and transaction boundaries.

## Recommended Next Work

- Add a browser-oriented smoke flow if the cockpit becomes a long-lived manual
  validation surface.
- Add product-grade player-facing views and accessibility audits after the
  current runtime surface has served its manual validation purpose.
- Continue persistence work only with explicit claims about which command paths
  are covered.
