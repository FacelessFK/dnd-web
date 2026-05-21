# Product Roadmap

## Purpose

This roadmap aligns current implementation reality with the product direction:
a DM-first, top-down, rules-assisted D&D tabletop runtime and character product
surface.

Historical phase/task files and raw context are implementation history or input
material. They do not override the current handoff, API surface, persistence
notes, or source code.

## Roadmap Principles

- Keep the DM authoritative.
- Treat players as intent submitters, not sources of truth.
- Prioritize top-down tactical readability.
- Keep reusable character/content records separate from live runtime overlays.
- Preserve English/Persian i18n support.
- Build product-operable vertical slices.
- Expand rules only after the DM/player loop is usable and validated.
- Avoid claiming durability, replay, or auth guarantees that do not exist.

## Current Baseline

Already implemented:

- pnpm TypeScript monorepo foundation;
- authoritative Node runtime and Zod protocol schemas;
- `/runtime` DM and Player cockpit;
- session create/join/reconnect and SSE stream;
- read-model recovery after refresh;
- scene creation/activation, passive entities, and transition nodes;
- active-scene placement and movement;
- mixed player/combatant encounters;
- turn usage and narrow melee attacks;
- explicit DM controls for HP, condition tags, repositioning, combatants,
  current turn, turn usage, and encounter end;
- `/characters` Character Library and Builder surface;
- `/login` auth surface for DB-backed Character Library ownership;
- server-side Character Library -> runtime pending-assignment bridge;
- Player-mode runtime UI for submitting finalized saved library entries into
  live pending assignment;
- local SRD-style builder data and derived previews;
- English/Persian UI direction through `I18nProvider`;
- local portrait handling, generated builder assets, and PDF export;
- DB-backed slices for character records, Character Library entries,
  auth users/sessions, session snapshots, scene records, active encounters,
  command idempotency records/claims, covered transaction boundaries, and
  single-process outbox dispatch for covered live-command paths.

Still missing before a stronger MVP:

- DB transaction/outbox hardening for the bridge path if multi-store atomicity
  becomes required;
- fuller product UX around session setup and assignment;
- full adventure/content authoring;
- production-grade visibility filtering;
- reliable replay/cursor/catch-up semantics;
- production auth/account security;
- multi-process coordination;
- broader D&D rules systems.

## Immediate Next Milestone: Bridge DB Transaction/Outbox Hardening

### Goal

Harden the existing bridge so finalized Character Library entries can continue
to be submitted from the product UI while DB-mode character copy, pending
assignment, idempotency, and stream/outbox behavior are handled through an
honest narrow boundary.

### Exit Criteria

- Finalized library entries can still be submitted to a session from the UI.
- Unauthorized or non-finalized entries are rejected.
- DM remains the authoritative assignment actor.
- Runtime character/session overlay state is created or linked from the library
  entry.
- Live HP, movement, conditions, encounter state, and DM overrides do not mutate
  the reusable entry.
- New UI copy is localization-aware for English/Persian.
- DB-mode bridge behavior is covered by a transaction/outbox boundary or the
  remaining limitation is documented explicitly.

See `docs/delivery/NEXT_MILESTONE.md`.

## Milestone 2: Session Setup And Assignment UX Polish

### Goal

Make session creation, player join, pending assignment, and DM assignment feel
like a coherent product flow rather than a cockpit/debug workflow.

### Scope

- clearer DM session setup flow;
- participant state and pending character review;
- assignment confirmation and error states;
- recovery states after refresh;
- i18n-aware copy.

### Non-Goals

- production lobby/matchmaking;
- broad account management;
- full campaign management.

## Milestone 3: Tactical Exploration UX

### Goal

Improve top-down scene play so players and the DM can understand active scene
state, placement, movement, blockers, and transitions quickly.

### Scope

- readable grid and token state;
- movement affordances and server result feedback;
- scene entity readability;
- transition marker clarity;
- DM/player mode differences;
- i18n-aware validation and empty states.

### Non-Goals

- full fog of war;
- LOS/lighting simulation;
- automatic traps/locks/scripts.

## Milestone 4: DM Operability

### Goal

Make existing DM controls practical for repeated live operation.

### Scope

- selection and inspector polish;
- HP/condition/reposition workflows;
- combatant controls;
- turn usage/current turn controls;
- encounter end and recovery states;
- readable feedback.

### Non-Goals

- generic unsafe admin console;
- monster AI;
- full rules automation.

## Milestone 5: Simple Encounter UX

### Goal

Make a narrow combat encounter playable through the product surface without
manual protocol inspection.

### Scope

- turn order and current actor display;
- action/bonus/reaction/movement usage display;
- narrow attack UI;
- combat result feed;
- downed/defeated feedback;
- DM corrections.

### Non-Goals

- full spellcasting;
- full weapons/ranged system;
- opportunity attacks;
- death-save engine;
- full monster stat blocks.

## Milestone 6: Adventure And Content Authoring Foundation

### Goal

Move from runtime-only scenes toward reusable prepared content.

### Scope

- reusable scene metadata;
- asset metadata direction;
- scene grouping into future adventures;
- transition graph readability;
- session setup from prepared content.

### Non-Goals

- marketplace;
- production asset storage;
- large map editor before runtime UX is stable.

## Milestone 7: Durable MVP Hardening

### Goal

Strengthen persistence, recovery, and operational honesty for repeated real
play within documented limits.

### Scope

- close documented persistence gaps in small slices;
- clarify transaction and outbox behavior;
- decide when replay/cursor/catch-up becomes a product requirement;
- improve validation and manual QA docs.

### Non-Goals

- claiming exactly-once delivery;
- distributed scaling;
- event-sourced rewrite;
- production auth expansion unless explicitly scoped.

## Milestone 8: Broader Rules And Tactical Systems

### Goal

Expand D&D assistance only after the core runtime and product surfaces are
usable.

### Candidate Slices

- selected ranged/weapon behavior;
- selected condition effects;
- selected spellcasting foundations;
- opportunity/reaction windows;
- death saves and recovery;
- visibility/LOS/cover.

Each slice must be narrow, testable, DM-overridable, and localization-aware.

## Things To Avoid

- Treating frontend state as authoritative.
- Mutating reusable library entries with live runtime state.
- Expanding spells/conditions before assignment and runtime UX are usable.
- Building advanced 3D/isometric visuals before top-down readability is proven.
- Hiding product gaps behind backend-only flows.
- Splitting Character Builder/Library into separate services prematurely.
- Claiming replay, durable catch-up, or production auth before implemented.
- Adding English-only UI copy.
