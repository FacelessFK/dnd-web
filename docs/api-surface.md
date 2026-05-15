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

## Development Auth Endpoints

- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

Auth is currently a development feature for the Character Library UI. Register
and login require DB mode because `AuthService` is injected only when
`SERVER_PERSISTENCE_MODE=db`. `GET /api/auth/me` returns `user: null` when no
auth service or valid cookie is present. This is not production account
security.

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
- `submit_character_for_assignment`
- `assign_character_to_participant`

Read command:

- `get_character`

Notes:

- Character reads return a `CharacterResource`: canonical character data,
  derived stats, overlay, and rules profile.
- `submit_character_for_assignment` lets the owning player submit a finalized
  character into session state as `pendingCharacterId` for DM assignment.
- `assign_character_to_participant` mutates the session snapshot and emits the
  same `session_state` semantics as the runtime already had. Assignment clears
  that participant's pending character request.

### `POST /api/character-library/command`

Mutating commands:

- `create_character_library_entry`
- `update_character_library_entry`
- `finalize_character_library_entry`

Read commands:

- `get_character_library_entry`
- `list_character_library_entries`

Notes:

- This endpoint owns reusable Character Library entries, not live
  runtime/session character overlays.
- Entries are scoped to `ownerParticipantId`. When DB-mode auth is injected,
  the authenticated user's owner ID must match the command actor and payload.
  Without auth injection, command validation still uses the actor/payload owner
  fields but does not provide production identity security.
- In DB persistence mode, entries are stored in
  `character_library_entries`. The table stores a JSONB builder/library document
  plus durable owner and timestamp columns.
- `create` and `update` persist builder progress, rules profile, ability score
  method, identity, selected species/race, class, background, abilities,
  derived combat basics, proficiencies, languages, tools, equipment, spells,
  and portrait references.
- Uploaded portrait references must be JPEG, PNG, or WebP data URLs up to 1 MB.
  Entries without uploads can store a selected species/race asset reference.
- `finalize_character_library_entry` marks a reusable library entry finalized.
  It does not submit the character into a runtime session.
- Read/list commands are not idempotency-cached. Mutating commands use the
  `character-library` idempotency category.

### `POST /api/scenes/command`

Mutating commands:

- `create_scene`
- `activate_scene_for_session`
- `place_entity_in_scene`
- `update_scene_entity`
- `reposition_scene_entity`
- `delete_scene_entity`
- `create_scene_transition`
- `update_scene_transition`
- `delete_scene_transition`
- `activate_scene_transition`

Read command:

- `get_scene`

Notes:

- `create_scene`, `place_entity_in_scene`, `update_scene_entity`,
  `reposition_scene_entity`, `delete_scene_entity`,
  `create_scene_transition`, `update_scene_transition`, and
  `delete_scene_transition` mutate scene records.
- `activate_scene_for_session` and `activate_scene_transition` mutate the
  session snapshot and return the updated session state.
- Scene entity placement is separate from character active-scene placement.
- Scene entities use the existing scene entity shape: type, name, position,
  footprint, movement/vision blocking flags, hidden flag, and optional metadata.
- `update_scene_entity`, `reposition_scene_entity`, and `delete_scene_entity`
  are DM-only passive map-object operations. They reject combatant scene
  entities; monster/NPC HP, movement, and attacks stay on explicit DM combatant
  commands.
- Transition nodes are DM-authored scene entities with typed transition data:
  kind, target scene ID, optional target label, and optional notes. They model
  narrow MVP doors, stairs, portals, gates, or other linked markers.
- `activate_scene_transition` is DM-only. It validates the source scene,
  transition node, and target scene, then applies the existing active-scene
  session mutation. Players may see visible transition markers but cannot
  activate scene changes in this slice.
- Transition activation does not teleport characters, start/end encounters,
  run scripts, or implement locks, traps, fog of war, line of sight, or
  lighting.
- Passive scene entities remain map/object/obstacle data. DM-controlled
  monster/NPC combatants are represented as explicit scene entities with
  combatant stats and are created only through DM commands.
- There is no scene-specific SSE event. Browser map/entity state is updated from
  command responses and recovered through `get_scene`.

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
- `start_encounter` includes placed assigned player characters and active-scene
  monster/NPC combatants with current HP above 0.
- Encounter participants can be player-character turns or DM-controlled
  combatant turns. Character participants preserve the existing response shape;
  combatant participants include `kind: "combatant"` and `combatantId`.
- `attack` uses the narrow attack foundation: legality-before-RNG, 5-foot
  melee reach, d20 roll, fixed hit damage of 1, HP floor, and server-owned
  turn/action updates.
- `attack.payload` must include exactly one target selector:
  `targetParticipantId` for an opposing placed player character or
  `targetCombatantId` for an active placed DM-controlled combatant in the
  active encounter.
