# CLAUDE.md

Guidance for Claude Code working in the DND-web repository.

`AGENTS.md` is the durable, human-authored instruction file for this repo and
remains authoritative. This file is the Claude-specific companion: it does not
replace `AGENTS.md`, and where the two disagree, `AGENTS.md` wins.

> Note: `AGENTS.md` currently contains the line "Do not create `CLAUDE.md`."
> This file exists because the repository owner explicitly requested it. If that
> instruction is meant to still hold, delete this file rather than editing
> around it.

## What This Product Is

DND-web is a **DM-first, top-down, rules-assisted D&D tabletop runtime and
character product** that runs in the browser. The server owns authoritative
runtime state, players submit structured intent, and the DM keeps final
authority through explicit server-side controls.

It is **not** a CRPG, a monster-AI engine, a full D&D rules-automation engine,
or a production auth/deployment project. Do not drift toward those without an
explicit human decision to change scope.

## Repo Shape

TypeScript pnpm monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

| Path                | Role                                                                            |
| ------------------- | ------------------------------------------------------------------------------- |
| `apps/server`       | Node/TypeScript authoritative HTTP + SSE runtime. Owns truth.                   |
| `apps/web`          | Next.js 15 / React 19 / Tailwind. `/runtime`, `/maps`, `/characters`, `/login`. |
| `packages/protocol` | Zod command/response/event schemas. **Final truth when docs drift.**            |
| `packages/shared`   | Shared domain primitives and const unions.                                      |
| `packages/rules`    | Deterministic, mostly-pure rules helpers.                                       |
| `packages/db`       | Drizzle/Postgres schema, adapters, migrations, unit-of-work.                    |
| `.agents/skills`    | Repo-local Codex skills (`SKILL.md` each).                                      |
| `.claude/skills`    | Claude skills mirroring the same workflow roles.                                |

## Commands

Run from the repo root. `corepack pnpm` is the project convention.

```bash
corepack pnpm install          # install (see "Environment gotchas" below)
corepack pnpm dev              # server + web in parallel
```

Validation, in the order the project expects:

```bash
git diff --check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test                          # server -> web -> root smoke unit tests
corepack pnpm --filter @dnd/server test
corepack pnpm --filter @dnd/web test
corepack pnpm --filter @dnd/web build
corepack pnpm --filter @dnd/web test:smoke  # headless Chrome, needs a browser
```

Browser smoke harnesses (all spawn real local server/web dev processes):

```bash
corepack pnpm --filter @dnd/web test:smoke                                  # Training Room, one profile
corepack pnpm --filter @dnd/web test:smoke:two-profile                      # DM + Player profiles
corepack pnpm --filter @dnd/web test:smoke:map-builder                      # /maps paint -> publish -> verify on server
node apps/web/scripts/visual-capture.mjs                                    # screenshots only, no assertions
corepack pnpm --filter @dnd/db  check:readiness                             # DB mode preflight
corepack pnpm --filter @dnd/web test:smoke:builder-export-db                # DB mode, builder + PDF export
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db # DB mode, full bridge loop
```

Set `RUNTIME_SMOKE_BROWSER=/path/to/chrome` if Chrome auto-discovery fails.

Scope guards (deterministic, not a substitute for review):

```bash
corepack pnpm guard:docs-only        # staged files should be docs/config only
corepack pnpm guard:sensitive-files  # staged files may include env/credential paths
node scripts/guards/check-docs-only.mjs --all-changed
node scripts/guards/check-sensitive-files.mjs --all-changed
```

Local URLs: web `http://localhost:3000`, server `http://localhost:2567`,
cockpit `/runtime`, map builder `/maps`, library `/characters`, auth `/login`.

## Environment Gotchas

- **`node_modules` is platform-specific.** This repo has been developed on both
  Windows and Linux from the same working directory. If tests fail with an
  esbuild "installed for another platform" `TransformError`, run
  `CI=true corepack pnpm install --config.confirmModulesPurge=false` to
  reinstall for the current platform. The `CI=true` and config flag avoid an
  interactive purge prompt.
- **CRLF line endings leak in from Windows edits.** There is no `.gitattributes`
  and `core.autocrlf` is unset, so a Windows-saved file shows a whole-file diff
  and fails `format:check` while being byte-identical apart from line endings.
  Check with `git diff --ignore-all-space`; fix with
  `perl -pi -e 's/\r\n/\n/' <file>`.
- `.nvmrc` pins Node 20; the toolchain also runs on newer Node.
- The working tree is on an NTFS/exFAT mount, so `core.filemode` is `false` and
  `git status` can report stale `M` entries whose `git diff` is empty. Run
  `git update-index --refresh` before trusting a dirty-tree report.

## Non-Negotiable Boundaries

These are product rules, not style preferences. Violating one is a bug even if
the code compiles and tests pass.

1. **Browser state is never authoritative.** The client submits intent and
   renders server responses, read models, and SSE events. It never decides
   truth.
