# DND-web

DM-first, top-down, rules-assisted D&D tabletop runtime and character product
surface. The server owns authoritative runtime state. Players submit structured
intent. The DM remains final authority through explicit server-side controls.

This is not a CRPG and does not automate full D&D play. It is a visual tabletop
runtime with rules-assisted workflows.

## Current Surfaces

- `/runtime`: live tactical tabletop cockpit with DM and Player modes.
- `/characters`: Character Library and Character Builder surface.
- `/login`: auth screen for the DB-backed Character Library session MVP.

## Current State

Runtime support includes session create/join/reconnect, SSE session stream,
scene creation/activation, passive scene entities, transition nodes, character
placement and movement, mixed player/combatant encounters, turn usage, narrow
attack handling, a compact current-turn rail, selected target/action-result
feedback, selected movement/turn-budget feedback, encounter status feedback,
player readiness feedback, action economy feedback,
DM HP/condition/reposition/turn overrides, read-model recovery after refresh,
and recovery status feedback for local playtesting.

The Character Library has a backend command surface at
`POST /api/character-library/command`. In DB mode it persists entries in
`character_library_entries`; in default in-memory startup it is process-local.
The browser `/characters` UI expects a logged-in user. Register/login use
DB-backed opaque sessions with an HttpOnly cookie; the raw session token is not
stored in browser localStorage/sessionStorage and only a token hash is stored in
the database. Passwords are hashed with Node `scrypt` for this MVP. This is
still not full production account security: there is no password reset, email
verification, MFA, OAuth, dedicated CSRF token, or account management UI.

The Character Builder is separate from `/runtime`. It stores reusable
library/build records, supports English/Persian direction, local portrait upload
as MVP data URLs, SRD-style local rules previews, generated local art assets,
and PDF export through local character sheet templates with a simple fallback.
Library entries are not live-session HP/position/condition overlays. The server
now has a bridge command that copies finalized library entries into separate
runtime characters for pending DM assignment. Player-mode `/runtime` can load
finalized saved entries for the authenticated user and submit one into the live
session while keeping DM assignment authority intact.

DB mode injects Drizzle/Postgres stores for the covered runtime and character
library paths, plus current transaction/idempotency/outbox slices. There is no
event replay, stream cursor, catch-up API, exactly-once delivery, production
auth, or multi-process coordination.

## Documentation Source Of Truth

Start with [CODEX_CONTEXT.md](CODEX_CONTEXT.md) for AI-assisted work. Current
product and delivery docs live under `docs/product/`, `docs/domain/`,
`docs/engineering/`, and `docs/delivery/`.

Raw context under `docs/context/` is archive/input material only. It is useful
for extracting intent, but it is not source of truth when it conflicts with the
current handoff, API surface, persistence notes, or implementation.

## Stack

- TypeScript pnpm monorepo
- `apps/web`: Next.js / React / Tailwind
- `apps/server`: Node/TypeScript authoritative runtime
- `packages/protocol`: Zod schemas and inferred protocol types
- `packages/shared`: shared domain models
- `packages/rules`: deterministic rules helpers
- `packages/db`: Drizzle/Postgres schema, adapters, migrations

## Setup

Use Node 20 and pnpm:

```bash
corepack pnpm install
```

Run web and server together:

```bash
corepack pnpm dev
```

Default local URLs:

- Web: `http://localhost:3000`
- Server: `http://localhost:2567`
- Runtime cockpit: `http://localhost:3000/runtime`
- Character Library: `http://localhost:3000/characters`

## DB Mode

Copy `.env.example` to a local `.env` and keep real secrets out of git.

```bash
SERVER_PERSISTENCE_MODE=db
DATABASE_URL=postgres://user:password@localhost:5432/dnd_web
```

Apply SQL migrations from `packages/db/migrations/` before using DB mode,
including:

- `0008_character_library_entries.sql`
- `0009_auth_users_and_sessions.sql`
- `0010_auth_user_owned_character_library.sql`

Default startup is in-memory when `SERVER_PERSISTENCE_MODE` is unset or set to
`in-memory`.

## Validation

Standard validation commands:

```bash
git diff --check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @dnd/server test
corepack pnpm --filter @dnd/web test
corepack pnpm --filter @dnd/web build
corepack pnpm --filter @dnd/web test:smoke
```

`@dnd/web test:smoke` starts local server/web dev processes, drives `/runtime`
through headless Chrome, verifies recovery after reload, checks Player mode
guardrails, confirms Local Reset stays browser-local, and verifies stale demo
table text is not left visible after reset. On failure it prints the current
URL, summarized cockpit local state, visible enabled buttons, visible page
text, and recent child-process output to make local smoke failures actionable.

## Main Docs

- [CODEX_CONTEXT.md](CODEX_CONTEXT.md): concise context for future Codex tasks.
- [AGENTS.md](AGENTS.md): Codex/project instructions.
- [PRD.md](PRD.md): product requirements aligned to the current implementation.
- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md): architecture and authority model.
- [ROADMAP.md](ROADMAP.md): product roadmap and next milestone direction.
- [docs/codex-workflow.md](docs/codex-workflow.md): validation, DB mode, and
  browser QA workflow.
- [docs/project-handoff.md](docs/project-handoff.md): current implementation
  handoff.
- [docs/product/PRODUCT_BRIEF.md](docs/product/PRODUCT_BRIEF.md): professional
  product brief.
- [docs/product/I18N_POLICY.md](docs/product/I18N_POLICY.md): English/Persian
  localization policy.
- [docs/product/USER_FLOWS.md](docs/product/USER_FLOWS.md): current and
  proposed product flows.
- [docs/domain/DOMAIN_MODEL.md](docs/domain/DOMAIN_MODEL.md): product/domain
  concepts and boundaries.
- [docs/engineering/CURRENT_STATE.md](docs/engineering/CURRENT_STATE.md):
  current implementation reality and known limits.
- [docs/delivery/NEXT_MILESTONE.md](docs/delivery/NEXT_MILESTONE.md): proposed
  Character Library -> Runtime Assignment Bridge milestone.
- [docs/delivery/TASK_TEMPLATE.md](docs/delivery/TASK_TEMPLATE.md): reusable
  Codex implementation prompt template.
- [docs/api-surface.md](docs/api-surface.md): command endpoints, SSE, and
  recovery surface.
- [docs/manual-validation.md](docs/manual-validation.md): manual runtime and
  character checks.
- [docs/persistence-boundaries.md](docs/persistence-boundaries.md):
  persistence, transaction, idempotency, and outbox reality.
- [docs/character-builder-rules-source-plan.md](docs/character-builder-rules-source-plan.md):
  local rules-data source notes.
- [docs/character-builder-asset-request.md](docs/character-builder-asset-request.md):
  character-builder asset registry notes.
- [docs/character-builder-generated-assets.md](docs/character-builder-generated-assets.md):
  generated local asset notes.
- [docs/character-sheet-pdf-template-map.md](docs/character-sheet-pdf-template-map.md):
  PDF template mapping notes.
- [docs/decisions](docs/decisions): active ADRs.
