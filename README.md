# DND-web

A browser-based multiplayer Dungeons & Dragons platform where a Game Master runs
a table for players in real time, on a shared tactical map, with the server as
the only authority on what is true.

## What this is

A **digital tabletop that should feel like a game.** The GM presents the world,
players say what their characters do, the system handles dice, movement, rules
maths, visibility, and state, and the GM keeps final say over everything.

- One shared map, projected differently for each viewer — players see only what
  their characters could know.
- A game HUD, not a wall of admin forms.
- Structured, turn-based combat when it matters; loose and flexible the rest of
  the time.
- English and Persian throughout, LTR and RTL. Persian (`fa`) is the default.

## What this is not

- **Not a CRPG.** No AI dungeon master, no AI storytelling, no monster AI.
- **Not a rules-automation engine that replaces the GM.** The system assists;
  the GM adjudicates. House rules and explicit GM overrides are first-class
  features, not workarounds.
- **Not a complete D&D implementation.** See [ROADMAP.md](ROADMAP.md) for the
  honest rules-coverage picture.
- **Not production-deployed.** See [Deployment status](#deployment-status).

The full product definition is in [PRD.md](PRD.md).

## Target experience

Desktop-first. The reference bar for polish is a game, not a web dashboard:
strong silhouettes and readable tokens, animated feedback for movement, attacks,
damage, healing, dice, and conditions, responsive selection and targeting, and a
top-down or isometric map you can read at a glance. The project has its own
visual identity and uses no third-party game assets or branding.

## Current capabilities

Everything below is implemented and covered by tests.

**Session and realtime**

- Create, join, and reconnect to a session using a 6-character session code.
- Server-issued participant credentials: a session response returns an opaque
  participant token, and every command and stream subscription must present it.
- Server-Sent Events for live delivery of `session_state`, `movement_state`,
  `encounter_state`, `combat_event`, and `character_state`.
- Recovery by re-reading authoritative read models after a refresh or
  reconnect — never from browser storage.
- Per-command idempotency: replaying a successful command returns the cached
  response; a conflicting fingerprint returns `command_id_conflict`.

**Map and scenes**

- Scene create / activate / read, with a run-length-encoded paintable terrain
  layer that blocks movement.
- Passive scene entities (walls, cover, markers, props, spawn points) and
  transition nodes (doors, stairs, portals, gates).
- A canvas tactical map with camera pan, cursor-anchored zoom, fit-to-map, hover
  and selection feedback, per-token HP arcs, a current-turn ring, a
  movement-range overlay, and a focusable grid overlay for keyboard and screen
  reader access.
- `/maps` map builder: brush / rectangle / line / flood-fill / eraser terrain
  painting, prop placement with an inspector, map resize, undo and redo, JSON
  import and export, `localStorage` drafts, and publish-to-table.

**Play**

- Character placement and movement, validated server-side against grid bounds,
  occupancy, terrain, and the movement budget.
- Mixed player/combatant encounters ordered by server-rolled initiative
  (`d20 + initiative modifier`).
- Turn progression and the action / bonus action / reaction / movement economy.
- Melee attacks: server-rolled d20 against AC with natural-20 and natural-1
  handling, then `1d8 + Strength modifier` damage, dice doubled on a critical.
- GM controls for HP, condition tags, repositioning, combatants, current turn,
  turn usage, and ending an encounter.
- A localized event feed.

**Hidden information**

- `get_scene` strips GM-hidden entities before a player ever receives them.
- Encounter reads and the `encounter_state` / `combat_event` streams replace a
  concealed combatant with an identity-free `concealed_combatant` slot and
  withhold its HP.
- Concealment is derived from the scene on every read and publish, never
  denormalized onto the encounter, so revealing a creature mid-combat takes
  effect on the next event with no invalidation step.

**Characters and accounts**

- `/characters` Character Library and guided builder over local SRD-style rules
  data, with portrait upload and PDF export.
- Auth MVP (DB mode only): register, login, logout with an opaque HttpOnly
  cookie, `scrypt` password hashing, and rate limiting on login and register.
- A server-side bridge that copies a finalized library entry into a **separate**
  runtime character for GM assignment, never mutating the reusable entry.

## Current limitations

Read this before assuming a feature exists.

- **No fog of war, line of sight, or lighting.** The map's glow and vignette are
  atmosphere; nothing is occluded. Terrain stores `blocksVision` but no
  visibility system consumes it yet.
- **Terrain blocks movement only.** No difficult-terrain cost, no hazard damage.
- **Combat is a narrow melee foundation.** No weapon model, damage types,
  resistances, ranged attacks, opportunity attacks, advantage/disadvantage,
  death saves, or spellcasting.
- **Condition tags are metadata.** They change no mechanics.
- **Combatants are GM-controlled actors, not stat blocks.** No monster AI.
- **No ability checks or saving throws** as a resolved action flow.
- **`/maps` publishes new scenes only.** It cannot re-open or overwrite a server
  scene, and it does not activate what it publishes.
- **`/runtime` is a developer cockpit, not a game HUD.** It is a single
  ~8,800-line component and is the largest gap between the code and the product
  vision.
- **SSE is live delivery only.** No replay, stream cursor, catch-up API,
  exactly-once delivery, cold-boot outbox redelivery, or multi-process
  coordination. Subscribers are process-local.
- **Auth is an MVP.** No password reset, email verification, MFA, OAuth, account
  management, or dedicated CSRF token beyond `SameSite=Lax`. Rate limits are
  in-memory and per-process, so they are not cluster-wide.
- **The shipped rules content is 2024 SRD 5.2.1 data while the target ruleset is 2014.** See [Rules source policy](#rules-source-policy).

## Repository structure

TypeScript pnpm monorepo (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

| Path                | Role                                                                            |
| ------------------- | ------------------------------------------------------------------------------- |
| `apps/server`       | Node/TypeScript authoritative HTTP + SSE runtime. Owns truth.                   |
| `apps/web`          | Next.js 15 / React 19 / Tailwind. `/runtime`, `/maps`, `/characters`, `/login`. |
| `packages/protocol` | Zod command / response / event schemas. **Final truth when docs drift.**        |
| `packages/shared`   | Shared domain primitives and const unions.                                      |
| `packages/rules`    | Deterministic, mostly-pure rules helpers.                                       |
| `packages/db`       | Drizzle/Postgres schema, adapters, migrations, unit-of-work.                    |
| `.claude/skills`    | Two operational skills: DB-mode setup and browser playtests.                    |

### Command surface

All command endpoints take JSON and return `{ ok: true, data }` or
`{ ok: false, error: { code, message } }`.

| Endpoint                              | Owns                                                    |
| ------------------------------------- | ------------------------------------------------------- |
| `POST /api/session/command`           | create / join / reconnect                               |
| `POST /api/characters/command`        | **runtime** characters, plus the library bridge command |
| `POST /api/character-library/command` | **reusable** library entries                            |
| `POST /api/scenes/command`            | scene CRUD, activation, entities, transitions           |
| `POST /api/movement/command`          | placement, movement, `get_active_scene_state`           |
| `POST /api/encounters/command`        | encounters, turns, turn resources, `attack`             |
| `POST /api/dm/command`                | explicit GM overrides and combatant control             |
| `/api/auth/*`                         | auth MVP (DB mode only)                                 |
| `GET /api/outbox/status`              | authenticated backlog counts; does **not** drain        |
| `GET /api/sessions/:id/stream`        | SSE                                                     |

Every session-scoped request carries `x-dnd-participant-token` (or, for the
stream, a `participantToken` query parameter). Without it the server does not
believe a claimed `participantId`.

The split between `/api/characters/command` (live runtime state) and
`/api/character-library/command` (reusable records) is the most important
boundary in the codebase. A library entry must never absorb live HP, position,
conditions, movement usage, or GM overrides.

For exact payloads read the Zod schemas in `packages/protocol` — they are the
contract, and no prose copy of them is maintained.

## Local setup

Node 22 or newer is a hard floor (`.nvmrc` pins 22). `corepack pnpm` is the
project convention.

```bash
corepack pnpm install
corepack pnpm dev            # web :3000, server :2567
```

Local URLs: game runtime `/runtime`, map builder `/maps`, character library
`/characters`, auth `/login`.

### Environment variables

Copy `.env.example` to `.env` at the repo root. `apps/server/src/index.ts` loads
it from there.

| Variable                         | Default                 | Purpose                                                               |
| -------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `SERVER_PERSISTENCE_MODE`        | `in-memory`             | `db` opts into Postgres. Auth and the Character Library require `db`. |
| `DATABASE_URL`                   | —                       | Postgres connection string. Required in DB mode.                      |
| `SERVER_HOST`                    | `127.0.0.1`             | Bind address.                                                         |
| `SERVER_PORT`                    | `2567`                  | Server port.                                                          |
| `NEXT_PUBLIC_APP_URL`            | `http://localhost:3000` | Comma-separated list of browser origins allowed by CORS.              |
| `NEXT_PUBLIC_SERVER_URL`         | `http://localhost:2567` | Where the browser sends commands. Baked in at web build time.         |
| `AUTH_COOKIE_SECURE`             | `NODE_ENV=production`   | Forces the `Secure` cookie flag. **Must be `false` on plain HTTP.**   |
| `SERVER_TRUST_PROXY_HEADER`      | `false`                 | Read `x-forwarded-for` for rate-limit keys. Only behind a real proxy. |
| `SERVER_MAX_REQUEST_BODY_BYTES`  | `1048576`               | Request body ceiling. Oversized bodies get HTTP 413.                  |
| `SERVER_REQUEST_BODY_TIMEOUT_MS` | `15000`                 | Body-read timeout. A stalled upload gets HTTP 408.                    |
| `CHARACTER_PORTRAIT_STORAGE_DIR` | `apps/server/data/…`    | Portrait upload directory.                                            |

Never print `.env` contents, `DATABASE_URL`, credentials, cookies, or tokens.

### In-memory mode

The default. Everything lives in process memory and is lost on restart. Good for
runtime, map, and combat work. `/login` and `/characters` persistence do **not**
work here, because `AuthService` is only wired in DB mode.

### Database mode

```bash
SERVER_PERSISTENCE_MODE=db
DATABASE_URL=postgres://user:password@localhost:5432/dnd_web
```

A local Postgres is available via `docker compose -f docker-compose.dev.yml up`.

### Migrations

```bash
corepack pnpm --filter @dnd/db db:migrate
```

Applies everything in `packages/db/migrations/` in numeric order, each file in
its own transaction. Every migration is `IF NOT EXISTS` style, so re-running is
a no-op. Auth needs at least `0008`, `0009`, and `0010`; M1 persistence needs
`0011`. Never edit an applied migration; add a new numbered one.

Then run the readiness preflight. It is not optional bureaucracy — a non-UTF8
database silently corrupts Persian character data, and this repo has already
been through one `WIN1252` → UTF8 migration:

```bash
corepack pnpm --filter @dnd/db check:readiness
```

It verifies the required tables exist, that server **and** client encoding are
UTF8, and that a Persian Unicode string round-trips.

## Development commands

```bash
corepack pnpm dev            # server + web in parallel
corepack pnpm format         # prettier --write
corepack pnpm lint
corepack pnpm typecheck
```

Prettier: single quotes, semicolons, trailing commas (`all`).

## Test commands

Validation in the order the project expects:

```bash
git diff --check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck                     # the only check of the i18n parity rule
corepack pnpm test                          # rules -> server -> web -> root smoke
corepack pnpm --filter @dnd/web build
```

Per-package:

```bash
corepack pnpm --filter @dnd/rules  test
corepack pnpm --filter @dnd/server test
corepack pnpm --filter @dnd/web    test
```

Tests use `node --test` with `tsx`, not Jest or Vitest. Server tests are
`apps/server/src/*.test.ts`; web tests are `apps/web/lib/*.test.ts`.

`typecheck` is load-bearing beyond types: because
`type Messages = typeof messages.en`, an i18n key added to `en` without a `fa`
counterpart is a type error and nothing else catches it. Tests run through
`tsx`, which strips types rather than checking them.

## Browser smoke tests

These start real local server and web processes and drive headless Chrome.

```bash
corepack pnpm --filter @dnd/web test:smoke                # one profile, full loop
corepack pnpm --filter @dnd/web test:smoke:two-profile    # GM + player profiles
corepack pnpm --filter @dnd/web test:smoke:map-builder    # paint -> publish -> verify
node apps/web/scripts/visual-capture.mjs                  # screenshots, no assertions
```

DB mode (run `db:migrate` and `check:readiness` first):

```bash
corepack pnpm --filter @dnd/web test:smoke:builder-export-db
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

## Database persistence and recovery

M1 backend state is durable. Session snapshots, runtime characters (HP, active
conditions, position), scenes (including combatant concealment), encounters
(participants, initiative, current turn), resolution requests, the dice audit,
player intents, command idempotency records and the outbox all live in
Postgres.

Participant credentials deliberately do **not**. They are per-process bearer
tokens, so a restart invalidates every one of them. What survives is the
_seat binding_ - which authenticated account was sitting in which chair - and
that is what lets the rightful account `reconnect_session` after a restart and
be issued a fresh credential. An account that never held the seat cannot.

SSE is still live delivery only. There is no replay, no stream cursor, and no
cold-boot redelivery of unpublished outbox rows: recovery is by reading state
back, not by replaying events.

Two commands verify all of it against a real database:

```bash
corepack pnpm --filter @dnd/server test:db                    # constraints, rollback, round-trip
corepack pnpm --filter @dnd/server test:smoke:m1-db-restart   # real process restart
```

`test:smoke:m1-db-restart` provisions its own database, runs the migrations,
drives the HTTP command routes through a full M1 table, kills the server, starts
a second process against the same data, and verifies recovery. It needs a
`DATABASE_URL` whose role may create and drop databases. Both run in the
`m1-db-recovery` CI job.

Set `RUNTIME_SMOKE_BROWSER=/path/to/chrome` if auto-discovery fails, and
`RUNTIME_SMOKE_TIMEOUT_MS` (default `120000`) on a slow machine.

CI runs format, lint, typecheck, unit tests, and the web build on every pull
request, plus the in-memory browser smokes in a separate job, plus an
`m1-db-recovery` job that migrates a throwaway Postgres service container and
runs the M1 persistence tests and the restart smoke. The DB-mode _browser_
smokes stay local: they need Chrome as well as Postgres, and the recovery job
covers what CI actually has to guard.

### Environment gotchas

- **`node_modules` is platform-specific.** This repo has been developed on both
  Windows and Linux from the same working directory. If tests fail with an
  esbuild "installed for another platform" `TransformError`, run
  `CI=true corepack pnpm install --config.confirmModulesPurge=false`.
- **CRLF line endings leak in from Windows edits.** There is no `.gitattributes`
  and `core.autocrlf` is unset, so a Windows-saved file shows a whole-file diff
  and fails `format:check` while being byte-identical apart from line endings.
  Check with `git diff --ignore-all-space`; fix with
  `perl -pi -e 's/\r\n/\n/' <file>`.
- **On an NTFS/exFAT mount** `core.filemode` is `false` and `git status` can
  report stale `M` entries whose `git diff` is empty. Run
  `git update-index --refresh` first.

## Deployment status

**Not deployed, and not production-ready.** `Dockerfile` and
`docker-compose.yml` build and run the stack for demos, but:

- the server runs through `tsx` rather than a compiled build;
- there is no TLS, reverse proxy, or process supervision;
- rate limits and SSE subscribers are per-process, so running more than one
  server process silently weakens both;
- a plain-HTTP deployment needs `AUTH_COOKIE_SECURE=false`, which means session
  cookies travel in clear text.

Compose derives the browser origin, the server URL, and the CORS allowlist from
a single `WEB_PUBLIC_HOST` (default `localhost`) so those three cannot drift
apart and silently break login or CORS. Treat the result as a demo deployment,
not a production one.

## Rules source policy

The target ruleset is explicitly:

```
dnd-5e-2014
```

Do not mix 2014 and 2024 rules. Where they currently are mixed, that is a known
defect tracked in [ROADMAP.md](ROADMAP.md), not a design choice.

**The Player's Handbook PDF must never be committed.** It is copyrighted. Keep
it in the gitignored `local-reference/` directory and use it as a private
implementation reference only. Do not reproduce substantial book text in code,
comments, documentation, or commit messages.

Distributable content is kept separate from the rules engine so that legally
usable SRD-compatible data can ship on its own. The engine reads content packs;
it does not embed book text. One book is not the whole corpus: the PHB has no
monster stat blocks, magic items, or encounter-building rules, and the
architecture must not pretend otherwise.

The character sheet PDF templates under
`apps/web/public/assets/character-sheets/` still need legal and asset review
before any public release.

## Documentation

Four files, deliberately:

- **README.md** — this file: what the product is, how to run and validate it.
- **[PRD.md](PRD.md)** — the product definition: personas, pillars, systems,
  acceptance criteria, non-goals, risks.
- **[ROADMAP.md](ROADMAP.md)** — the milestone sequence and the rules-coverage
  model.
- **[CLAUDE.md](CLAUDE.md)** — conventions and boundaries for AI-assisted work.

`packages/protocol` is the contract. When documentation and code disagree, the
code and the Zod schemas win.
