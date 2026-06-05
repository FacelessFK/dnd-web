# Codex Workflow

Use this for DND-web validation and environment reporting. Keep product details
in `README.md`, `CODEX_CONTEXT.md`, `docs/project-handoff.md`, and the
`docs/product/`, `docs/domain/`, `docs/engineering/`, and `docs/delivery/`
source-of-truth docs.

## Standard Validation

Run from the repo root:

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

For docs/assets-only cleanup, the minimum acceptable set is:

```bash
git diff --check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm --filter @dnd/web build
corepack pnpm --filter @dnd/web test:smoke
```

Prefer the full list when practical.

## DB Mode

Default local startup can be in-memory. DB-mode verification requires:

```bash
SERVER_PERSISTENCE_MODE=db
DATABASE_URL=postgres://user:password@localhost:5432/dnd_web
```

Apply `packages/db/migrations/` before DB-mode startup. Do not silently fall
back to in-memory when the task is about persisted Character Library, auth,
transactions, idempotency, or database behavior. The DB readiness check also
requires UTF8 server/client encoding and a Persian Unicode round-trip probe
before Character Library DB-mode validation should proceed.

For the current Character Library auth MVP, make sure the applied migration set
includes `0008_character_library_entries.sql`,
`0009_auth_users_and_sessions.sql`, and
`0010_auth_user_owned_character_library.sql`.

For local Character Library Builder/Export confidence, run:

```bash
corepack pnpm --filter @dnd/db check:readiness
corepack pnpm --filter @dnd/web test:smoke:builder-export-db
```

For the combined saved-character-to-Training-Room DB-mode browser evidence
path, run:

```bash
corepack pnpm --filter @dnd/db check:readiness
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

## Browser QA

Use available browser automation when asked. Prefer DB mode for persisted
Character Library QA. If upload/download automation is unavailable, report that
clearly and validate the logic through tests or source inspection.

`corepack pnpm --filter @dnd/web test:smoke` needs a Chrome/Chromium executable.
Set `RUNTIME_SMOKE_BROWSER=/path/to/chrome` if auto-discovery fails.

## Blocked Commands

If validation is blocked, report:

- exact command,
- exact reason,
- closest equivalent run,
- whether touched files were validated.
