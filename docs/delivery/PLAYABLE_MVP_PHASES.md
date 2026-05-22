# Playable MVP Phases

This document defines the remaining phases for the first version that feels
ready to play at a real table: a DM can build a top-down tactical environment,
players can join with characters, and the group can run a narrow but coherent
session loop.

## Definition Of Playable MVP

The playable MVP is not a complete D&D platform. It is the first vertical slice
where a small group can sit down and play through one prepared tactical scene
without needing developer intervention.

Playable MVP means:

- DM can create or prepare a top-down scene with a grid, obstacles, passive
  props, transitions, and DM-controlled combatants.
- Players can join, load or create characters, submit them for DM assignment,
  and see their assigned token on the board.
- The tactical camera and board are usable enough for live play: pan, zoom,
  readable tokens, selected state, current-turn state, and clear placement.
- The table can run exploration movement and a narrow encounter loop.
- Refresh/reconnect recovers current state through read models.
- English and Persian UI remain usable.
- Known limitations are explicit in the UI/docs.

Playable MVP does not mean:

- full D&D automation;
- monster AI;
- complete spell, inventory, ranged weapon, lighting, fog-of-war, or line of
  sight systems;
- production auth/security/deployment;
- replay, stream cursors, exactly-once delivery, or multi-process realtime
  coordination.

## Current Baseline

Already implemented:

- `/runtime` DM and Player modes;
- session create/join/reconnect;
- live SSE delivery plus read-model recovery;
- scene create/activate/read;
- passive scene entities and transition nodes;
- compact DM scene entity palette for wall, cover, marker, hidden prop, player
  spawn, and monster spawn presets;
- compact DM transition preset palette for door, stairs, portal, gate, and
  other exits;
- character assignment, placement, movement, HP, conditions, and DM overrides;
- mixed player/combatant encounters;
- compact current-turn rail with actor, remaining movement, and used
  action/bonus/reaction state;
- selected target and latest combat-result feedback beside the existing turn
  controls;
- selected movement destination and turn-budget feedback beside the tactical
  grid;
- action economy feedback beside the existing turn controls, with per-resource
  readiness and blockers for action, bonus action, and reaction usage;
- encounter status feedback beside the existing turn controls, with current
  status, round/turn progress, next actor, latest encounter update, and latest
  combat result;
- player-facing readiness feedback with joined, character, assignment,
  placement, and turn-ready states;
- narrow melee attacks and turn usage;
- Character Library, Builder, auth MVP, PDF export;
- Character Library to runtime assignment bridge;
- DB-backed transaction/outbox coverage for covered bridge/runtime paths;
- manual outbox status badge;
- assignment-request previews and post-assignment source provenance;
- DM-facing Table Setup checklist derived from loaded session, player,
  assignment, scene, placement, and encounter state;
- Phase 1 Slice 1 tactical board camera controls: local zoom levels, bounded
  pan offsets, reset view, and helper tests for viewport math;
- Phase 1 Slice 2 tactical board affordances: selected movement cell,
  selected token, current-turn actor, and attack target badges with helper
  tests for derived cell state;
- Phase 1 follow-up keyboard/focus pass: roving tactical grid focus,
  arrow/Home/End cell navigation, grid semantics, and helper tests for bounded
  keyboard movement.

## Remaining Phases

### Phase 1: Tactical Board Camera And Interaction

Goal: make the `/runtime` board feel like a usable top-down tabletop surface.

Scope:

- Add pan and zoom controls for the tactical board.
- Keep tokens, entities, combatants, and transition markers readable at useful
  zoom levels.
- Add stable selected-cell, selected-token, movement-target, and current-turn
  visual states.
- Preserve keyboard/mouse accessibility basics without building a full VTT
  interaction engine.
- Keep board state browser-local unless the state is authoritative runtime
  truth.

Acceptance:

- DM and Player can inspect a larger scene without losing orientation.
- A player can identify their token, current turn, legal movement target, and
  selected attack target.
