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

- Implemented: named Training Room Skirmish demo scenario option that uses
  existing runtime commands and current local sample data.

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

Implemented Phase 6 Slice 1:

> Add a named Training Room Skirmish demo scenario option that uses existing
> runtime commands and current local sample data.

Implemented Phase 6 Slice 2:

> Tighten Training Room Skirmish scenario-facing runtime copy and state
> presentation without changing runtime protocol, combat semantics, auth, DB
> requirements, or read-model recovery behavior.

Implemented Phase 6 Slice 3:

> Update the manual Training Room Skirmish playtest script, checklist, and run
> template so a human DM and Player can run the flow, verify recovery and
> i18n, and record UX gaps without adding runtime code or new product scope.

Implemented Phase 6 Slice 4:

> Record a Codex in-app browser Training Room Skirmish run, triage the observed
> product evidence, and select the next narrow UI polish slice without changing
> runtime protocol, combat automation, replay/catch-up, production auth, or
> broader D&D systems.

Implemented Phase 6 Slice 5:

> Polish Persian/RTL scanability for the Training Room runtime status and setup
> panels by localizing remaining high-traffic demo/status labels and making
> mixed Persian plus canonical ID rows easier to scan, without changing runtime
> protocol, command semantics, combat automation, auth, DB requirements, or
> read-model recovery behavior.

Implemented Phase 6 Slice 6:

> Use completed one-profile and two-profile Training Room smoke evidence plus
> source inspection to choose the next narrow UI polish slice, without changing
> runtime protocol, combat automation, replay/catch-up, production auth, DB/auth
> requirements, or broader D&D systems.

Implemented Phase 6 Slice 7:

> Polish remaining Persian readiness/roster microcopy in the Training Room flow
> by replacing mixed English/Persian high-traffic labels with
> localization-aware Persian equivalents while preserving canonical IDs,
> `runtime`, `Session ID`, and server URLs where they are intentionally stable,
> without changing runtime protocol, command semantics, combat automation,
> auth, DB requirements, or read-model recovery behavior.

Implemented Phase 6 Slice 8:

> Polish remaining Persian Table Setup and disabled-reason helper copy in the
> Training Room flow by replacing mixed English/Persian setup blockers with
> localization-aware Persian equivalents while preserving canonical IDs,
> `runtime`, `Session ID`, server URLs, and protocol/debug labels where they
> are intentionally stable, without changing runtime protocol, command
> semantics, combat automation, auth, DB requirements, or read-model recovery
> behavior.

Implemented Phase 6 Slice 9:

> Polish remaining Persian Assignment Request and Character Library bridge copy
> in the Training Room flow by replacing mixed English/Persian helper terms
> such as `pending`, `preview`, `submit`, `recover`, and `session` with
> localization-aware Persian equivalents while preserving canonical IDs,
> `runtime`, `Session ID`, source-library identifiers, server URLs, and
> protocol/debug labels where they are intentionally stable, without changing
> runtime protocol, command semantics, Character Library/runtime separation,
> combat automation, auth, DB requirements, or read-model recovery behavior.

Implemented Phase 6 Slice 10:

> Polish remaining Persian Recovery Status, stream/event-feed, and active-scene
> status copy in the Training Room flow by replacing mixed English/Persian
> helper terms such as `session`, `scene`, `read model`, `stream`, `subscribe`,
> `recover`, `feed`, and `condition` with localization-aware Persian
> equivalents while preserving canonical IDs, `runtime`, `Session ID`, SSE,
> server URLs, and protocol/debug labels where they are intentionally stable,
> without changing runtime protocol, command semantics, replay/catch-up claims,
> SSE behavior, combat automation, auth, DB requirements, or read-model
> recovery behavior.

Implemented Phase 6 Slice 11:

> Polish remaining Persian Debug panel and Scene Builder helper copy in the
> Training Room flow by replacing mixed English/Persian helper terms such as
> `Payload`, `protocol`, `debug`, `command`, `ledger`, `entity`, `cell`, and
> draft/prerequisite wording with localization-aware Persian equivalents while
> preserving canonical command IDs, protocol payload names, `SSE`, server URLs,
> and debug labels where they are intentionally stable, without changing
> runtime protocol, command semantics, scene authority, combat automation,
> auth, DB requirements, or read-model recovery behavior.

Implemented Phase 6 Slice 12:

