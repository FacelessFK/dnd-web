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
character placement/movement, mixed player/combatant encounters, turn usage,
narrow melee attack handling, readable event feed, and DM controls for HP,
conditions, repositioning, combatants, current turn, turn usage, and encounter
end.

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
- development auth endpoints and `/login` surface backed by
  `auth_users`/`auth_sessions` in DB mode,
- local SRD-style rules data and derived previews,
- English/Persian UI direction through `I18nProvider`,
- portrait upload validation and MVP data URL storage,
- generated local builder art under `apps/web/public/assets/character-builder`,
- PDF export through local templates under
  `apps/web/public/assets/character-sheets`, with a simple PDF fallback.

Default in-memory server startup still creates a process-local Character Library
service, but the current browser character UI expects a logged-in user.
Register/login require DB mode. This is development auth only, not production
account security.

The Character Library does not submit reusable entries into live sessions yet.
Runtime character commands still own session character assignment and live
overlays.

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
paths, and single-process outbox dispatch for covered live-command paths.

Current limits remain:

- default startup can be in-memory,
- SSE subscribers are process-local,
- unpublished outbox rows are not auto-redelivered on cold boot,
- no replay, cursor, catch-up API, exactly-once delivery, production auth, or
  multi-process coordination.

## Useful Docs

- `README.md`: concise project entry point.
- `AGENTS.md`: Codex instructions.
- `docs/codex-workflow.md`: validation and environment workflow.
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
