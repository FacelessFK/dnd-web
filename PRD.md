# Product Requirements Document

## Product Definition

DND-web is a DM-first, top-down, rules-assisted D&D tabletop runtime and
character product surface. Players submit structured intent, the server owns
authoritative runtime state, and the Dungeon Master keeps final authority
through explicit server-side controls.

The product is not a D&D video game, CRPG, monster AI system, or full rules
automation engine. It is a visual tabletop runtime and character surface that
reduces bookkeeping while preserving DM adjudication.

## Product Principles

- **DM authority first:** the DM can inspect, correct, and operate the live
  runtime.
- **Player intent, not player truth:** players submit structured actions; the
  server and DM decide what changes.
- **Top-down tactical clarity:** readable 2D grid play is the early visual
  direction.
- **Reusable content stays reusable:** characters, scenes, future adventures,
  and assets must remain separate from live session overlays.
- **Automation stops at ambiguity:** deterministic validation is useful;
  ambiguous rulings remain DM-led.
- **Bilingual product:** English and Persian support must be preserved across
  player and DM surfaces.

## Primary Users

### Dungeon Master

The DM operates the live session. The DM needs an omniscient tactical view,
fast scene/encounter/character controls, hidden-information visibility,
reliable correction tools, and confidence that the system will not fight table
rulings.

### Player

The player needs a readable map, a reliable character surface, clear movement
and action affordances, and authoritative feedback after an intent is submitted
and resolved.

### Future Developer Or AI Agent

The project will continue through small AI/Codex-assisted implementation
slices. Requirements must clearly separate current behavior, next proposals,
and non-goals.

## Target Play Loop

1. A player creates or selects a saved character from the Character Library.
2. A DM creates or recovers a session.
3. Players join the session.
4. A finalized character is submitted and assigned to a participant.
5. The DM activates a starting scene and places the party.
6. Players submit movement, interaction, or combat intents.
7. The server validates deterministic constraints.
8. The DM can approve, reject, modify, or override where needed.
9. Authoritative state updates are streamed or recovered through read models.
10. A narrow encounter can be played through with turn tracking, attack
    resolution, downed-state handling, and DM corrections.

Current gap: the server-side bridge from reusable Character Library entries
into live pending assignment now exists, but the product UI for selecting and
submitting saved entries into a session is still the recommended next slice.

## Domain Shape

The product keeps these concepts distinct:

- **User:** authenticated person for the Character Library MVP in DB mode.
- **Character Library Entry:** reusable player-owned build/identity record.
- **Runtime Character:** live-session character resource used by runtime
  commands.
- **Character Session Overlay:** mutable session state such as HP, placement,
  conditions, and encounter participation.
- **Session:** live runtime room with participants, roles, assignments, active
  scene, and stream path.
- **Scene:** one tactical playable space with grid, entities, obstacles, and
  transition nodes.
- **Adventure:** future reusable prepared content made of connected scenes.
- **Asset:** reusable visual/content material.
- **Encounter:** combat state inside a session.
- **Player Intent:** structured command submitted by a player.
- **DM Override:** explicit server-side DM command that mutates runtime state.

See `docs/domain/DOMAIN_MODEL.md` for the detailed model.

## MVP Product Shape

The useful MVP is a vertical tabletop slice:

- DB-backed Character Library and Builder MVP;
- auth MVP for user-owned library entries;
- runtime session create/join/reconnect;
- top-down tactical runtime cockpit;
- scene creation/activation and transition nodes;
- character placement/movement;
- mixed player/combatant encounters;
- narrow melee combat loop;
- readable event feed;
- explicit DM correction controls;
- read-model recovery after reconnect;
- honest persistence/replay limitations.

## Current Implementation Reality

Implemented:

- `/runtime` live tactical cockpit with DM and Player modes;
- session create/join/reconnect and SSE stream;
- scene creation, activation, passive entities, and transition nodes;
- active-scene placement and movement;
- mixed player/combatant encounters and turn usage;
- narrow melee attacks and readable event feed;
- DM controls for HP, conditions, repositioning, combatants, current turn, turn
  usage, and encounter end;
- `/characters` Character Library and Builder routes;
- `POST /api/character-library/command`;
- `submit_character_library_entry_for_assignment` on the runtime character
  command surface, which copies a finalized library entry into a separate
  runtime character and pending assignment state;
- DB-backed `character_library_entries`;
- `/login` auth MVP with opaque HttpOnly-cookie sessions in DB mode;
- local SRD-style rules data and derived previews;
- English/Persian UI direction through `I18nProvider`;
- local portrait handling, generated builder assets, and PDF export.

DB-backed slices cover character records, Character Library entries,
auth users/sessions, session snapshots, scene records, active encounters,
command idempotency records/claims, covered transaction boundaries, and
single-process outbox dispatch for covered live-command paths.

Still limited:

- default startup can be in-memory;
- SSE subscribers are process-local;
- unpublished outbox rows are not auto-redelivered on cold boot;
- no replay, cursor, catch-up API, exactly-once delivery, production auth, or
  multi-process coordination;
- Character Library entries can be submitted through a server-side bridge, but
  the localization-aware UI affordance is not wired yet;
- the bridge is not yet covered by a dedicated multi-store DB
  transaction/outbox boundary;
- player-specific visibility is not complete;
- broader D&D rules remain intentionally narrow.

## Explicit Non-Goals For Near-Term MVP

- Full automation of all D&D rules.
- Full spell system.
- Full condition engine and condition effects.
- Opportunity attacks and broad reaction windows.
- Complete weapons, inventory, ranged combat, or monster AI.
- Advanced line of sight, fog, cover, and lighting as a blocker for early play.
- 3D avatar creation or graphics-heavy tactical presentation.
- Voice/video, marketplace, or production-scale multi-process infrastructure.
- Replacing DM judgment with hardcoded automation.
- English-only UI assumptions.

## i18n Requirements

English/Persian support must be preserved. UX flows, labels, validation
messages, errors, empty states, DM-facing text, and player-facing text must use
the established localization direction when they are user-facing product copy.

Do not store localized labels as canonical IDs. Do not auto-translate
user-entered character data.

See `docs/product/I18N_POLICY.md`.

## Success Criteria

The product is moving in the right direction when:

- a player can create and reuse a character without live-session hacks;
- a DM can start a session, place the party, and operate scenes without direct
  admin access;
- players clearly understand what they can submit;
- the DM can see and correct live state quickly;
- a simple encounter can be completed without out-of-band bookkeeping;
- reconnect and persistence behavior are trustworthy within documented limits;
- English and Persian product copy remain supported.

## Recommended Next Milestone

Complete Character Library -> Runtime Assignment Bridge, starting with the
localization-aware UI affordance for player submission and pending assignment
status.

See `docs/delivery/NEXT_MILESTONE.md`.