> Polish remaining Persian Combatant, action, and DM override helper copy in
> the Training Room flow by replacing mixed English/Persian helper terms such
> as `combatant`, `attack`, `target`, `damage`, `override`, `turn`,
> `movement`, `reaction`, and draft/prerequisite wording with
> localization-aware Persian equivalents while preserving canonical command
> IDs, `DM`, `HP`, `AC`, `monster/NPC`, dice notation, protocol/debug labels,
> and server-owned combat authority where they are intentionally stable,
> without changing runtime protocol, command semantics, target legality,
> damage automation, turn validation, auth, DB requirements, or read-model
> recovery behavior.

Implemented Phase 6 Slice 13:

> Use completed one-profile and two-profile Training Room smoke evidence plus
> a bilingual browser pass to decide whether Phase 6 presentation work can
> close or needs one final narrow UI polish slice, without changing runtime
> protocol, combat automation, replay/catch-up, production auth, DB/auth
> requirements, or broader D&D systems. The triage kept Phase 6 open for one
> final narrow frontend/i18n slice.

Implemented Phase 6 Slice 14:

> Close the remaining high-traffic Persian runtime copy gaps found by the Slice
> 13 bilingual browser pass: transition-draft validation and disabled reasons,
> combatant-selection disabled reasons, derived empty/status values such as
> `No active turn` and `none`, and character-card stat/status labels, without
> changing runtime protocol, command semantics, combat automation,
> replay/catch-up, auth, DB requirements, or read-model recovery behavior.

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

Implemented Post-Phase-6 Slice 1:

> Reorder existing `/runtime` panels so the current role's primary action
> surface stays near the Tactical Grid and current-turn guidance. During an
> active encounter, show `Turn & Target` before DM authoring panels; when a
> Player has an assigned character or active turn, show it before Player
> Character onboarding and secondary status panels. Preserve the no-encounter
> setup path, existing controls, commands, server validation, DM gates,
> Character Library/runtime separation, English/Persian i18n, RTL/LTR
> behavior, and recovery semantics. Do not duplicate action controls, add
> sticky action bars, change protocol or command semantics, add combat
> automation, claim replay/catch-up behavior, or broaden into additional D&D
> systems.

Recommended effort: `medium`.

The implementation promotes the existing `Turn & Target` panel in active DM
and ready Player flows while preserving the no-encounter setup path.

Implemented Post-Phase-6 Slice 2:

> Rerun the Training Room browser evidence after Slice 1 to decide whether the
> post-Phase-6 role-focused action hierarchy needs another narrow UX polish
> slice or whether this polish sequence should close, without adding new
> runtime commands, duplicate controls, sticky action bars, combat automation,
> replay/catch-up semantics, production auth, DB requirements, or broader D&D
> systems.

Recommended effort: `medium`.

Closure decision: the current post-Phase-6 action-hierarchy polish sequence is
closed. Choose the next task from a fresh human-approved product goal,
playtest brief, or milestone instead of extending runtime UI polish
automatically.

Implemented Phase 7 Slice 1:

> Use docs and automated evidence to determine whether the DB-mode Character
> Library -> Runtime bridge needs a new implementation slice, a repeatable
> browser playtest harness, or a product scope reset, without adding new
> protocol, schema, combat automation, replay/catch-up semantics, production
> auth, or broad D&D systems.

Recommended effort: `high`.

Next recommended task:

**Phase 7 Slice 2: Character Library -> Runtime Bridge DB-Mode Browser
Playtest Harness**

Create or document a repeatable DB-mode browser playtest harness for the saved
Character Library -> Runtime bridge path. Preserve HttpOnly-cookie auth behavior
and avoid printing secrets. Keep it focused on confidence and repeatability,
not new runtime capability.

Recommended effort: `high`.

Implemented Phase 7 Slice 2:

> Add a repeatable DB-mode browser smoke harness for the saved Character
> Library -> Runtime bridge path. It should require a configured, migrated
> `DATABASE_URL`, preserve HttpOnly-cookie auth behavior, avoid printing
> secrets, submit the saved character from a Player browser profile, assign the
> runtime copy from a DM browser profile, and reread authoritative server state
> to verify runtime-copy/source-library provenance.

Recommended effort: `high`.

Next recommended task:

