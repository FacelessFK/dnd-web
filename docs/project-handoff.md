# Project Handoff

## Current State

The repository is a TypeScript pnpm monorepo with:

- `apps/server`: authoritative Node runtime and HTTP/SSE command surface.
- `apps/web`: Next.js role-aware runtime surface plus persisted Character
  Library / Builder MVP.
- `packages/protocol`: shared Zod schemas and inferred protocol types.
- `packages/shared`: shared domain primitives.
- `packages/rules`: deterministic rules and derived-stat helpers.
- `packages/db`: Drizzle/Postgres schema, adapters, migrations, and unit of
  work boundaries.

The backend currently supports sessions, participants, character lifecycle,
scene creation/activation, active-scene placement and movement, narrow
DM-controlled monster/NPC combatants, encounter turn state, attack foundation,
downed actor gating, reaction usage, backend DM controls, idempotent successful
command retries, reconnect/read-model recovery, DB-backed transactional slices,
and single-process post-commit outbox dispatch for covered live-command paths.

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
- create custom grid scenes from DM mode,
- activate existing or newly created scenes from DM mode,
- place, edit, reposition, and delete passive scene entities/obstacles on the
  tactical grid from DM mode,
- create, update, delete, and activate DM-authored transition nodes linking one
  scene to another scene in the same session,
- create, place, reposition, and set HP for narrow DM-controlled monster/NPC
  combatants,
- place both sample characters from DM mode,
- start a mixed player-character and monster/NPC encounter from DM mode,
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
  and attack selected player or active non-defeated monster/NPC combatant
  targets,
- let DMs trigger turn advance, attack/movement for selected player actors,
  monster/NPC attacks, HP overrides, reposition, condition tags, turn actor
  override, turn usage override, and encounter end.

The UI intentionally submits commands to the authoritative server instead of
treating browser state as truth. It is role-aware, but it is not production
authentication or authorization.

## Character Library / Builder MVP

The frontend-only character product surface lives at:

```text
http://localhost:3000/characters
```

It provides:

- a persisted Character Library with search, status filters, character cards,
  PDF downloads, and a Create New Character button,
- a 9-step local Character Builder flow at `/characters/new`,
- an edit route at `/characters/:characterId/edit` that loads persisted
  library entries into the same builder,
- draft save and finalize flows backed by `POST /api/character-library/command`,
- a dedicated reusable-library persistence table,
  `character_library_entries`, when the server is started with DB persistence,
- pre-auth `ownerParticipantId` ownership controls for local development,
- local SRD 5.2.1-compatible rules data for builder species, classes,
  backgrounds, skills, languages, tools, equipment metadata, class
  spellcasting metadata, and level 1 spells,
- rule-derived local previews for background ability boosts, final ability
  modifiers, proficiency bonus, HP, AC, speed, saving throws, skill choices,
  languages, tools, equipment, and caster/non-caster spell setup,
- a dark fantasy product shell inspired by the provided reference screenshots:
  left navigation, parchment cards, gold accents, purple active states, top
  progress stepper, and right summary rail,
- local generated assets for visible character portraits, species cards, class
  emblems, background icons, equipment icons, spell icons, textures, frames, and
  ornaments, with CSS placeholder fallback for any missing asset,
- a Step 1 portrait uploader for JPEG, PNG, and WebP images up to 1 MB. Uploaded
  portraits are stored as validated data URL references in the library entry for
  this MVP; entries without uploads reference selected species fallback art,
- a repo-owned generated character sheet PDF download on Review and library
  cards. The PDF is generated from persisted character data and does not embed a
  copyrighted official sheet template,
- an asset request/status document at
  `docs/character-builder-asset-request.md`, generated asset notes at
  `docs/character-builder-generated-assets.md`, and rules/source notes at
  `docs/character-builder-rules-source-plan.md`.

This surface still does not submit library characters into live runtime
sessions, enforce production authentication/account ownership, provide cloud
asset storage, or implement full D&D character automation. It also does not yet
automate higher-level spells, subclasses, level-up, full inventory rules,
equipment alternatives, or spell effects.

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

To exercise the persisted Character Library against Postgres, start the server
with:

```bash
SERVER_PERSISTENCE_MODE=db
DATABASE_URL=postgres://user:password@localhost:5432/dnd_web
```

Apply the SQL migrations in `packages/db/migrations/`, including
`0008_character_library_entries.sql`, before using DB mode. Without DB mode the
Character Library uses the server's in-memory fallback, which is useful for
tests but does not survive process restart.

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
pnpm --filter @dnd/web test:smoke
```

The web package has lightweight Node test coverage for runtime API parsing and
cockpit recovery helpers. It also has a browser smoke command for the `/runtime`
surface that starts local dev processes, drives the DM fresh demo setup through
headless Chrome, verifies recovery after reload, checks Player mode guardrails,
and confirms Local Reset clears browser state only. Backend behavior remains
covered by the existing server tests and repo smoke tests.

## Useful Docs

- `docs/api-surface.md`: endpoint, command, SSE, idempotency, and recovery
  surface.
- `docs/manual-validation.md`: copy-paste backend manual validation flow.
- `docs/persistence-boundaries.md`: persistence and transaction boundary notes.
- `docs/character-builder-asset-request.md`: requested and generated local
  assets for replacing Character Builder placeholders.
- `docs/character-builder-generated-assets.md`: generated asset batches,
  source capability, style notes, and replacement guidance.
- `docs/character-builder-rules-source-plan.md`: Character Builder SRD source,
  license, implemented data, and known data gaps.
- `TASKS_PHASE_9.md`: Phase 9 documentation/handoff checklist history.

## Known Limitations

- No authentication or production deployment posture.
- The `/characters` Character Library and Builder now persist reusable library
  entries through the backend, but ownership is pre-auth only. There is no
  production auth/account ownership, cloud upload pipeline, full official
  automation, or submit-to-session integration there yet. Uploaded portraits are
  stored as MVP data URLs inside library entries; local generated assets remain
  scaffold art and missing files still fall back to CSS placeholders.
- No durable event replay, stream cursor, or catch-up API.
- No map asset pipeline, full adventure/campaign authoring workflow,
  automatic player-triggered transitions, traps/locks/scripts, fog/LOS,
  lighting, or final VTT-grade scene editor.
- No multi-process SSE subscriber persistence or distributed coordination.
- No opportunity attacks, out-of-turn reaction windows, full condition engine,
  death saves, spells, weapons, ranged attacks, full monster stat blocks, or
  monster AI.
- Monster/NPC combatants are DM-controlled MVP actors only; there is no monster
  AI, CR/stat-block library, weapon system, or spell system behind them.
- Combatant defeated state is derived narrowly from `hp.current === 0`; defeated
  combatants remain visible on the map but cannot act or be targeted by player
  attacks.
- The runtime surface is a playable DM/player MVP, not production auth or a
  final product UX.
- The default local server still starts with the in-memory runtime unless
  composed with DB-backed stores and transaction boundaries.

## Recommended Next Work

- Add product-grade player-facing views and accessibility audits after the
  current runtime surface has served its manual validation purpose.
- Promote the browser smoke into CI only after the target environment has a
  known Chrome/Chromium binary and stable port/network assumptions.
- Continue persistence work only with explicit claims about which command paths
  are covered.
