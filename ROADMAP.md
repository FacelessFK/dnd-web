# Product Roadmap

## Purpose

This roadmap aligns the current backend-first implementation with the refreshed
product direction: a DM-first, top-down, rules-assisted tactical D&D platform.

The internal `TASKS_PHASE_*` files remain implementation history and slice
tracking. They do not map one-to-one to this product roadmap; several backend
reliability and DM-control slices were completed earlier than the original
product sequence.

## Roadmap Principles

- Keep the DM fully authoritative.
- Treat players as intent submitters, not sources of truth.
- Prioritize top-down tactical readability over visual spectacle.
- Separate reusable content, character identity, and live runtime overlays.
- Build product-operable vertical slices, not isolated technical demos.
- Expand rules only after core runtime, persistence, and usability are stable.

## Current Baseline

Already implemented:

- pnpm TypeScript monorepo foundation,
- authoritative session server and protocol schemas,
- session create/join/reconnect and SSE stream,
- character lifecycle and assignment,
- scene runtime and active-scene read model,
- active-scene placement and movement,
- encounter/turn runtime,
- action, bonus action, reaction, and movement usage,
- narrow attack foundation with downed-state gating,
- backend DM command surface for HP, condition tags, repositioning, turn usage,
  current turn actor, and encounter ending,
- in-memory idempotency and reconnect read-model recovery,
- persistence boundary documentation and character persistence groundwork.

Still missing before a real MVP:

- frontend tactical battle UX,
- frontend DM control panel,
- character builder and character library UI,
- map/adventure/content authoring,
- durable runtime storage beyond the current groundwork,
- durable idempotency, outbox, replay, and event cursor,
- auth and production deployment posture,
- broader rules systems.

## Phase 1 — Product Shell And Session Setup UX

### Goal

Make the existing backend runtime approachable through a basic product surface.

### Scope

- session creation/join flow,
- rules profile selection,
- participant list,
- character assignment flow,
- active scene selection shell,
- current API/error handling visible in the UI.

### Exit Criteria

- a DM can create a session without curl/manual commands,
- players can join and see their session context,
- the UI reflects backend session and assignment state honestly.

## Phase 2 — Character Builder And Character Library

### Goal

Let players create and reuse playable characters before joining a session.

### Scope

- guided character builder MVP,
- character library list/detail/edit surfaces,
- rules-profile compatibility metadata,
- derived stat preview,
- token/portrait choice,
- session assignment from saved characters.

### Non-Goals

- full class automation,
- complete inventory/progression,
- all spells/features,
- separate character-builder microservice.

### Exit Criteria

- a player can create, save, reopen, and assign a character without direct API
  calls,
- runtime overlays remain distinct from persistent character identity/build.

## Phase 3 — Top-Down Tactical Scene UX

### Goal

Turn the backend scene/movement runtime into a readable tactical play surface.

### Scope

- top-down 2D grid view,
- tokens/portraits with readable labels and status markers,
- active-scene rendering,
- party placement,
- movement destination preview,
- reachable/blocked cell feedback,
- authoritative movement result rendering.

### Exit Criteria

- players can understand where characters are,
- players can submit movement through the UI,
- server results visibly win over local previews.

## Phase 4 — DM Control Surface UX

### Goal

Expose the existing backend DM controls in a practical operator view.

### Scope

- omniscient DM map mode,
- selected character/state inspector,
- HP and condition-tag editing,
- administrative repositioning,
- turn usage editing,
- current turn actor override,
- encounter end control,
- clear stream/read-model feedback.

### Exit Criteria

- the DM can correct common runtime state without leaving the product,
- backend DM commands remain server-authoritative and idempotent.

## Phase 5 — Map, Adventure, And Content Authoring Foundation

### Goal

Introduce reusable prepared content instead of treating scenes only as runtime
records.

### Scope

- asset metadata model,
- terrain/object/prop palette,
- scene authoring basics,
- object footprints and blocking flags,
- transition nodes for doors/stairs/portals,
- adventure container with connected scenes,
- session setup from prepared content.

### Exit Criteria

- a DM can prepare reusable tactical content and instantiate it in a session,
- scene transitions are modeled explicitly instead of improvised.

## Phase 6 — Durable Runtime Foundation

### Goal

Move the runtime from process-local correctness toward repeated real use.

### Scope

- durable repository expansion,
- durable command idempotency,
- reconnect durability baseline,
- transaction boundary hardening,
- outbox-ready event publication,
- documented recovery behavior.

### Non-Goals

- full event sourcing,
- distributed scaling,
- event replay UI,
- broad gameplay expansion.

### Exit Criteria

- important session/character/runtime data survives expected restarts according
  to documented guarantees,
- duplicate command behavior remains safe across durable boundaries.

## Phase 7 — Player Intent And DM Adjudication Workflow

### Goal

Make the product interaction model match the refreshed authority model.

### Scope

- movement intent queue where needed,
- action/interaction intent submission,
- DM approval/reject/modify flows,
- result feedback,
- unresolved/ambiguous action handling,
- narrow audit trail for adjudicated outcomes.

### Exit Criteria

- players can propose actions through the UI,
- the DM can resolve ambiguous actions without direct state surgery,
- deterministic validation and DM judgment are clearly separated.

## Phase 8 — Basic Playable Encounter UX

### Goal

Make the existing combat backend playable through the product surface.

### Scope

- encounter start/end controls,
- turn order display,
- current actor highlighting,
- action/bonus/reaction/movement usage display,
- narrow attack UI,
- downed-state feedback,
- combat result feed.

### Exit Criteria

- a DM and players can complete a simple encounter without curl/manual state
  inspection.

## Phase 9 — Broader Rules And Tactical Systems

### Goal

Expand rules only after the runtime and product surface are usable.

### Candidate Slices

- opportunity attacks and out-of-turn reaction windows,
- ranged attacks and weapons,
- death saves and recovery rules,
- selected condition effects,
- selected spellcasting and concentration behavior,
- geometry, LOS, visibility, and cover.

### Exit Criteria

- each rule expansion is narrow, testable, and DM-overridable,
- unsupported rules fail gracefully or remain DM-led.

## Phase 10 — Production Readiness

### Goal

Prepare for limited real-world testing.

### Scope

- auth and session access control,
- observability,
- performance profiling,
- deployment hardening,
- backup/recovery plan,
- release checklist.

## Product Milestones

- **M1: Usable Session Shell** — DM and players can join and inspect session
  state through UI.
- **M2: Character Onboarding** — players can create and assign saved
  characters.
- **M3: Tactical Exploration** — top-down scene movement is usable.
- **M4: DM Operability** — common overrides are available in the product.
- **M5: Simple Encounter UX** — a narrow combat encounter is playable through UI.
- **M6: Durable MVP Candidate** — persistence/reconnect behavior supports
  repeated real use.

## Things To Avoid

- Treating frontend state as authoritative.
- Expanding spells/conditions before the DM/player loop is usable.
- Building advanced 3D/isometric visuals before top-down readability is proven.
- Hiding product gaps behind backend-only curl flows.
- Splitting character builder/library into separate services prematurely.
- Claiming durable replay or audit behavior before outbox/event-log work exists.