- A DM can place and inspect entities without the board becoming visually
  cramped.

Suggested first implementation slice:

- Implemented: board zoom levels, bounded pan offset, reset-view control, and
  helper tests for viewport math.

Suggested next implementation slice:

- Implemented: selected-token, movement-target, current-turn, and attack-target
  affordances now that the board can zoom and pan.

Suggested follow-up slice:

- Implemented: small keyboard/focus pass for camera and board selection
  controls.

### Phase 2: DM Scene Authoring Pass

Goal: let the DM build a small playable environment directly from the runtime
surface.

Scope:

- Improve the existing scene/entity controls into a clearer authoring panel.
- Support simple map pieces: wall/blocker, cover/object, marker, hidden prop,
  transition node, and combatant spawn.
- Make footprint, blocking, hidden state, and target scene labels visible before
  saving.
- Keep authored scene data separate from live character overlays.
- Avoid full adventure authoring, asset marketplaces, or procedural map
  generation.

Acceptance:

- DM can create a scene, add a few obstacles/props/transitions, activate it,
  place characters, and run play without editing JSON.
- Hidden/blocking/transition state is visible enough for the DM to reason about
  the map.

Suggested first implementation slice:

- Implemented: compact scene entity palette for common wall, cover, marker,
  hidden prop, player spawn, and monster spawn presets.

Suggested next implementation slice:

- Implemented: compact transition-node presets/guidance for door, stairs,
  portal, gate, and other scene exits without changing scene command semantics.

### Phase 3: Table Setup And Ready Flow

Goal: make the pre-play flow understandable for a DM and players.

Scope:

- Clarify session setup steps for DM and Player modes.
- Show player readiness: joined, character submitted, assigned, placed.
- Keep Character Library submission and runtime copy provenance visible.
- Add empty/loading/error states that explain what action is next.
- Keep DM assignment server-authoritative.

Acceptance:

- A new tester can open `/runtime`, create a session, join as a player, submit
  a character, assign it as DM, and place it without reading source code.
- The UI makes it obvious which step is blocked and why.

Suggested first implementation slice:

- Implemented: DM-facing "Table Setup" checklist derived from session state,
  with done/next/wait statuses and the next required action.

Suggested next implementation slice:

- Implemented: Player-facing readiness summary that mirrors joined, character
  submitted, assigned, placed, and turn-ready states.

### Phase 4: Play Loop Polish

Goal: make one narrow exploration plus encounter loop comfortable enough for
manual play.

Scope:

- Improve turn tracker visibility.
- Make movement, target selection, attack, and action usage feedback clearer.
- Keep attacks narrow and DM-correctable.
- Preserve existing DM override controls for HP, conditions, repositioning,
  turn actor, turn usage, combatants, and encounter end.
- Do not add full spells, inventory, opportunity attacks, or monster AI in this
  phase.

Acceptance:

- A small table can move tokens, start an encounter, take turns, attack, apply
  damage, adjust HP/conditions, and end the encounter.
- Players can tell when it is their turn and what they can currently do.

Suggested first implementation slice:

- Implemented: compact current-turn rail with actor, remaining movement, and
  used action/bonus/reaction state.

Suggested next implementation slice:

- Implemented: selected attack target and latest combat-result feedback beside
  the existing turn controls, derived from loaded read models and live event log
  entries.

Suggested follow-up slice:

- Implemented: selected movement destination and turn-budget feedback beside
  the tactical grid, derived from loaded character, scene, active-scene, and
  encounter read models.

Suggested slice 4:

- Implemented: action economy feedback beside the existing turn controls,
  derived from loaded turn read models and the live encounter event log, with
  per-resource blockers for used or globally disabled action, bonus action, and
  reaction commands.

Suggested slice 5:

- Implemented: encounter status and round-result feedback beside the existing
  turn controls, derived from loaded encounter state plus live encounter/combat
  event log entries, without changing server-owned turn or combat semantics.

