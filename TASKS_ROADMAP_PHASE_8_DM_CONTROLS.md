# Roadmap Phase 8 — DM Control Surface & Usability Layer

This task file tracks backend DM-control work for the original `ROADMAP.md`
Phase 8. It intentionally uses a dedicated name instead of `TASKS_PHASE_8.md`
because the internal Phase 8 file already tracks runtime reliability and
reconnect readiness.

## Phase Goal

Introduce narrow, server-authoritative DM controls that let the DM correct or
override runtime state safely without building a full frontend control panel
yet.

## Phase Scope

- Add explicit DM-only command surfaces.
- Keep each override narrow and auditable by shape, even before durable audit
  logging exists.
- Broadcast authoritative state changes to connected participants.
- Preserve existing session, character, movement, encounter, and combat
  boundaries.
- Keep controls backend-only until the frontend battle UX exists.

## Explicit Non-Goals

- No frontend DM control panel in this phase file.
- No durable audit log yet.
- No database persistence.
- No event replay or global event cursor.
- No death saves, recovery rules, full condition engine, spells, weapons,
  ranged attacks, or opportunity attacks.
- No authentication beyond existing participant role checks.

## Slice 1 — DM Current HP Override

Status: Completed.

Implemented:

- Added `dm_set_character_current_hp`.
- Added `/api/dm/command`.
- Restricted the command to the session DM.
- Validated target participant membership and assigned character ownership.
- Validated `currentHp` as an integer from `0` through the character's max HP.
- Updated only `character.hp.current` and `updatedAt`.
- Preserved max HP, temp HP, character status, and build fields.
- Added `character_state` SSE with reason `dm_hp_changed`.
- Integrated the command with in-memory command idempotency under the `dm`
  category.
- Confirmed that setting a current-turn actor to `0` HP feeds existing downed
  turn-action gating.

## Slice 2 — DM Character Reposition Override

Status: Completed.

Implemented:

- Added `dm_reposition_character_in_active_scene`.
- Reused `/api/dm/command` and the existing `dm` idempotency category.
- Restricted repositioning to the session DM.
- Validated target participant membership and assigned character ownership.
- Required a real active scene.
- Reused active-scene grid and occupancy validation.
- Allowed administrative reposition whether the character was unplaced, already
  placed in the active scene, or placed in a different scene.
- Updated only the character overlay position.
- Reused `movement_state` with reason `dm_character_repositioned`.
- Confirmed encounter state is not mutated, movement is not spent, current-turn
  ownership is not checked, and downed characters can still be repositioned by
  the DM.

## Slice 3 — DM Turn Usage Override

Status: Completed.

Implemented:

- Added `dm_set_current_turn_usage`.
- Reused `/api/dm/command` and the existing `dm` idempotency category.
- Restricted the command to the session DM.
- Required an active encounter.
- Updated only the current encounter's `currentTurnUsage`.
- Added `encounter_state` reason `dm_turn_usage_changed`.
- Returned an explicit DM success payload containing the updated encounter.
- Confirmed the command does not advance turns, mutate participants, change HP,
  change scene position, emit combat events, emit movement events, or emit
  character-state events.
- Kept the command administrative: schema-valid movement usage can be set
  without checking the current actor's speed.

## Slice 4 — DM Controls Foundation Exit Pass

Status: Completed.

Reviewed:

- DM-only authorization across all current DM commands.
- Command naming and `/api/dm/command` routing consistency.
- DM command success response shape for character-resource and encounter-state
  results.
- In-memory idempotency behavior through the shared `dm` category.
- SSE event semantics for character, movement, and encounter updates.
- Read-model recovery expectations after DM overrides.
- README/API surface alignment.
- Task tracking clarity for Roadmap Phase 8 versus the internal Phase 8
  reliability phase.

No new DM feature was added in this exit pass.

## Slice 5 — DM Encounter End Foundation

Status: Completed.

Implemented:

- Added `dm_end_active_encounter`.
- Reused `/api/dm/command` and the existing `dm` idempotency category.
- Restricted the command to the session DM.
- Required an active encounter.
- Added final `encounter_state` reason `encounter_ended`.
- Added `ended` as a valid encounter status for the final response/SSE payload.
- Cleared the active encounter from the in-memory encounter store after building
  the final ended encounter state.
- Confirmed `get_encounter_state` returns `no_active_encounter` after ending.
- Confirmed a new encounter can be started later in the same session.
- Confirmed ending does not reset HP, move characters, change active scene,
  change character assignments, advance turns, or emit combat/movement/character
  events.

Design boundary:

- Ending is destructive and in-memory-only for now.
- Ended encounters are not preserved in history.
- There is no combat summary, audit log, replay, or persistence yet.

## Slice 6 — DM Current Turn Override Foundation

Status: Completed.

Implemented:

- Added `dm_set_current_turn_participant`.
- Reused `/api/dm/command` and the existing `dm` idempotency category.
- Restricted the command to the session DM.
- Required an active encounter.
- Required the requested participant to be part of the active encounter.
- Set `currentTurnIndex` so the requested participant becomes the active turn
  actor.
- Reset `currentTurnUsage` to the empty/default turn usage state.
- Added `encounter_state` reason `dm_current_turn_changed`.
- Confirmed the command does not reroll initiative, reorder participants,
  change HP, change character position, emit combat events, emit movement
  events, or emit character-state events.

Design boundary:

- This is an administrative bookkeeping override, not normal turn progression.
- The command does not automatically change `roundNumber`.
- Richer initiative/order editing remains deferred to a future dedicated slice.

## Slice 7 — DM Controls Combat Foundation Exit Pass

Status: Completed.

Reviewed:

- DM-only authorization across the current DM command surface.
- Command naming and `/api/dm/command` routing consistency.
- Response shape consistency for character-scoped and encounter-scoped DM
  commands.
- In-memory idempotency behavior through the shared `dm` category.
- SSE event semantics for character, movement, and encounter updates.
- Read-model recovery expectations after DM commands.
- README/API surface alignment.
- Task tracking clarity for completed DM combat/admin foundations.

Current command boundaries:

- Character-scoped override: `dm_set_character_current_hp` emits
  `character_state` with reason `dm_hp_changed`.
- Scene/admin reposition: `dm_reposition_character_in_active_scene` emits
  `movement_state` with reason `dm_character_repositioned`; it does not spend
  movement, require current-turn ownership, or mutate encounter usage.
- Encounter bookkeeping: `dm_set_current_turn_usage` emits `encounter_state`
  with reason `dm_turn_usage_changed`.
- Encounter lifecycle/admin: `dm_end_active_encounter` emits one final
  `encounter_state` with reason `encounter_ended`, clears the active encounter,
  and does not preserve encounter history in this slice.
- Current turn override: `dm_set_current_turn_participant` emits
  `encounter_state` with reason `dm_current_turn_changed`, resets current turn
  usage, and does not reroll initiative, reorder participants, or
  automatically change round number.

No new DM feature was added in this exit pass.

## Slice 8 — DM Condition Tag Editing Foundation

Status: Completed.

Implemented:

- Added `dm_set_character_active_conditions`.
- Reused `/api/dm/command` and the existing `dm` idempotency category.
- Restricted the command to the session DM.
- Validated target participant membership and assigned character ownership.
- Updated only `overlay.activeConditions`.
- Preserved HP, position, footprint, concentration, visibility, character build
  fields, and ownership/session integrity.
- Added `character_state` reason `dm_conditions_changed`.
- Included authoritative `activeConditions` in condition character-state
  updates.
- Validated condition tags as trimmed, non-empty, unique strings without
  requiring a closed condition enum.
- Added `invalid_condition_list` for invalid condition tag lists.

Design boundary:

- Condition tags are DM-managed overlay metadata only in this slice.
- This slice does not add condition rules effects or a condition engine.
- Setting `prone`, `unconscious`, or similar tags does not yet alter movement,
  attack legality, downed behavior, or turn usage.
- Future slices may connect specific condition tags to rules behavior once a
  condition model/engine exists.

## Slice 9 — DM Condition/Admin Foundation Exit Pass

Status: Completed.

Reviewed:

- DM-only authorization across character, scene, and encounter admin commands.
- Command naming and `/api/dm/command` routing consistency.
- Response shape consistency for character-resource and encounter-state DM
  results.
- In-memory idempotency behavior through the shared `dm` category.
- SSE event semantics for `character_state`, `movement_state`, and
  `encounter_state`.
- Read-model recovery expectations after DM admin commands.
- README/API surface alignment.
- Character-state payload consistency for HP and condition-tag updates.

Current admin boundaries:

- Character-scoped admin updates: `dm_set_character_current_hp` and
  `dm_set_character_active_conditions` both emit `character_state` with
  authoritative HP and active condition tags.
- Scene/admin reposition: `dm_reposition_character_in_active_scene` emits
  `movement_state` with reason `dm_character_repositioned`; it does not spend
  movement, require current-turn ownership, or mutate encounter usage.
- Encounter bookkeeping/admin: `dm_set_current_turn_usage` emits
  `encounter_state` with reason `dm_turn_usage_changed`.
- Current turn override: `dm_set_current_turn_participant` emits
  `encounter_state` with reason `dm_current_turn_changed`, resets current turn
  usage, and does not reroll initiative, reorder participants, or
  automatically change round number.
- Encounter lifecycle/admin: `dm_end_active_encounter` emits one final
  `encounter_state` with reason `encounter_ended`, clears the active encounter,
  and does not preserve encounter history in this slice.
- Condition/admin boundary: active condition tags are authoritative
  DM-managed metadata only; they do not automatically change movement, attacks,
  turn usage, or HP-derived downed behavior.

No new DM feature was added in this exit pass.

