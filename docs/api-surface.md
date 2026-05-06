# API Surface

This document reflects the current protocol and server implementation. The
shared Zod schemas in `packages/protocol` remain the source of truth for exact
payload and response shapes.

## Base Runtime

Default local server URL:

```text
http://localhost:2567
```

The web cockpit reads `NEXT_PUBLIC_SERVER_URL` when set and otherwise uses that
local default.

Root status:

```http
GET /
```

Current response:

```json
{
  "name": "dnd-dm-platform-server",
  "phase": "phase-12",
  "status": "db-idempotency-claim-plus-scene-transaction-and-session-character-movement-encounter-combat-outbox-foundation"
}
```

## Command Endpoints

All command endpoints accept JSON and return either:

```json
{ "ok": true, "data": {} }
```

or:

```json
{ "ok": false, "error": { "code": "runtime_error_code", "message": "..." } }
```

### `POST /api/session/command`

Mutating commands:

- `create_session`
- `join_session`

Read/recovery command:

- `reconnect_session`

Notes:

- `create_session` returns the initial session snapshot and stream path for the
  creating participant.
- `join_session` returns the updated session snapshot and stream path for the
  joining participant.
- `reconnect_session` returns the current session snapshot and stream path. It
  is the browser recovery path after refresh.

### `POST /api/characters/command`

Mutating commands:

- `create_character`
- `update_character`
- `finalize_character`
- `assign_character_to_participant`

Read command:

- `get_character`

Notes:

- Character reads return a `CharacterResource`: canonical character data,
  derived stats, overlay, and rules profile.
- `assign_character_to_participant` mutates the session snapshot and emits the
  same `session_state` semantics as the runtime already had.

### `POST /api/scenes/command`

Mutating commands:

- `create_scene`
- `activate_scene_for_session`
- `place_entity_in_scene`

Read command:

- `get_scene`

Notes:

- `create_scene` and `place_entity_in_scene` mutate scene records.
- `activate_scene_for_session` mutates the session snapshot and returns the
  updated session state.
- Scene entity placement is separate from character active-scene placement.

### `POST /api/movement/command`

Mutating commands:

- `place_character_in_active_scene`
- `move_character_in_active_scene`

Read command:

- `get_active_scene_state`

Notes:

- `get_active_scene_state` returns the current active-scene placement read
  model.
- Movement state is authoritative on the server. The browser sends intent only.
- Encounter-aware movement spending stays on the combat transaction path when
  the DB-backed transaction boundaries are injected.

### `POST /api/encounters/command`

Mutating commands:

- `start_encounter`
- `advance_turn`
- `use_action`
- `use_bonus_action`
- `use_reaction`
- `record_movement_usage`
- `attack`

Read command:

- `get_encounter_state`

Notes:

- Encounter commands return the current encounter snapshot.
- `attack` currently uses the narrow attack foundation: legality-before-RNG,
  fixed damage, HP floor, and server-owned turn/action updates.

### `POST /api/dm/command`

Mutating commands:

- `dm_set_character_current_hp`
- `dm_set_character_active_conditions`
- `dm_reposition_character_in_active_scene`
- `dm_set_current_turn_usage`
- `dm_set_current_turn_participant`
- `dm_end_active_encounter`

Notes:

- These are explicit DM controls, not a generic unsafe override surface.
- Condition tags are metadata only in the current runtime and do not apply rules
  effects.
- Ending an active encounter publishes the final ended encounter snapshot and
  then clears the active encounter from future reads.

## Command IDs And Idempotency

Every command has a `commandId`.

Current behavior:

- Successful mutating command responses are cached by command category, command
  type, command ID, actor participant ID, and session ID when present.
- Retrying the same successful command returns the cached success response.
- Retrying the same command ID with a conflicting fingerprint returns
  `command_id_conflict`.
- Failed command responses are not cached.
- Read commands are intentionally not cached.
- Default local startup still uses in-memory runtime state.
- DB-backed transactional paths now include a narrow durable pre-execution
  idempotency-claim foundation for covered commands so concurrent duplicate
  requests cannot both apply side effects before one durable success wins.

## SSE Stream

```http
GET /api/sessions/:sessionId/stream?participantId=:participantId
```

The server validates that the participant can read the session before opening
the stream. The response is `text/event-stream`.

Current event types:

- `session_state`
- `movement_state`
- `encounter_state`
- `combat_event`
- `character_state`

Snapshot-style events:

- `session_state` includes a full session snapshot and revision.
- `encounter_state` includes the current encounter snapshot.

Partial live updates:

- `movement_state` includes one participant/character placement or movement
  update.
- `character_state` includes authoritative HP and optional active condition
  tags for one character.

Transient events:

- `combat_event` reports attack resolution details, including roll, hit, damage,
  and target HP transition.

## Recovery Guidance

SSE is live delivery only. The current architecture does not provide durable
event replay, stream cursors, or catch-up APIs.

After refresh or reconnect, clients should rebuild state with:

- `reconnect_session`
- `get_scene` when the recovered session has `activeSceneId`
- `get_active_scene_state`
- `get_encounter_state`
- `get_character` for assigned or locally known character IDs

The browser cockpit follows this model: SSE updates live state when connected,
and the Recover button rereads authoritative state through command read models.
Expected empty-read cases such as `no_active_scene` and `no_active_encounter`
are treated as recoverable local state, not failed recovery.

## Browser Runtime Surface

The role-aware runtime surface at `/runtime` uses this API surface directly. The
launcher supports DM mode and Player mode. DM mode can run a fresh demo setup,
seed the sample session, operate scene/encounter controls, and use explicit DM
override commands. Player mode can join or recover an existing session, read its
assigned character, move only its own token, use turn resources as itself, and
attack selected player targets. Debug/event details remain available but are
secondary to the play surface.

The browser still treats the server as authoritative: grid, encounter,
character, and session state are rendered from command responses, read-model
recovery, or live SSE updates. Local Reset only clears browser state; it does not
delete backend sessions or runtime state.

## Known Limitations

- No authentication or authorization beyond command actor/role validation.
- No event replay, cursor, or durable catch-up API.
- No multi-process subscriber persistence or distributed coordination.
- No opportunity attacks, reaction windows, full condition engine, death saves,
  spells, weapon system, ranged attacks, or monster AI.
- Process-local SSE subscribers mean cold boot remains inert; unpublished
  outbox rows may remain stored, but the server does not auto-redeliver them on
  startup.