Run `corepack pnpm --filter @dnd/web test:smoke:bridge-db` against a migrated
DB-mode environment. If it fails, use the failure as the next narrow
implementation slice; if it passes, move to a fresh Phase 7 product-confidence
triage.

Implemented Phase 7 Slice 3:

> Run the DB-mode bridge harness against the current local environment and turn
> any failure into the next narrow implementation or setup slice. Keep this
> evidence/triage-only unless the failure is inside the harness itself, without
> changing runtime protocol, DB schema, auth semantics, combat automation,
> replay/catch-up behavior, or broader D&D systems.

Recommended effort: `high`.

Result: the harness now loads repo-local `.env`, reached real DB-backed server
startup, and was blocked by PostgreSQL password authentication for user
`dnd_web` before the browser bridge phase.

Next recommended task:

**Phase 7 Slice 4: DB-Mode Local Environment Readiness Check**

Add or document a non-secret preflight that verifies DB connection and required
migration tables before running the bridge browser harness. Do not print
`DATABASE_URL`, passwords, cookies, or raw connection strings.

Recommended effort: `high`.

Implemented Phase 7 Slice 4:

> Add a non-secret `@dnd/db` readiness check for DB-mode validation and run it
> before the Character Library -> Runtime bridge browser harness starts
> server/browser processes, without creating databases, running migrations,
> mutating records, changing runtime protocol, changing DB schema, or broadening
> auth/product scope.

Result: the readiness check now verifies `DATABASE_URL`, PostgreSQL
connectivity, and required current DB tables. In the current local environment,
it fails early on PostgreSQL password authentication for user `dnd_web`, before
server/browser startup.

Next recommended task:

**Phase 7 Slice 5: Fix/Provision Local DB Credentials & Migration State**

Make `corepack pnpm --filter @dnd/db check:readiness` pass against the local
DB, then rerun `corepack pnpm --filter @dnd/web test:smoke:bridge-db` for real
browser bridge evidence.

Recommended effort: `high`.

Implemented Phase 7 Slice 5:

> Fix or provision the local DB environment so `@dnd/db` readiness passes,
> apply the required migration state, and rerun the DB-mode Character Library
> -> Runtime bridge browser harness for real Player/DM evidence, without
> changing runtime protocol, DB schema, Character Library/runtime separation,
> combat automation, replay/catch-up semantics, or production auth scope.

Result: PostgreSQL was already installed, but the existing system service
credentials were not usable and Docker Desktop was unavailable. A project-local
PostgreSQL dev cluster was provisioned under the ignored `apps/server/data/`
tree on port `55432`, migrations `0001` through `0010` were applied, DB
readiness passes, and the DB-mode bridge browser smoke passes all 9 steps.

Next recommended task:

**Phase 7 Slice 6: Bridge DB-Mode Evidence Closure & Next Confidence Triage**

Use the passing DB-mode browser harness evidence to decide whether Phase 7
bridge confidence can close or needs one narrow follow-up. Keep this
evidence/triage-only unless a failure appears in current code.

Recommended effort: `medium`.

Implemented Phase 7 Slice 6:

> Use the passing DB-mode browser harness evidence to decide whether Phase 7
> bridge confidence can close or needs one narrow follow-up, without changing
> runtime protocol, DB schema, production auth, replay/catch-up semantics,
> combat automation, or broader D&D systems.

Closure decision: Phase 7 bridge confidence is closed for the current local
single-process DB-mode browser path. DB readiness passes and the bridge smoke
passes all 9 steps through Player saved-character submission, DM runtime-copy
assignment, and authoritative runtime-copy/source-library separation
validation.

Next recommended milestone:

**Fresh Product Playtest / Next-Goal Intake**

Run or define the next human-approved product playtest goal before starting
another implementation sequence. Keep the next task scoped by observed evidence
instead of automatically extending the bridge confidence sequence.

Recommended effort: `medium`.

Implemented Fresh Product Playtest / Next-Goal Intake:

> Collect fresh baseline evidence after Phase 6 and Phase 7 closure, then pick
> the next product-confidence milestone from observed evidence without changing
> runtime protocol, DB schema, production auth, replay/catch-up semantics,
> combat automation, or broader D&D systems.

Result: one-profile runtime smoke, two-profile DM/Player runtime smoke, and
DB-mode Character Library -> Runtime bridge smoke all passed. No fresh runtime
or bridge failure justifies extending Phase 6 or Phase 7 automatically.