## Acceptance Criteria

- DM can set an assigned character's current HP.
- Players cannot use the DM command surface.
- Invalid target participant/character associations fail safely.
- HP below `0` and above max HP are rejected.
- Successful commands emit one `character_state` update.
- Duplicate successful command retries return cached success without duplicate
  SSE.
- Command ID conflicts return `command_id_conflict` without mutation.
- Downed state remains derived from `hp.current === 0`.
- DM reposition emits one `movement_state` update with
  `dm_character_repositioned`.
- DM reposition does not emit `encounter_state`.
- DM reposition does not spend movement or require turn ownership.
- DM turn usage override emits one `encounter_state` update with
  `dm_turn_usage_changed`.
- DM turn usage override mutates only encounter bookkeeping state.
- DM encounter end emits one final `encounter_state` update with
  `encounter_ended`.
- DM encounter end clears the active encounter without mutating scene or
  character state.
- DM current-turn override emits one `encounter_state` update with
  `dm_current_turn_changed`.
- DM current-turn override changes only `currentTurnIndex` and
  `currentTurnUsage`.
- DM current-turn override does not reroll initiative, reorder participants, or
  change the round number.
- DM controls foundation exit pass confirms all current DM commands use
  `/api/dm/command` and the `dm` idempotency category.
- DM can set assigned character active condition tags.
- DM condition tag editing emits one `character_state` update with
  `dm_conditions_changed`.
- DM condition tag editing mutates only `overlay.activeConditions`.
- Duplicate or empty condition tags are rejected.
- Condition tags do not apply rules effects in this slice.
- Character-state updates consistently include authoritative HP and active
  condition tags.
- DM condition/admin exit pass confirms no concentration editor, visibility
  editor, force reposition mode, audit log, replay, persistence, or frontend DM
  panel exists yet.

## Tests Added

- DM HP override success and `get_character` readback.
- `character_state` stream update on success.
- Player authorization rejection.
- Assignment mismatch rejection.
- HP range rejection.
- Downed integration through existing turn-action gating.
- Server command schema validation.
- Server idempotency duplicate success and conflict handling.
- Session revision behavior for character-state broadcasts.
- DM reposition success for unplaced, active-scene placed, and different-scene
  placed characters.
- DM reposition movement-state propagation.
- DM reposition authorization, active scene, assignment, bounds, and occupancy
  validation.
- DM reposition encounter non-interference.
- DM reposition idempotent duplicate and conflict behavior.
- DM turn usage override success and readback.
- DM turn usage override authorization and no-active-encounter rejection.
- DM turn usage override protocol validation for invalid movement usage.
- DM turn usage override event-boundary and idempotency behavior.
- DM encounter end success, post-end read failure, and restart behavior.
- DM encounter end authorization and no-active-encounter rejection.
- DM encounter end event-boundary and idempotency behavior.
- DM current-turn override success and usage reset.
- DM current-turn override authorization, no-active-encounter, and
  invalid-participant rejection.
- DM current-turn override event-boundary and idempotency behavior.
- DM condition tag edit success and `get_character` readback.
- DM condition tag edit authorization and assignment validation.
- DM condition tag duplicate/empty validation.
- DM condition tag event-boundary and idempotency behavior.
- Character-state stream validation for condition tag payloads.
- Character-state payload consistency for HP and condition-tag updates.

## Future Slices

- Explicit force/ignore-occupancy reposition override, if product needs it.
- Encounter reset/history/audit flows.
- Richer initiative/order editing, if product needs it.
- Condition rules-effect integration after a condition model/engine exists.
- DM encounter participant management.
- Durable override audit trail in a later persistence phase.

## Design Notes

- This is backend-only by design.
- `character_state` is a live partial update, not durable replay.
- Current DM HP override is character-scoped and emits `character_state`.
- Current DM condition-tag override is character-scoped, emits
  `character_state`, and updates only overlay metadata.
- Current DM reposition override is administrative, respects active-scene
  occupancy validation, and emits `movement_state`.
- Current DM turn-usage override is encounter-scoped and emits
  `encounter_state`.
- Current DM turn-participant override is encounter-scoped, emits
  `encounter_state`, resets turn usage, and preserves participant order,
  initiative values, and round number.
- All current DM commands are idempotent through the `dm` command category.
- All current DM commands use `/api/dm/command`.
- There is no audit log, event replay, or durable override history yet.
- There is no force mode or ignore-collision reposition override yet.
- There is no condition rules engine or condition effect automation yet.
- There is no concentration editor yet.
- There is no visibility editor yet.
- Encounter end exists, but there is no encounter reset, history, audit, or
  cleanup flow yet.
- There is no frontend DM panel yet.
- Future DM controls should continue as dedicated narrow slices instead of
  becoming a broad generic override endpoint.
- True auditability and transaction safety require future persistence/outbox
  work; this slice keeps the command path explicit without pretending in-memory
  storage is transactional.
