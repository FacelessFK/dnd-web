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

## Future Slices

- DM position/reposition override.
- DM turn usage override.
- DM condition editing foundation after the condition model exists.
- DM encounter participant management.
- Durable override audit trail in a later persistence phase.

## Design Notes

- This is backend-only by design.
- `character_state` is a live partial update, not durable replay.
- True auditability and transaction safety require future persistence/outbox
  work; this slice keeps the command path explicit without pretending in-memory
  storage is transactional.
