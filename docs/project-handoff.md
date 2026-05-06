# Project Handoff

## Current State

The repository is a TypeScript pnpm monorepo with:

- `apps/server`: authoritative Node runtime and HTTP/SSE command surface.
- `apps/web`: Next.js runtime cockpit.
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

## Runtime Cockpit

The cockpit lives at:

```text
http://localhost:3000/runtime
```

It can:

- configure the DM participant ID and display name,
- create a session,
- join two sample players,
- create, finalize, and assign sample characters,
- create and activate an 8x8 scene,
- place both sample characters,
- start an encounter,
- subscribe to the session SSE stream,
- display session, active-scene, encounter, character, and event-log state,
- recover state after refresh using read-model commands,
- trigger action, bonus action, reaction, turn advance, attack, movement, DM HP,
  DM reposition, condition tags, turn actor override, turn usage override, and
  encounter end.

The UI intentionally submits commands to the authoritative server instead of
treating browser state as truth.

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

There is no dedicated frontend test runner yet. The cockpit is covered by
TypeScript and linting, while backend behavior remains covered by the existing
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
- The cockpit is a developer/DM runtime tool, not a polished player product
  experience.
- The default local server still starts with the in-memory runtime unless
  composed with DB-backed stores and transaction boundaries.

## Recommended Next Work

- Add a small browser-oriented smoke flow once there is an agreed frontend test
  tool.
- Improve cockpit ergonomics around loading an existing session without local
  storage.
- Add product-grade player-facing views after the current runtime cockpit has
  served its manual validation purpose.
- Continue persistence work only with explicit claims about which command paths
  are covered.
