# System Design

## Product And Architecture Thesis

This project is a browser-based, DM-first tactical D&D platform. The server owns
authoritative state, players submit structured intent, and the DM remains the
final authority for adjudication and overrides.

The architecture should support tabletop play, not replace it with a fully
automated video game. Deterministic rules can be validated by the system, but
ambiguous outcomes stay DM-led.

## Core Authority Model

### Server

The server is the source of truth for:

- session membership and participant roles,
- character ownership and assignment,
- active scene state,
- character placement and movement,
- encounter/turn state,
- combat state mutations,
- DM administrative overrides,
- event publication to connected clients.

### DM

The DM is omniscient by product rule. The DM-facing experience should expose:

- full scene state,
- hidden objects and hidden markers,
- all character and encounter state,
- scene transitions and triggers,
- quick correction tools for HP, conditions, position, turn state, and encounter
  lifecycle.

### Player

The target product policy is that the player sees a limited view and submits
intents. A player should not directly mutate authoritative runtime state from
the client. Movement, attacks, interactions, and later spells should be
represented as requests that the server validates and the DM can override when
appropriate.

The current backend enforces server authority and role-gated commands, but it
does not yet fully enforce player-specific visibility filtering.

## Current Runtime Architecture

The current backend is a TypeScript authoritative runtime with explicit Zod
protocol contracts.

Implemented runtime areas:

- session create/join/reconnect and SSE stream subscription,
- character create/update/finalize/assign/read,
- scene create/read/activate/entity placement,
- active scene placement and movement with occupancy validation,
- encounter start/read/advance turn and turn usage,
- narrow attack resolution,
- downed-state gating derived from `hp.current === 0`,
- backend DM command surface,
- in-memory command idempotency,
- reconnect recovery through read models,
- Drizzle/Postgres groundwork for character record persistence.

Runtime areas still intentionally incomplete:

- durable session, scene, encounter, idempotency, and SSE delivery,
- event replay, outbox, and global event cursor,
- full player intent/DM approval queue,
- frontend tactical view and DM panel,
- full condition, spell, weapon, ranged, visibility, LOS, and cover systems.

## Logical Layers

### Protocol Layer

`packages/protocol` defines command, response, error, and stream event schemas.
Public API behavior should stay explicit and schema-validated.

### Rules Layer

`packages/rules` contains deterministic helpers such as derived stats, movement
distance, attack totals, downed-state checks, and turn-usage helpers. Rules
helpers should remain mostly pure and free of store or transport concerns.

### Runtime Orchestration

`apps/server/src/game-runtime.ts` coordinates stores, rules helpers, session
state, character state, scenes, encounters, combat, and SSE publication. It is
the authoritative command execution boundary.

### Store/Persistence Layer

The project began in-memory. The persistence direction is Drizzle/Postgres, with
the first durable work focused on character records. Sessions, scenes,
encounters, idempotency, and streams are still process-local until future
persistence slices complete their boundaries.

### Client/UI Layer

The web app is currently a shell. The intended UI direction is a top-down 2D
tactical interface with separate DM and player views.

## Domain Boundaries

### Reusable Content

Reusable content should include:

- assets such as tiles, props, icons, portraits, and markers,
- scenes with authored grid/layout/object data,
- adventures that connect scenes through doors, stairs, portals, or scripted
  links,
- character library entries owned by players.

Reusable content is not the same as live runtime state.

### Live Runtime State

Live state should include:

- session participants and presence,
- active scene selection,
- participant-to-character assignment,
- character runtime overlays,
- active encounter state,
- transient events and prompts.

Character identity/build should stay distinct from runtime overlays. In the
current implemented runtime, HP still lives on `Character`, while the overlay
holds active-scene position, active condition tags, concentration placeholder,
and visibility. A cleaner long-term character-library/session-overlay split
remains a future modeling direction.

## Map, Scene, And Campaign Relationships

- A **campaign** is a longer-lived organizational container for sessions, notes,
  reusable content, and progression.
- An **adventure** is reusable prepared content made of one or more connected
  scenes.
- A **scene** is one tactical playable space.
- A **session** instantiates live play using selected rules/content.
- An **encounter** is combat state within a session.

Scene transitions should be modeled as authored links: doors, portals, stairs,
trapdoors, or triggers point from one scene to another. The DM controls whether a
transition is automatic, gated, hidden, or manual.

## Tactical View Policy

The recommended early visual direction is top-down 2D tactical play.

Why:

- it preserves grid truth,
- it is readable with many entities,
- it has lower asset and rendering complexity,
- it aligns with D&D movement/range logic,
- it can grow incrementally from simple tokens.

The MVP should avoid relying on 3D, heavy isometric presentation, cinematic
animation, or visual systems that obscure occupied cells.

## Visibility Policy

### DM View

The DM view should show the full state: all entities, hidden layers, trigger
metadata, transitions, secret notes, and complete character/encounter state.

### Player View

The intended player view should show only allowed information. Early MVP can
keep player visibility simple, but the model should leave room for future hidden
entities, fog, LOS, special senses, and secret information.

Current backend state and stream publication do not yet provide a complete
player-specific visibility filter; this section describes the target product
policy.

## Command And Event Model

Current HTTP command endpoints:

- `POST /api/session/command`
- `POST /api/characters/command`
- `POST /api/scenes/command`
- `POST /api/movement/command`
- `POST /api/encounters/command`
- `POST /api/dm/command`

Current stream endpoint:

- `GET /api/sessions/:sessionId/stream?participantId=:participantId`

SSE event types:

- `session_state`: snapshot-style session update with session revision.
- `encounter_state`: snapshot-style encounter update.
- `movement_state`: live partial movement/placement/reposition update.
- `combat_event`: transient combat result notification.
- `character_state`: live partial character update for DM HP/condition changes.

Missed transient/live-partial events are not replayed yet. Reconnecting clients
recover current authoritative state through read models such as reconnect
response, `get_active_scene_state`, `get_encounter_state`, and `get_character`.

## Reliability And Persistence Direction

Current reliability foundations:

- mutating command successes are cached by process-local idempotency,
- read commands are intentionally not cached,
- reconnect is read-model based,
- transaction boundary risks are documented,
- character persistence groundwork exists.

Future durable runtime work should add persistence boundaries carefully:

- durable repositories before broad feature expansion,
- durable command idempotency before relying on retries across restarts,
- outbox-ready event publication before durable replay claims,
- no fake in-memory transaction abstraction.

## Design Constraints

- Keep the runtime server-authoritative.
- Treat client actions as intent.
- Keep protocol contracts explicit.
- Keep rules helpers pure where practical.
- Separate reusable content from live runtime state.
- Do not add broad rules automation before DM/product operability is usable.
- Prefer narrow, testable slices over large rewrites.