2. **DM-only actions stay role-gated server-side.** A UI that hides a control is
   not a gate. The gate lives in `apps/server`.
3. **Character Library entries are reusable records, separate from live runtime
   overlays.** Live HP, position, conditions, movement usage, encounter
   membership, and DM overrides must never write back into a
   `character_library_entries` row. The bridge command copies an entry into a
   _separate_ runtime character and records
   `meta.sourceCharacterLibraryEntryId`.
4. **Preserve English/Persian i18n and LTR/RTL.** English is LTR, Persian is
   RTL, and Persian (`fa`) is the default locale.
5. **Do not overclaim durability.** SSE is live delivery only. There is no
   replay, stream cursor, catch-up API, exactly-once delivery, cold-boot outbox
   redelivery, or multi-process coordination. Do not write docs, copy, or commit
   messages that imply otherwise.
6. **Do not broaden scope** into full spell automation, a full condition engine,
   monster AI, CRPG systems, fog of war / line of sight / lighting, broad
   inventory / ranged / death-save systems, or production auth without an
   explicit human decision.

## Documentation Source-Of-Truth Order

Current implementation beats current docs; current docs beat planning docs.
When docs conflict with code, **code and `packages/protocol` schemas are final
truth.**

1. `CODEX_CONTEXT.md`
2. `docs/engineering/CURRENT_STATE.md`
3. `docs/project-handoff.md`
4. `docs/api-surface.md`
5. `docs/persistence-boundaries.md`
6. `docs/product/PRODUCT_BRIEF.md`, `USER_FLOWS.md`, `I18N_POLICY.md`
7. `docs/domain/DOMAIN_MODEL.md`
8. `docs/delivery/PLAYABLE_MVP_PHASES.md`, `TASK_TEMPLATE.md`
9. `docs/decisions/*` (ADRs)

Treat as stale / drift-prone unless a human asks to update them: `PRD.md`,
`ROADMAP.md`, `README.md`, `docs/delivery/NEXT_MILESTONE.md`, and everything
under `docs/context/` (archive/input material only — never implementation
scope).

`docs/delivery/` also accumulates dated evidence and closure packets. They are
a historical record of what was validated when, not a backlog.

## Architecture

### Authority model

The server is source of truth for session membership and roles, character
assignment and pending assignment, active scene state, placement and movement,
encounter/turn state, combat mutations, DM controls, and event publication.

The DM is omniscient by product rule. Players submit intent; the server
validates deterministic constraints and the DM adjudicates ambiguity.

### Command surface