Next recommended milestone:

**Phase 8: Character Library Builder / Export Product Confidence**

Start with **Phase 8 Slice 1: Character Library Builder / Export DB-Mode
Browser Playtest Triage**. Run a fresh DB-mode browser playtest of
login/register, `/characters`, Builder creation, portrait validation,
rules-derived previews, Save Draft, reload persistence, finalize, and PDF
export from Review and from the card before choosing any implementation slice.

Recommended effort: `high`.

Implemented Phase 8 Slice 1:

> Run a fresh DB-mode browser playtest of the persisted Character Library
> Builder and PDF export path, then decide whether the next task should be a
> narrow Builder/Library/PDF polish slice or closure, without changing runtime
> protocol, DB schema, production auth, production asset storage, Character
> Library/runtime separation, combat automation, spell automation, inventory, or
> broader D&D systems.

Result: login/register, `/characters`, Builder creation, race/class/background
selection gates, ability previews, details, and Review/sheet derived summaries
were verified in browser. `Save to Library` blocked before persisted card,
reload, finalize, or PDF export verification because the local DB is
`WIN1252`-encoded and cannot store Persian Builder JSON.

Implemented Phase 8 Slice 2:

> Make local DB-mode Character Library validation use a UTF-8 PostgreSQL
> database, then rerun the Builder/Export browser playtest through persistence,
> finalize, and PDF export.

Result: the project-local PostgreSQL dev cluster was reprovisioned with UTF-8,
migrations `0001` through `0010` were reapplied, DB readiness now verifies UTF8
server/client encoding plus a Persian Unicode round-trip probe, and
`corepack pnpm --filter @dnd/web test:smoke:builder-export-db` passes through
authenticated Persian draft creation, persisted browser reload, edit/review
sheet access, Review PDF affordance, authenticated finalize, card PDF
affordance, and finalized-state reread.

Implemented Phase 8 Slice 3:

> Expose the missing Character Library card-level finalize affordance so the
> persisted Builder/Export path completes from browser UI instead of a direct
> command-route shortcut.

Result: `/characters` draft cards now show a localized `Finalize Character`
action when the persisted entry has an owner, call the existing authenticated
Character Library finalize API, update the card from the returned entry, and
reuse the existing notice surface. The DB-mode Builder/Export smoke now
finalizes through the browser card UI before exercising card PDF affordance and
rereading finalized persistence.

Implemented Phase 8 Slice 4:

> Prove the browser-generated PDF artifact, not just the presence of PDF buttons
> or UI notices.

Result: explicit template PDF failures now fall back to the simple local PDF
instead of hard-failing browser export. The web tests cover explicit template
fallback, and the DB-mode Builder/Export smoke now captures browser-generated
Review/card PDF artifacts and verifies PDF header, byte length, `.pdf` file
name, UI notice, browser finalize flow, and finalized-state reread.

Implemented Phase 8 Slice 5:

> Close the remaining portrait evidence gap by proving the edit-page file
> input, portrait compression/preview, persisted storage, and library-card
> rendering path in DB mode.

Result: the DB-mode Builder/Export smoke now creates a temporary PNG, uploads it
through the edit-page file input with Chrome DevTools file-input automation,
verifies the preview, saves the draft, confirms the uploaded portrait persists
through the Character Library command route, reloads `/characters`, and verifies
the card renders the stored portrait. Stored server portrait URLs now resolve
against `NEXT_PUBLIC_SERVER_URL`, and uploaded portraits render with a plain
`<img>` instead of `next/image` so remote server images do not hit Next host
restrictions.

Next recommended task:

Run a narrow Phase 8 Builder/Export closure/readout or choose a fresh
product-confidence target. Do not continue DB readiness, PDF export, or portrait
upload work unless a new environment blocker appears.

Recommended effort: `medium`.

Implemented Phase 8 Slice 6:

> Use the completed Phase 8 DB-mode Builder/Export evidence to decide whether
> the confidence sequence can close or needs one narrow follow-up, without
> changing runtime protocol, DB schema, production auth, production asset
> storage, Character Library/runtime separation, combat automation, spell
> automation, inventory, PDF semantics, portrait storage, or broader D&D
> systems.

Closure decision: Phase 8 Builder/Export confidence is closed for the current
local single-process DB-mode browser path. DB readiness, PDF artifact
verification, and portrait-upload coverage should not be extended automatically
unless a new failure or playtest blocker appears.

