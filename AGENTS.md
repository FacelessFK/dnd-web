# DND-web Codex Instructions

## Communication

- Report to the user in Persian.
- Keep code, file names, command names, commit messages, and implementation
  prompts in English.
- Read `docs/codex-workflow.md` before multi-file work.
- Do not ask for the whole codebase; request the smallest specific files only
  when local inspection is not enough.

## Product Identity

DND-web is a DM-first, top-down tactical D&D tabletop runtime and character
product surface. The server owns authoritative runtime state. Players submit
structured intent. DM-only actions must remain role-gated server-side.

Do not turn this into a CRPG, monster AI system, full D&D automation engine, or
production auth/deployment project unless explicitly asked.

## Stack

- TypeScript pnpm monorepo.
- `apps/web`: Next.js / React / Tailwind.
- `apps/server`: Node/TypeScript authoritative runtime.
- `packages/protocol`: Zod protocol schemas.
- `packages/shared`: shared domain models.
- `packages/rules`: deterministic rules helpers.
- `packages/db`: Drizzle/Postgres schema, adapters, and migrations.

## Current Surfaces

- `/runtime`: live tactical tabletop cockpit with DM and Player modes.
- `/characters`: Character Library / Builder surface.
- `/login`: auth surface for the DB-backed Character Library session MVP.

Character Library entries are reusable build/identity records. Runtime HP,
position, conditions, active encounters, and scene overlays are live-session
state and must stay separate from reusable library entries.

## Persistence And Auth

- Default local startup may be in-memory.
- DB mode uses `SERVER_PERSISTENCE_MODE=db` and `DATABASE_URL`.
- Apply `packages/db/migrations/` before DB-mode verification.
- Character Library auth currently requires DB mode. It uses opaque HttpOnly
  cookie sessions and user-owned library rows, but do not describe it as full
  production account security.
- Do not add fake durability or overclaim replay, cursor, catch-up,
  exactly-once delivery, or multi-process coordination.
- Never copy or print `.env` secrets.

## Character Builder

- Keep Character Builder separate from `/runtime`.
- English is `ltr`; Persian is `rtl`.
- Do not store localized labels as canonical IDs.
- Keep canonical IDs stable: `rulesProfileId`, class/species/background/spell
  IDs, and ability keys.
- User-entered character data must not be auto-translated.
- Portrait uploads are MVP data URLs; do not claim production asset storage.
- PDF export uses local project assets/templates and a simple fallback.

## OpenAI Docs / Prompt Guidance

If suggesting a Codex prompt, first recommend model effort:

- `medium` for small UI/docs/helper changes.
- `high` for normal multi-file frontend/backend tasks.
- `extra high` for sensitive DB, schema, transaction, idempotency, security, or
  data-model work.

Use the OpenAI developer documentation MCP server for OpenAI API, ChatGPT Apps
SDK, Codex, MCP, image generation, or related OpenAI documentation work.

## Validation

Before reporting success, run as much as practical:

- `git diff --check`
- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm --filter @dnd/server test`
- `corepack pnpm --filter @dnd/web test`
- `corepack pnpm --filter @dnd/web build`
- `corepack pnpm --filter @dnd/web test:smoke`

If a command is blocked, report the exact command, exact blocker, closest
equivalent run, and whether touched files were validated.

## Report Format

For task completion, include:

1. Commit-worthy status
2. Suggested commit message
3. Summary
4. Files changed
5. Behavior added
6. Tests added/updated
7. Docs updated
8. Validation results
9. Known limitations
10. Anything needed from the user