All command endpoints take JSON and return
`{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

- `POST /api/session/command` — `create_session`, `join_session`,
  `reconnect_session`
- `POST /api/characters/command` — **runtime** characters: create/update/
  finalize/submit/assign/get, plus the bridge command
  `submit_character_library_entry_for_assignment`
- `POST /api/character-library/command` — **reusable** library entries:
  create/update/finalize/get/list
- `POST /api/scenes/command` — scene CRUD, activation, passive entities,
  transition nodes
- `POST /api/movement/command` — placement, movement, `get_active_scene_state`
- `POST /api/encounters/command` — `start_encounter`, `advance_turn`, turn
  resources, `attack`, `get_encounter_state`
- `POST /api/dm/command` — explicit DM overrides and combatant control
- `/api/auth/*` — auth MVP (DB mode only)
- `GET /api/outbox/status` — read-only backlog counts; does **not** drain or
  replay
- `GET /api/sessions/:sessionId/stream?participantId=…` — SSE

SSE event types: `session_state`, `movement_state`, `encounter_state`,
`combat_event`, `character_state`.

**The `/api/characters/command` vs `/api/character-library/command` split is the
most important boundary in the codebase.** Runtime character != library entry.

### Recovery

There is no replay. After refresh/reconnect, clients rebuild state by rereading
read models: `reconnect_session`, `get_scene`, `get_active_scene_state`,
`get_encounter_state`, `get_character`. Expected empty reads such as
`no_active_scene` and `no_active_encounter` are recoverable local state, not
recovery failures.

### Idempotency

Every command has a `commandId`. Successful mutating responses are cached by
category + type + command ID + actor + session. Replaying a successful command
returns the cached response; a conflicting fingerprint returns
`command_id_conflict`. Failed and read commands are not cached.

### Persistence

DB mode is opt-in via `SERVER_PERSISTENCE_MODE=db` and `DATABASE_URL`; default
startup is in-memory. Apply `packages/db/migrations/` before DB-mode work
(auth needs `0008`, `0009`, `0010`). Run `@dnd/db check:readiness` first — it
verifies required tables, UTF8 server/client encoding, and a Persian Unicode
round-trip, which the Persian UI depends on.

Do not silently fall back to in-memory when a task is about persisted Character
Library, auth, transactions, idempotency, or database behavior.

## Code Patterns To Follow

- **Pure logic lives in a tested helper module; React components stay
  presentational.** `apps/web/app/runtime/runtime-cockpit.tsx` is the view
  layer, and nearly all of its derivations live in
  `apps/web/lib/runtime-cockpit-helpers.ts` with matching `.test.ts` coverage.
  New runtime logic belongs in the helper module with a test, not inline in the
  component.
- **Map rendering is split three ways.** `lib/tactical-map-render.ts` holds
  camera maths, palettes, and token/decor derivation (tested);
  `lib/tactical-map-draw.ts` holds the shared canvas terrain art used by both
  `/runtime` and `/maps`; the components own only pointers and React state.
  `lib/map-builder-state.ts` holds every map-builder mutation, including
  undo/redo, so tool behaviour is unit tested rather than exercised through the
  DOM.
- **Tests use `node --test` + `tsx`**, not Jest or Vitest. Server tests are
  `apps/server/src/*.test.ts`; web tests are `apps/web/lib/*.test.ts`.
- **Protocol changes start in `packages/protocol`** as Zod schemas; server
  handlers and the browser API helpers follow.
- **Strings go through `useI18n()`** from `apps/web/lib/i18n.tsx`. The `messages`
  object is a flat `Record<string, string>` keyed by dotted paths, with `en` and
  `fa` maps and `{placeholder}` interpolation. `type Messages = typeof
messages.en` means **every key added to `en` must also be added to `fa`** or
  typecheck fails.
- **Never store a localized label as a canonical ID.** `rulesProfileId`, class /
  species / background / spell IDs, ability keys, command types, and database
  IDs stay stable and untranslated. Never auto-translate user-entered character
  data.
- Prettier: single quotes, semicolons, trailing commas (`all`). Run
  `corepack pnpm format` before finishing.

## Working Rules

- Inspect files before editing. Prefer small, repo-native diffs over rewrites.
- Do not change runtime code during docs-only tasks.
- Never print `.env` contents, credentials, cookies, tokens, or secrets.
- When validation is blocked, report the exact command, the exact blocker, the
  closest equivalent run, and whether the touched files were validated.
- Report honestly: state which tests ran, which did not, and why.

### Communication

`AGENTS.md` asks agents to report to the user in Persian. The repository owner
has since asked Claude specifically to **report in English**. Follow that:
report in English unless the user asks otherwise. Code, file names, commands,
commit messages, and implementation prompts stay English regardless, and the
product's own English/Persian UI copy requirement is unaffected.

### Effort calibration

- Low/medium: docs-only, UI polish, small helpers, small tests.
- High: DB schema, migrations, transactions, idempotency, outbox, auth/security,
  runtime data-model boundaries, normal multi-file frontend/backend work.
- Highest: one task combining several high-risk areas (e.g. schema + transaction
  - auth).

## Skills

Repo-local Claude skills live in `.claude/skills/<name>/SKILL.md` and mirror the
Codex skills in `.agents/skills/`. Typical order for a non-trivial slice:

`dnd-research` → `dnd-story` → _human approval_ → `dnd-spec` →
`dnd-boundary-review` (if risky) → `dnd-build` → `dnd-validate` →
`dnd-review` → _human merge decision_

Also available: `dnd-i18n` (bilingual copy work), `dnd-db-mode` (DB-mode setup
and smoke runs), `dnd-playtest` (browser smoke and manual playtest runs).

Review skills are review-only — they report findings and do not patch code.

## Current State Summary

Implemented and working: session create/join/reconnect + SSE; read-model
recovery; scene creation/activation, passive entities, transition nodes; a
paintable scene terrain layer that blocks movement; placement and movement; a
canvas tactical map with camera, tokens, movement range, and a keyboard-
accessible grid overlay; the `/maps` map builder with paint tools, prop
placement, undo/redo, import/export, and publish-to-table; the named Training Room Skirmish demo scenario; mixed
player/combatant encounters; turn usage and narrow melee attacks; a readable
event feed; DM controls for HP, conditions, repositioning, combatants, current
turn, turn usage, and encounter end; the Character Library and Builder with
SRD-style local data, portrait upload, and PDF export; the auth MVP; and the
Character Library → runtime pending-assignment bridge.

Intentionally narrow: terrain blocks movement/vision but has no difficult-
terrain cost, hazard damage, or visibility system consuming `blocksVision`; map
lighting is atmosphere, not fog of war; `/maps` publishes new scenes only and
cannot re-edit a server scene; condition tags are metadata only; attacks are a narrow melee
foundation with rolled d20 + 1d8 damage and no weapon model; combatants are simple DM-controlled actors,
not stat blocks; player-specific visibility filtering is incomplete; auth is an
MVP without password reset, email verification, MFA, OAuth, account management,
or a dedicated CSRF token.

For the live picture, read `CODEX_CONTEXT.md` and
`docs/engineering/CURRENT_STATE.md` — they are kept current per slice.
