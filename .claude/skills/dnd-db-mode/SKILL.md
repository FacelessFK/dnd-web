---
name: dnd-db-mode
description: Set up and validate DND-web in DB persistence mode. Use for any task touching persisted Character Library entries, auth, transactions, idempotency, the outbox, migrations, or the Character Library to runtime bridge. Covers readiness preflight and DB-mode browser smokes.
---

# DND-web DB Mode

Default startup is in-memory. DB mode is opt-in and **required** for auth, the
Character Library UI, and any persistence work.

Never silently fall back to in-memory when the task is about persisted data. If
DB mode is unavailable, say so explicitly and report what you validated instead.

## Configuration

Repo-root `.env` (never print its contents):

```bash
SERVER_PERSISTENCE_MODE=db
DATABASE_URL=postgres://user:password@localhost:5432/dnd_web
```

`apps/server/src/index.ts` loads `.env` from the repo root. `AuthService` is
only injected when `SERVER_PERSISTENCE_MODE=db`, which is why register/login
fail in the default mode.

## Migrations

Apply everything in `packages/db/migrations/` in numeric order before DB-mode
work. The auth + user-owned library slice needs at least:

- `0008_character_library_entries.sql`
- `0009_auth_users_and_sessions.sql`
- `0010_auth_user_owned_character_library.sql`

## Readiness Preflight — Run This First

```bash
corepack pnpm --filter @dnd/db check:readiness
```

It verifies:

- `DATABASE_URL` is set and connectable;
- all required tables exist — `auth_users`, `auth_sessions`,
  `character_records`, `character_library_entries`,
  `completed_command_idempotency_records`,
  `command_idempotency_claim_records`, `session_snapshots`, `scene_records`,
  `active_encounter_records`, `command_event_outbox_records`;
- server **and** client encoding are UTF8;
- a Persian Unicode string round-trips.

The encoding checks are not optional bureaucracy — a non-UTF8 database silently
corrupts Persian character data, and this repo has already been through one
`WIN1252` → UTF8 migration.

## DB-Mode Browser Smokes

Both spawn real local server + web dev processes and drive headless Chrome.

```bash
# Builder + PDF export: Persian draft, reload, portrait upload, review sheet,
# PDF artifact capture, finalize, finalized-state reread.
corepack pnpm --filter @dnd/web test:smoke:builder-export-db

# Full bridge loop: saved library entry -> Player submission -> DM assignment of
# the separate runtime copy -> Training Room placement -> encounter start ->
# DM/Player recovery -> reusable-entry separation -> Player Local Reset recovery.
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

`test:smoke:bridge-db` is an alias for the same harness as the second command.

Both require `DATABASE_URL` and a Chrome/Chromium binary. Set
`RUNTIME_SMOKE_BROWSER=/path/to/chrome` if discovery fails, and
`RUNTIME_SMOKE_TIMEOUT_MS` (default `120000`) on a slow machine.

## What Is Actually DB-Backed

Character records, Character Library entries, auth users/sessions, session
snapshots, scene records, active encounters, completed idempotency records and
pre-execution claims, transaction boundaries for covered paths, and
single-process post-commit outbox dispatch for covered live-command paths.

## What Is Not — Do Not Claim Otherwise

- SSE subscribers are process-local.
- Unpublished outbox rows are **not** auto-redelivered on cold boot.
- `GET /api/outbox/status` returns backlog counts only — it does not drain,
  publish, mark rows published, expose row IDs, or provide replay/catch-up. The
  `/runtime` DM outbox badge is a development visibility aid, not monitoring.
- There is no event replay, stream cursor, catch-up API, exactly-once delivery,
  or multi-process coordination.
- Auth is an MVP: opaque `dnd_web_session` HttpOnly cookie, SHA-256 token hash
  stored server-side, `scrypt` password hashing. No password reset, email
  verification, MFA, OAuth, account management UI, or dedicated CSRF token
  beyond `SameSite=Lax`.

## Schema Or Migration Changes

High-effort work. Re-read the non-negotiable boundaries in CLAUDE.md first.

- Add a new numbered migration; do not edit an applied one.
- Update `packages/db/src/schema.ts` and the matching `*-database.ts` adapter.
- Add the table to `requiredTables` in
  `packages/db/scripts/check-db-readiness.mjs` if it is required for readiness.
- Keep transaction boundaries explicit via
  `packages/db/src/dnd-database-unit-of-work.ts`.
- Run the server suite plus at least one DB-mode smoke before reporting done.

## Safety

Never print `.env` contents, `DATABASE_URL`, credentials, cookies, or session
tokens. Use `corepack pnpm guard:sensitive-files` before committing when staged
changes might include env or credential-like paths.