Next recommended milestone:

Saved Character To Training Room Combined Browser Evidence Harness. The
end-to-end saved-character-to-Training-Room product-flow triage is complete and
recorded in
`docs/delivery/SAVED_CHARACTER_TRAINING_ROOM_PRODUCT_FLOW_TRIAGE.md`. DB
readiness, DB-mode Builder/Export smoke, DB-mode bridge smoke, and two-profile
Training Room runtime smoke passed. The remaining evidence gap is that these
proofs are split across separate harnesses; no single run currently follows one
saved Character Library entry through Player submission, DM runtime-copy
assignment, Training Room placement, encounter start, first-turn feedback,
recovery, and Local Reset. Do not continue DB readiness, PDF export, portrait
upload, runtime polish, or bridge confidence automatically unless a new blocker
appears.

Recommended effort: `high`.

**Character Library Usability Playtest Triage**

Run a focused `/characters` DB-mode browser usability pass to decide whether
the Character Library, Builder, draft/finalized card states, portrait behavior,
PDF export affordances, and finalized saved-entry -> runtime submission
boundary are understandable without internal implementation context.

Recommended effort: `medium`.

Implemented Character Library Usability Playtest Triage:

> Run a focused `/characters` DB-mode browser usability pass and record whether
> the Character Library, Builder, draft/finalized card states, portrait
> behavior, PDF export affordances, and finalized saved-entry -> runtime
> submission boundary are understandable without internal implementation
> context.

Result: DB readiness and `@dnd/web test:smoke:builder-export-db` pass through
the current local single-process DB-mode Character Library path. No mechanics
blocker was found. The next narrow observed issue is mixed-locale/high-traffic
copy in `/characters`: the hardcoded `Builder` nav label and card-level
PDF/export affordances should become localization-aware.

Next recommended task:

**Character Library Card Export / Bridge-Affordance Copy Polish**

Recommended effort: `medium`.

Implemented Character Library Card Export / Bridge-Affordance Copy Polish:

> Polish high-traffic `/characters` library/card copy so the Builder nav,
> library intro, card PDF export controls, PDF notices, and finalized
> saved-entry -> runtime-submission affordance are localization-aware and
> understandable in both English and Persian, without changing runtime
> protocol, DB schema, auth, PDF generation, portrait storage, Character
> Library/runtime separation, bridge behavior, combat automation,
> replay/catch-up semantics, production auth, production asset storage, or
> broader D&D systems.

Result: the affected Character Library shell/card/export copy now uses the
existing i18n system, and finalized cards explain that Player-mode `runtime`
submission creates a separate runtime copy while live runtime overlays do not
mutate the reusable library entry.

Next recommended task:

Implemented Character Sheet PDF Preview Before Download:

> Change the Review/Sheet and Character Library card PDF affordances so they
> show a simple web preview of the generated character sheet before the user
> downloads the PDF, without changing runtime protocol, DB schema, auth, PDF
> template semantics, portrait storage, Character Library/runtime separation,
> bridge behavior, combat automation, replay/catch-up semantics, production
> auth, production asset storage, or broader D&D systems.

Result: Review/Sheet PDF buttons and Character Library card PDF buttons now
open a reusable HTML character-sheet preview first. The existing local
template/fallback PDF generator still owns the downloaded PDF, and the DB-mode
Builder/Export smoke verifies preview readiness, PDF artifact generation, and
explicit download from the preview dialog.

Implemented Character Sheet PDF Preview Browser Verification / Closure:

> Prove the generated web preview is visible and reviewable in the browser
> before download, without changing runtime protocol, DB schema, auth, PDF
> template semantics, portrait storage, Character Library/runtime separation,
> bridge behavior, combat automation, replay/catch-up semantics, production
> auth, production asset storage, or broader D&D systems.

Result: the DB-mode Builder/Export smoke now verifies Review/card preview
dialog content before download, including dialog controls, the Persian
character name, printable LTR sheet surface, mapped sheet fields, PDF artifact
capture, and explicit download from the preview dialog.

Next recommended task:

Choose a fresh human-approved product-confidence target. Do not continue DB
readiness, PDF export, portrait upload, runtime polish, or bridge confidence
automatically unless a new blocker appears.

Recommended effort: `medium`.
