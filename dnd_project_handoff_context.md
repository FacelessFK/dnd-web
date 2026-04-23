# D&D DM Platform Handoff Context

This handoff summarizes the current repository state after Phase 10 Slice 4.
It is intentionally concise; trust implementation code and protocol schemas over
older planning language if details disagree.

## Current Project Position

- The project is a backend-first, server-authoritative D&D runtime foundation.
- The backend is playable for a narrow session, scene, movement, encounter,
  attack, downed-state, reaction-usage, reconnect, idempotency, and DM-admin
  flow.
- The default runtime still starts with in-memory session, scene, encounter,
  idempotency, and character stores.
- A DB-backed character repository boundary now exists and can be injected into
  the live server/runtime command path.
- The web app remains a minimal shell, not a battle UI or DM panel.
- The project is not MVP-ready because runtime-wide persistence, frontend UX,
  durable event handling, broader rules, and production posture are still
  missing.

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
- Drizzle/Postgres character-record persistence boundary.
- Async character repository support through live server/runtime command paths.

## Completed Phase 10 Persistence Foundation So Far

- Added a `character_records` Drizzle/Postgres schema and migration.
- Added `DrizzleCharacterRecordDatabase` in `packages/db`.
- Added `DbBackedCharacterRepository` for full `StoredCharacterRecord`
  documents:
  - canonical `character`,
  - runtime `overlay`.
- Added an internal awaitable character repository boundary in the runtime.
- Updated server handlers to await runtime command results while preserving
  public HTTP/protocol/SSE behavior.
- Added server-level test coverage proving the DB-backed character repository
  can be used through real command paths by injection.

Important boundary:

- DB-backed character storage is usable, but it is not the default server
  startup path yet.
- Phase 10 Slice 3 added a DB-backed completed-command idempotency record
  boundary for supported character-record mutation commands when the DB-backed
  stores are injected.
- The follow-up transaction slice lets supported character mutations commit the
  character write and durable idempotency success record in one real DB
  transaction, with `character_state` SSE buffered until commit.
- Phase 10 Slice 4 proves a restarted runtime can reread persisted character
  state through `get_character` when the same DB-backed character repository is
  injected and a new valid session context is established.
- Sessions, scenes, encounters, most command idempotency, SSE delivery, replay,
  and outbox behavior remain non-durable.

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

- No runtime-wide database persistence.
- Character records have a DB-backed repository boundary, but default local
  server startup remains in-memory unless a DB-backed repository is injected.
- Old `reconnect_session` state does not survive runtime/server restart because
  sessions and participant membership remain in memory.
- No command-surface-wide durable idempotency. Durable idempotency records exist
  only for supported character-record mutation commands when the DB-backed
  idempotency/transaction boundary is injected.
- No durable event replay.
- No global event cursor.
- No event sourcing.
- No audit log.
- No outbox/transactional event publication.
- No durable session, scene, or encounter repositories.
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

1. Implement Phase 10 Slice 5 — Persistence Exit Pass, or start the next
   durable repository slice first if stronger restart-safe reconnect behavior
   needs persisted session/scene/encounter state.
2. Keep durable idempotency narrow: preserve current key/fingerprint semantics,
   cache successful mutating command responses, and avoid claiming global
   restart-safe behavior for stores that are still in memory.
3. Continue durable repository expansion for sessions, scenes, and encounters.
4. Add outbox/replay only as dedicated future slices once durable writes need
   reliable publication.
5. Start product-surface work, such as character onboarding or top-down tactical
   UI, only after the next durability boundary is clear.

Avoid broad gameplay expansion next. Spells, full conditions, opportunity
attacks, weapons, and frontend battle UX should remain dedicated future slices.
