# System Design

## Architecture Thesis

DND-web is a browser-based, DM-first tactical D&D tabletop runtime and
character product surface. The server owns authoritative runtime state, players
submit structured intent, and the DM remains final authority for adjudication
and overrides.

The architecture should support tabletop play, not replace it with a fully
automated video game. Deterministic rules can be validated by the system;
ambiguous outcomes stay DM-led.

## Source Of Truth

- Exact protocol schemas: `packages/protocol`.
- Shared domain primitives: `packages/shared`.
- Current endpoint behavior: `docs/api-surface.md`.
- Current persistence and transaction reality:
  `docs/persistence-boundaries.md`.
- Current implementation summary: `docs/engineering/CURRENT_STATE.md`.
- Product/domain docs: `docs/product/` and `docs/domain/`.

Raw brainstorm context is archive/input material only.

## Core Authority Model

### Server

The server is source of truth for:

- session membership and participant roles;
- character assignment and pending assignment;
- active scene state;
- character placement and movement;
- encounter/turn state;
- combat mutations;
- DM administrative controls;
- event publication to connected clients.

### DM

The DM is omniscient by product rule. DM-facing surfaces should expose full
scene, character, encounter, hidden marker, transition, and correction state.
DM-only actions must remain role-gated server-side.

### Player

Players submit structured intents. The client can preview or render state, but
it must not be treated as authoritative. The target policy is player-specific
visibility, though current visibility filtering is not complete.

## Current Runtime Architecture

The current runtime is a TypeScript authoritative HTTP/SSE server with explicit
Zod protocol contracts.

Implemented areas:

- session create/join/reconnect and SSE stream subscription;
- read-model recovery after refresh;
- Character Library command endpoint and DB-backed entries;
- auth MVP endpoints in DB mode;
- runtime character create/update/finalize/submit/assign/read flows;
- scene create/read/activate and passive scene entity operations;
- transition node operations and activation;
- active-scene placement and movement;
- mixed player/combatant encounters;
- narrow melee attack resolution;
- backend DM command surface;
- DB-backed repository, idempotency, transaction, and outbox slices for covered
  paths.

Intentionally incomplete areas:

- Character Library -> runtime assignment bridge;
- full adventure authoring;
- full player-specific visibility filtering;
- full player intent/DM adjudication queues;
- durable replay/cursor/catch-up APIs;
- multi-process coordination;
- full spells, conditions, inventory, ranged weapons, death saves, LOS, fog,
  lighting, or monster AI.

## Logical Layers

### Protocol Layer

`packages/protocol` defines command, response, error, and stream event schemas.
Public API behavior should stay explicit and schema-validated.

### Shared Domain Layer

`packages/shared` defines shared runtime primitives such as sessions,
characters, scenes, encounters, grid definitions, and overlays.

### Rules Layer

`packages/rules` contains deterministic helpers. Rules helpers should stay
mostly pure and free of store or transport concerns.

### Runtime Orchestration

`apps/server` coordinates command handling, stores, rules helpers, sessions,
characters, scenes, encounters, combat, idempotency, transaction boundaries, and
SSE publication.

### Persistence Layer

`packages/db` owns Drizzle/Postgres schema, adapters, migrations, and
unit-of-work boundaries. Default local startup may still be in-memory.

### Client/UI Layer

`apps/web` renders `/runtime`, `/characters`, and `/login`. It uses server
responses, read-model recovery, and SSE updates. It also carries the current
English/Persian UI direction through `I18nProvider`.

## Domain Boundaries

### Reusable Data

Reusable data includes:

- Character Library entries;
- local builder assets and PDF templates;
- future reusable scenes/adventures;
- future asset metadata.

Reusable data should survive beyond one live session and must not be mutated by
live damage, movement, conditions, encounter turns, or DM corrections.

### Live Runtime State

Live state includes:

- session participants and assignment;
- pending character requests;
- active scene selection;
- character session overlays;
- active encounter state;
- combatant state;
- transient events and stream subscribers.

Current implementation still stores some runtime character and overlay fields
together, but the product boundary remains clear: reusable library records are
not live overlays.

## Character Library -> Runtime Bridge Direction

The recommended next milestone is a bridge from finalized Character Library
entries to runtime assignment.

Design rule:

- assignment may derive, copy, or link runtime state from a library entry;
- live HP, position, conditions, encounter state, and DM overrides must remain
  session-local;
- the reusable library entry must not be mutated by live play.

See `docs/decisions/0005-character-library-runtime-bridge.md`.

## Map, Scene, Adventure Relationships

- A **scene** is one tactical playable space.
- A **session** instantiates live play and has an active scene.
- An **encounter** is combat state within a session.
- An **adventure** is future reusable prepared content made of connected
  scenes.
- Scene transitions model doors, portals, stairs, gates, or similar linked
  markers. Current activation changes the active scene but does not teleport
  characters, run scripts, start encounters, or automate locks/traps.

## Command And Event Model

Current HTTP command endpoints:

- `POST /api/session/command`
- `POST /api/characters/command`
- `POST /api/character-library/command`
- `POST /api/scenes/command`
- `POST /api/movement/command`
- `POST /api/encounters/command`
- `POST /api/dm/command`
- auth MVP endpoints under `/api/auth/*`

Current stream endpoint:

- `GET /api/sessions/:sessionId/stream?participantId=:participantId`

Current SSE event types:

- `session_state`
- `movement_state`
- `encounter_state`
- `combat_event`
- `character_state`

SSE is live delivery only. Reconnecting clients recover current state through
read models.

## Persistence And Reliability

DB mode is opt-in through `SERVER_PERSISTENCE_MODE=db` and `DATABASE_URL`.
Apply `packages/db/migrations/` before DB-mode verification.

Current DB-backed slices include character records, Character Library entries,
auth users/sessions, session snapshots, scene records, active encounters,
command idempotency records/claims, transaction boundaries for covered paths,
and single-process outbox dispatch for covered live-command paths.

Current reliability limits:

- default startup can be in-memory;
- SSE subscribers are process-local;
- unpublished outbox rows are not auto-redelivered on cold boot;
- no replay, cursor, catch-up API, exactly-once delivery, full production auth,
  or multi-process coordination.

## i18n Architecture Constraint

English and Persian support must be preserved across product work. The web app
uses `I18nProvider`, English is LTR, and Persian is RTL.

Future UI work should keep user-facing strings localization-aware, avoid
English-only assumptions, keep canonical IDs separate from localized labels,
and avoid auto-translating user-entered character data.

See `docs/product/I18N_POLICY.md`.

## Design Constraints

- Keep the runtime server-authoritative.
- Treat client actions as intent.
- Keep protocol contracts explicit.
- Keep rules helpers pure where practical.
- Keep reusable library/content data separate from live runtime state.
- Keep DM-only commands role-gated server-side.
- Do not overclaim replay, cursor, catch-up, exactly-once delivery, or
  multi-process coordination.
- Preserve English/Persian localization support.
- Prefer narrow, testable slices over large rewrites.