- Combatants at `hp.current === 0` are defeated. They remain visible in scene
  read models, are excluded from newly started encounters, and are rejected as
  attack targets.

### `POST /api/dm/command`

Mutating commands:

- `dm_set_character_current_hp`
- `dm_set_character_active_conditions`
- `dm_reposition_character_in_active_scene`
- `dm_set_current_turn_usage`
- `dm_set_current_turn_participant`
- `dm_end_active_encounter`
- `dm_create_combatant_in_active_scene`
- `dm_reposition_combatant_in_active_scene`
- `dm_set_combatant_current_hp`
- `dm_combatant_attack`

Notes:

- These are explicit DM controls, not a generic unsafe override surface.
- Condition tags are metadata only in the current runtime and do not apply rules
  effects.
- Monster/NPC combatants are a narrow MVP actor model, not full monster stat
  blocks. They support kind, name, HP, AC, speed, abilities, footprint, and
  active-scene position.
- `dm_create_combatant_in_active_scene`,
  `dm_reposition_combatant_in_active_scene`, and
  `dm_set_combatant_current_hp` return the authoritative updated scene.
- `dm_combatant_attack` is DM-only and currently supports a current-turn
  combatant making a fixed-damage melee attack against a placed player
  character target.
- A combatant with `hp.current === 0` cannot act through
  `dm_combatant_attack`; the current MVP treats that as the same turn-actor
  downed gate used elsewhere.
- `dm_set_current_turn_participant` accepts the existing `participantId` turn
  override and can also accept `combatantId` for a DM-controlled combatant turn.
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
- Character Library mutating commands are idempotency-cached under their own
  category. They are isolated from live runtime state; read/list library
  commands are intentionally uncached.

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
- Participant snapshots include `characterId` for authoritative assignment and
  `pendingCharacterId` for finalized characters submitted by players and
  awaiting DM assignment.
- `encounter_state` includes the current encounter snapshot.

Partial live updates:

- `movement_state` includes one participant/character placement or movement
  update.
- `character_state` includes authoritative HP and optional active condition
  tags for one character.

Transient events:

- `combat_event` reports attack resolution details, including roll, hit, damage,
  and target HP transition. Player-to-combatant and combatant-to-player attacks
  preserve existing fields and may also include optional attacker/target kind
  and combatant/character reference fields such as `targetCombatantId`.

## Recovery Guidance

SSE is live delivery only. The current architecture does not provide durable
event replay, stream cursors, or catch-up APIs.

After refresh or reconnect, clients should rebuild state with:

- `reconnect_session`
- `get_scene` when the recovered session has `activeSceneId`
- `get_active_scene_state`
- `get_encounter_state`
- `get_character` for assigned or locally known character IDs
- `get_character` for pending character IDs from the recovered session snapshot

The browser cockpit follows this model: SSE updates live state when connected,
and the Recover button rereads authoritative state through command read models.
Expected empty-read cases such as `no_active_scene` and `no_active_encounter`
are treated as recoverable local state, not failed recovery.

## Browser Runtime Surface

The role-aware runtime surface at `/runtime` uses this API surface directly. The
launcher supports DM mode and Player mode and renders a dark tactical tabletop
from server responses, read models, and live SSE events. DM mode can run a fresh
demo setup, seed the sample session, create/activate custom scenes, place and
edit passive scene entities/obstacles, author transition nodes, activate linked
destination scenes through those nodes, create and command narrow monster/NPC
combatants, operate mixed player/combatant encounter controls, and use explicit
DM override commands. Player mode can join or recover an existing session,
create/update/finalize its own draft character through the existing character
command endpoint, submit a finalized character for authoritative DM assignment,
see pending assignment state after recovery, read pending or assigned character
state, view active scene entities and visible transition markers after
recovery, move only its own token, use turn resources as itself, and attack
selected player or active non-defeated combatant targets. A readable
combat/event feed is primary; raw JSON remains available as secondary debug
detail.

The browser still treats the server as authoritative: grid, encounter,
character, and session state are rendered from command responses, read-model
recovery, or live SSE updates. Local Reset only clears browser state; it does not
delete backend sessions or runtime state.

## Known Limitations

- Development auth exists for the Character Library UI in DB mode, but there is
  no production authentication or account-security posture.
- No event replay, cursor, or durable catch-up API.
- No multi-process subscriber persistence or distributed coordination.
- No full adventure/campaign builder, automatic player-triggered transitions,
  traps/locks/scripts, fog of war, line of sight, or lighting.
- No opportunity attacks, reaction windows, full condition engine, death saves,
  spells, weapon system, ranged attacks, full monster stat blocks, or monster
  AI.
- Process-local SSE subscribers mean cold boot remains inert; unpublished
  outbox rows may remain stored, but the server does not auto-redeliver them on
  startup.
