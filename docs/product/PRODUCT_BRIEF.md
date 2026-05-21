# Product Brief

## What This Product Is

DND-web is a DM-first, top-down, rules-assisted D&D tabletop runtime and
character product surface.

It helps a Dungeon Master operate live tactical play while players submit clear
structured intents. The server owns runtime truth, and the DM remains the final
authority for ambiguous outcomes, corrections, reveals, scene control, and
overrides.

The product combines:

- a live tactical runtime at `/runtime`;
- a reusable Character Library and Builder at `/characters`;
- an auth MVP for persisted Character Library ownership at `/login`;
- explicit HTTP/SSE protocol surfaces shared through Zod schemas.

## What This Product Is Not

- Not a CRPG.
- Not a full D&D automation engine.
- Not a monster AI simulator.
- Not a production account-security/deployment project.
- Not a rules-lawyer replacement for DM judgment.
- Not an English-only interface.

## Primary Users

### Dungeon Master

The DM needs an omniscient operator surface for sessions, scenes, encounters,
hidden information, participant state, and correction tools. DM controls must
remain explicit and server-side role-gated.

### Player

The player needs a readable character and tactical view, clear submission
affordances, and authoritative feedback after the server and/or DM resolves
intent.

### Future Developer Or AI Agent

The project is expected to continue through AI/Codex-assisted slices. Product
docs should therefore make scope, non-goals, boundaries, and validation
requirements easy to consume.

## MVP Product Shape

The current MVP direction is a usable vertical slice, not a complete D&D
platform:

- create/join/reconnect to sessions;
- operate a top-down tactical runtime;
- create/activate scenes and transitions;
- place and move characters;
- start and run narrow encounters;
- use explicit DM correction controls;
- create and persist reusable Character Library entries in DB mode;
- submit finalized library entries through a server-side bridge into runtime
  pending assignment;
- export simple character sheet PDFs from local templates;
- preserve read-model recovery after refresh or reconnect.

The next product gap is the localization-aware UI that lets players select and
submit finalized Character Library entries into live runtime assignment while
keeping live session state separate from reusable library records.

## Product Principles

- **DM authority first:** the DM can inspect and correct authoritative state.
- **Player intent, not player truth:** player actions are structured requests;
  server and DM decisions mutate state.
- **Top-down tactical clarity:** readable 2D grid truth wins over cinematic
  spectacle.
- **Reusable content and characters:** library entries, assets, scenes, and
  adventures should remain reusable outside any one live session.
- **Live runtime state is separate:** HP changes, positions, conditions,
  encounters, scene overlays, and DM overrides belong to session/runtime state.
- **Automation stops at ambiguity:** deterministic validation is useful, but
  ambiguous play stays DM-led.
- **Bilingual by constraint:** English and Persian UX must remain supported.

## Bilingual Product Constraint

The product supports English and Persian. UX flows, labels, validation
messages, runtime copy, Character Builder copy, DM-facing text, and
player-facing text must remain compatible with both languages.

Future implementation tasks should use the existing localization direction,
avoid hardcoded user-facing strings outside the i18n system, preserve LTR/RTL
layout behavior, and avoid storing localized labels as canonical IDs.
