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

## Future Slices

- DM condition editing foundation after the condition model exists.
- Explicit force/ignore-occupancy reposition override, if product needs it.
- Encounter end command.
- DM encounter participant management.
- Durable override audit trail in a later persistence phase.

## Design Notes

- This is backend-only by design.
- `character_state` is a live partial update, not durable replay.
- Current DM HP override is character-scoped and emits `character_state`.
- Current DM reposition override is administrative, respects active-scene
  occupancy validation, and emits `movement_state`.
- Current DM turn-usage override is encounter-scoped and emits
  `encounter_state`.
- All current DM commands are idempotent through the `dm` command category.
- There is no audit log, event replay, or durable override history yet.
- There is no force mode or ignore-collision reposition override yet.
- There is no condition editor yet.
- There is no encounter end, reset, or cleanup flow yet.
- Future DM controls should continue as dedicated narrow slices instead of
  becoming a broad generic override endpoint.
- True auditability and transaction safety require future persistence/outbox
  work; this slice keeps the command path explicit without pretending in-memory
  storage is transactional.
