# Project Handoff

## Repository Shape

DND-web is a TypeScript pnpm monorepo:

- `apps/server`: authoritative Node runtime and HTTP/SSE command surface.
- `apps/web`: Next.js runtime cockpit, auth UI, Character Library, and Builder.
- `packages/protocol`: shared Zod schemas and inferred protocol types.
- `packages/shared`: shared domain primitives.
- `packages/rules`: deterministic rules helpers.
- `packages/db`: Drizzle/Postgres schema, adapters, migrations, and unit of
  work boundaries.

## Runtime

`/runtime` is the live tabletop cockpit. It supports DM and Player modes,
session create/join/reconnect, SSE subscription, read-model recovery after
refresh, scene create/activate, passive scene entity editing, transition nodes,
character placement/movement, local tactical board camera controls, tactical
board state badges, tactical board keyboard navigation, mixed
player/combatant encounters, turn usage, narrow melee attack handling, readable
event feed, and DM controls for HP, conditions, repositioning, combatants,
current turn, turn usage, and encounter end.

The browser submits commands and renders server responses. It is not
authoritative.

## Character Library And Builder

`/characters` is separate from `/runtime`. It manages reusable library/build
records, not live-session overlays.

Current implementation:

- browser library list and builder routes at `/characters`, `/characters/new`,
  and `/characters/:characterId/edit`,
- backend command endpoint at `POST /api/character-library/command`,
- DB-mode table `character_library_entries`,
- auth MVP endpoints and `/login` surface backed by
  `auth_users`/`auth_sessions` in DB mode, using opaque HttpOnly-cookie
  sessions and user-owned library entries,
- local SRD-style rules data and derived previews,
- English/Persian UI direction through `I18nProvider`,
- portrait upload validation and MVP data URL storage,
- generated local builder art under `apps/web/public/assets/character-builder`,
- PDF export through local templates under
  `apps/web/public/assets/character-sheets`, with a simple PDF fallback.

Default in-memory server startup still creates a process-local Character Library
service, but the current browser character UI expects a logged-in user.
Register/login require DB mode. The auth MVP hashes passwords with Node
`scrypt`, stores only hashed opaque session tokens, and clears/revokes sessions
on logout. It is not full production account security: no password reset, email
verification, MFA, OAuth, account management UI, or dedicated CSRF token exists
yet.

The server now supports `submit_character_library_entry_for_assignment` on the
runtime character command surface. It reads a finalized reusable library entry,
creates a separate ready runtime character copy, stores the source library entry
ID in runtime metadata, and submits that runtime character as the player's
`pendingCharacterId` for existing DM assignment. Live overlays remain separate
from reusable library entries.

Player-mode `/runtime` now has the first localization-aware UI affordance for
loading finalized saved library entries for the authenticated user, selecting
one, and submitting it into live pending assignment. DM assignment still uses
the existing authoritative assignment path. DM-mode `/runtime` now previews
pending assignment requests with the submitted runtime copy's build, HP, AC,
speed, runtime copy ID, and source Character Library entry ID when present.
After assignment, the assigned character card keeps showing the runtime copy ID
and source Character Library entry ID so the saved-entry/runtime-copy boundary
stays visible.

## Persistence Reality

DB mode is opt-in with:

```bash
SERVER_PERSISTENCE_MODE=db
DATABASE_URL=postgres://user:password@localhost:5432/dnd_web
```

Apply `packages/db/migrations/` before DB-mode use.

Covered DB-backed slices include character records, Character Library entries,
auth users/sessions, session snapshots, scene records, active encounters,
command idempotency records/claims, transaction boundaries for current covered
paths, single-process outbox dispatch for covered live-command paths, and a
read-only unpublished outbox backlog summary at `GET /api/outbox/status`.
DM mode in `/runtime` has a compact manual outbox status badge backed by that
endpoint.
The server suite also audits DB-backed missed realtime delivery recovery:
current session, scene, active-scene placement, encounter usage, and character
HP can be reread after missed SSE events without claiming event replay.

Current limits remain:

- default startup can be in-memory,
- SSE subscribers are process-local,
- unpublished outbox rows are not auto-redelivered on cold boot,
- `GET /api/outbox/status` does not drain, replay, or expose row details,
- the `/runtime` outbox badge is not production monitoring or alerting,
- no replay, cursor, catch-up API, exactly-once delivery, full production auth,
  or multi-process coordination.

## Useful Docs

- `CODEX_CONTEXT.md`: concise AI/Codex execution context.
- `README.md`: concise project entry point.
- `AGENTS.md`: Codex instructions.
- `docs/codex-workflow.md`: validation and environment workflow.
- `docs/product/PRODUCT_BRIEF.md`: product brief and principles.
- `docs/product/I18N_POLICY.md`: English/Persian localization policy.
- `docs/product/USER_FLOWS.md`: current and proposed user flows.
- `docs/domain/DOMAIN_MODEL.md`: domain concepts and separation rules.
- `docs/engineering/CURRENT_STATE.md`: current implementation reality.
- `docs/delivery/NEXT_MILESTONE.md`: recommended next milestone.
- `docs/delivery/TASK_TEMPLATE.md`: reusable Codex task prompt template.
- `docs/api-surface.md`: endpoint and protocol overview.
- `docs/manual-validation.md`: manual runtime and character checks.
- `docs/persistence-boundaries.md`: persistence and transaction notes.
- `docs/character-builder-rules-source-plan.md`: local rules-data source notes.
- `docs/character-builder-asset-request.md`: asset registry notes.
- `docs/character-builder-generated-assets.md`: generated asset notes.
- `docs/character-sheet-pdf-template-map.md`: PDF template mapping.
- `docs/decisions/`: active ADRs.

## Validation

Expected repository validation:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @dnd/web build
corepack pnpm --filter @dnd/web test:smoke
```

The smoke command starts temporary local server/web dev processes and drives
`/runtime` through headless Chrome.