Suggested slice 6:

- Implemented: Player-facing readiness and turn-ready summary in Player mode,
  derived from existing session, character, placement, encounter, movement,
  target, and action-economy read models, without changing command semantics.

### Phase 5: Recovery And Local Playtest Reliability

Goal: make the playable MVP resilient enough for local playtesting.

Scope:

- Keep DB-mode setup documented and validated for Character Library flows.
- Keep default in-memory startup honest for quick demo play.
- Verify refresh/reconnect recovery for session, scene, active-scene placement,
  character, and encounter read models.
- Expand smoke/manual validation around the playable path.
- Keep realtime claims honest: no replay/cursor/catch-up guarantees.

Acceptance:

- A tester can refresh the browser and recover current table state.
- Manual validation has a complete playable-session script.
- Automated smoke covers the core runtime path.

Suggested first implementation slice:

- Implemented: recovery status feedback plus browser smoke coverage for the
  recovered session, scene, active-scene placement, character, and encounter
  read models after reload/recover.

### Phase 6: MVP Content And Presentation Pass

Goal: package the first playable scenario and make the MVP feel coherent.

Scope:

- Provide one small demo scenario with a prebuilt scene, two player characters,
  and one or two DM-controlled combatants.
- Tighten bilingual copy for the main runtime flow.
- Keep the first screen focused on the usable runtime, not marketing.
- Document known limitations directly in delivery docs.
- Avoid new product surfaces unless they are needed for the playable session.

Acceptance:

- A reviewer can run a short encounter from a known scenario and understand the
  product direction.
- The MVP is demoable without explaining every internal implementation detail.

Suggested first implementation slice:

- Add a named demo scenario option that uses existing runtime commands and
  current local data.

## Recommended Order

1. Phase 1: Tactical Board Camera And Interaction.
2. Phase 3: Table Setup And Ready Flow.
3. Phase 2: DM Scene Authoring Pass.
4. Phase 4: Play Loop Polish.
5. Phase 5: Recovery And Local Playtest Reliability.
6. Phase 6: MVP Content And Presentation Pass.

Phase 1 should come first because camera/board usability affects every later
runtime feature. Phase 3 should come early because it makes the current bridge
and assignment work testable by a non-developer. Phase 2 and Phase 4 then turn
the existing runtime controls into a real playable session loop.

## Latest Completed Slices

Implemented Phase 5 Slice 1:

> Add a Recovery Status summary and smoke assertion for recovered read models
> after browser reload/recover.

Implemented Phase 5 Slice 2:

> Tighten the browser playable-session script and add actionable smoke
> diagnostics for timed-out browser waits.

Implemented Phase 5 Slice 3:

> Add a smoke assertion that Local Reset clears stale recovered table content
> from the visible runtime surface after a recovered playable session.

Implemented Phase 5 Slice 4:

> Add a smoke assertion that the same backend runtime session can be recovered
> again after Local Reset clears the browser-local cockpit state.

Implemented Phase 5 Slice 5:

> Add a final smoke assertion that the post-reset recovery includes the table,
> Recovery Status summary, and Encounter Status summary, then close Phase 5.

Non-goals for these tasks:

- no new server protocol;
- no new combat rules automation;
- no full spell, inventory, opportunity attack, or reaction-window system;
- no refactor of encounter command semantics;
- no new auth or DB requirements;
- no target legality changes beyond existing command validation and disabled
  reasons;
- no change to server-owned turn usage validation;
- no replay, cursor, catch-up, or event history semantics;
- no new attack resolution or damage automation beyond displaying existing
  combat events.

Validation for these tasks should include:

- focused helper or component-level checks where behavior is extracted;
- root smoke diagnostics checks;
- web tests;
- web typecheck;
- build and runtime smoke when practical.

## First Next Task

Phase 6 Slice 1:

> Add a named demo scenario option that uses existing runtime commands and
> current local data.
