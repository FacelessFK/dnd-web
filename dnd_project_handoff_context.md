# D&D DM Platform Handoff Context

This handoff summarizes the current repository state after Phase 9 Slice 4. It
is intentionally concise; trust implementation code and protocol schemas over
older planning language if details disagree.

## Current Project Position

- The project is a backend-first, server-authoritative D&D runtime foundation.
- The backend is playable for a narrow session, scene, movement, encounter,
  attack, downed-state, reaction-usage, reconnect, idempotency, and DM-admin
  flow.
- The runtime is still in-memory only.
- The web app remains a minimal shell, not a battle UI or DM panel.
- The project is not MVP-ready because persistence, frontend UX, durable event
  handling, broader rules, and production posture are still missing.

## Completed Runtime Foundations

- Session create, join, reconnect, presence, and SSE initial sync.
- Character create, update, finalize, assign, and read.
- Rules profile baseline and derived character stats.
- Scene create, read, activate, and scene entity placement.
- Active-scene character placement and movement with occupancy validation.
- Active-scene read model through `get_active_scene_state`.
- Encounter start, read, turn advancement, and current turn usage.
- Action, bonus action, reaction, and movement usage commands.
- Narrow `attack` action with legality-before-RNG validation.
- HP-derived downed state baseline.
- In-memory command idempotency for mutating command successes.
- Reconnect recovery through read models instead of missed-event replay.
- Event/revision semantics documentation.
- Transaction-boundary risk documentation for future persistence work.

## Completed Combat Foundations

- Phase 6 added the narrow attack foundation:
  - current-turn attacker only,
  - valid placed target only,
  - 5-foot Manhattan melee reach baseline,
  - server-side `1d20 + STR modifier + proficiency`,
  - fixed hit damage of `1`,
  - target HP floor at `0`,
  - action consumption on successful attack resolution,
  - `encounter_state` emitted before `combat_event`.
- Phase 7 added narrow combat-state foundations:
  - downed state is derived from `character.hp.current === 0`,
  - downed current-turn actors cannot perform turn-bound combat actions,
  - downed current-turn actors cannot move during active encounters,
  - DM can still advance turns,
  - `use_reaction` exists as current-turn usage state only.

## Completed Roadmap Phase 8 Backend DM Controls

All current DM commands use `POST /api/dm/command` and the `dm` idempotency
category.

- `dm_set_character_current_hp`
  - Changes only `character.hp.current`.
  - Emits `character_state` with reason `dm_hp_changed`.
- `dm_set_character_active_conditions`
  - Replaces `overlay.activeConditions`.
  - Emits `character_state` with reason `dm_conditions_changed`.
  - Condition tags are metadata only; they do not apply rules effects.
- `dm_reposition_character_in_active_scene`
  - Repositions an assigned character in the active scene.
  - Reuses occupancy validation.
  - Emits `movement_state` with reason `dm_character_repositioned`.
  - Does not spend movement or require current-turn ownership.
- `dm_set_current_turn_usage`
  - Replaces active encounter `currentTurnUsage`.
  - Emits `encounter_state` with reason `dm_turn_usage_changed`.
- `dm_set_current_turn_participant`
  - Sets the active turn actor by participant.
  - Resets current turn usage.
  - Emits `encounter_state` with reason `dm_current_turn_changed`.
  - Does not reroll initiative, reorder participants, or change round number.
- `dm_end_active_encounter`
  - Emits one final `encounter_state` with reason `encounter_ended`.
  - Clears the active encounter.
  - Does not preserve encounter history yet.

## Current API Surface

- `POST /api/session/command`
- `POST /api/characters/command`
- `POST /api/scenes/command`
- `POST /api/movement/command`
- `POST /api/encounters/command`
- `POST /api/dm/command`
- `GET /api/sessions/:sessionId/stream?participantId=:participantId`

Read commands are intentionally not cached by idempotency:

- `get_character`
- `get_scene`
- `get_active_scene_state`
- `get_encounter_state`

## Current SSE Events

- `session_state`
  - Snapshot-style session update with session revision.
- `encounter_state`
  - Snapshot-style encounter update.
- `movement_state`
  - Live partial movement, placement, or reposition update.
- `combat_event`
  - Transient combat result notification.
- `character_state`
  - Live partial character update for DM HP or condition-tag changes.

Missed transient/live-partial events are not replayed. Reconnecting clients
should recover current authoritative state through read models.

## Known Limitations

- No database persistence.
- No durable idempotency.
- No durable event replay.
- No global event cursor.
- No event sourcing.
- No audit log.
- No outbox/transactional event publication.
- No frontend battle UI.
- No frontend DM panel.
- No full condition engine.
- No condition rules effects.
- No death saves or recovery rules.
- No spells.
- No weapons or inventory system.
- No ranged attacks.
- No opportunity attacks or reaction windows.
- No geometry, LOS, visibility, or cover rules.
- No monster/NPC AI.
- No auth.
- No production deployment posture.

## Likely Next Work Options

1. Finish Phase 9 documentation cleanup if more stale API/manual-validation
   details are found.
2. Start a narrow persistence planning or first durable repository slice, with
   explicit transaction/outbox design instead of fake in-memory transactions.
3. Start Roadmap Phase 9 geometry foundations with pure LOS/cover helpers only,
   before wiring them into combat legality.
4. Add more DM controls only as explicit narrow commands, such as concentration
   or visibility editing, if product use demands them.

Avoid broad gameplay expansion next. Spells, full conditions, opportunity
attacks, weapons, and frontend battle UX should remain dedicated future slices.
