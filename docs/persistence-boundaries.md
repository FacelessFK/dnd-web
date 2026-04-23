# Persistence Boundary And Transaction Design

This document started as the Phase 10 Slice 1 design pass. Later Phase 10
slices update it as the source of truth for the currently implemented durable
boundaries and remaining persistence gaps, without changing gameplay behavior.

## Current Boundary Audit

### `CharacterRepository`

Current interface:

- `createCharacter(record)`
- `getCharacter(characterId)`
- `saveCharacter(record)`

Persistence implications:

- Stores both canonical `character` data and runtime `overlay` data in one
  `StoredCharacterRecord`.
- Owns HP, AC, speed, abilities, character status, active conditions, footprint,
  and scene position.
- Is touched by character lifecycle, placement/movement, attacks, downed
  gating, and DM character-scoped controls.
- Is clone-safe today and should preserve value-object semantics in a durable
  implementation.

Durability notes:

- A database-backed implementation should persist `character` and `overlay`
  together in the first slice unless a schema design explicitly splits them.
- `saveCharacter` should remain an upsert-like update only for existing
  characters and should continue to fail for unknown character IDs.
- Durable characters alone still do not make the whole runtime restart-safe;
  session snapshots and scenes now have narrow durable baselines too, but
  encounters, stream delivery, replay, and broader live runtime continuity do
  not.
- After Slice 6, the narrow honest restart baseline is:
  - a restarted runtime can reread persisted character state through
    `get_character` when the same DB-backed character store is injected,
  - `reconnect_session` can also recover session membership when the DB-backed
    session store is injected,
  - `get_active_scene_state` can recover when the DB-backed scene store is
    injected too and character overlays still point into the active scene,
  - encounter continuity, stream delivery, and replay still do not survive
    restart.

### `SceneRepository`

Current interface:

- `createScene(scene)`
- `getScene(sceneId)`
- `saveScene(scene)`

Persistence implications:

- Owns scene definitions, grids, and placed scene entities.
- Does not own character positions; character active-scene positions live in
  `CharacterRepository` overlays.
- Scene activation lives in `InMemorySessionStore`, not `SceneRepository`.

Durability notes:

- Slice 6 implements the first durable scene baseline through a DB-backed
  scene store that preloads persisted scenes into fresh in-memory runtime state
  on startup.
- Persisted scenes can now survive restart when the same DB-backed scene store
  is injected.
- This improves restart-safe active-scene recovery only when paired with the
  already durable session snapshot and character boundaries.
- Encounter state, movement SSE continuity, and replay still do not survive
  restart.

### `EncounterRepository`

Current interface:

- `createEncounter(encounter)`
- `findEncounterBySession(sessionId)`
- `getEncounterBySession(sessionId)`
- `saveEncounter(encounter)`
- `endEncounter(encounter)`

Persistence implications:

- Enforces one active encounter per session by storing encounters keyed by
  `sessionId`.
- Does not preserve ended encounter history; `endEncounter` deletes the active
  encounter and returns the ended snapshot.
- Is touched by start encounter, turn advancement, turn usage, reactions,
  attack action consumption, encounter-aware movement, and DM encounter controls.

Durability notes:

- Slice 11.2 implements the first durable active-encounter baseline through a
  DB-backed active-encounter store that preloads persisted active encounters
  into fresh in-memory runtime state on startup.
- The DB-backed store enforces one active encounter per session durably through
  a unique `session_id` invariant.
- Encounter persistence is tightly coupled to session, character, and scene
  consistency:
  - encounter participants reference participant IDs and character IDs stored
    elsewhere,
  - `encounter.sceneId` must still line up with the durable active scene,
  - combat continuity is still not restart-safe without broader transaction and
    publication work.
- Ended encounters still disappear from future reads; durable encounter history
  remains deferred.

### `InMemorySessionStore`

Current responsibilities:

- Session creation, join, reconnect, presence, active scene, character
  assignment, revision increments, and SSE subscriber management.
- Publishes `session_state`, `movement_state`, `encounter_state`,
  `combat_event`, and `character_state`.

Persistence implications:

- Mixes durable-like session state with intentionally process-local connection
  state.
- Session revision increments currently apply only to session snapshot
  mutations: join, connect/disconnect, character assignment, and active scene
  activation.
- Movement, encounter, combat, and character-state broadcasts do not increment
  session revision.

Durability notes:

- A durable session boundary should separate persisted session/participant data
  from process-local SSE subscribers.
- Presence may remain ephemeral at first, but reconnect expectations must say
  which presence fields survive restart.
- Persisting sessions first would unlock stronger reconnect behavior, but it is
  broader than the character repository and requires carefully splitting
  subscriber state from snapshot state.
- Slice 5 implemented the first honest durable session baseline:
  - persisted session snapshots can survive restart when a DB-backed session
    store is injected,
  - `reconnect_session` can then recover durable session membership,
  - participant presence/subscriber state still resets to `disconnected`,
  - assigned character IDs and stored `activeSceneId` can survive only as
    persisted session snapshot references,
  - Slice 6 closes the scene-definition gap for that baseline when the
    DB-backed scene store is also injected,
  - encounter state and stream continuity still do not survive restart.

### `DbBackedSessionStore`

Current role:

- Loads persisted session snapshots from the DB-backed session snapshot
  boundary into fresh in-memory room state on startup.
- Keeps subscriber maps, connection presence, and live SSE broadcasting
  process-local.
- Persists session snapshot mutations for:
  - session creation,
  - player join,
  - character assignment,
  - active scene activation.

Durability notes:

- `reconnect_session` can succeed after restart when the DB-backed session store
  is injected because session identity and participant membership are durable.
- Participant `connectionStatus` and subscriber state still reset on restart.
- Stored `activeSceneId` can survive before the underlying scene definition
  does unless the DB-backed scene store is also injected.

### `DbBackedSceneStore`

Current role:

- Loads persisted scenes from the DB-backed scene record boundary into a fresh
  in-memory scene map on startup.
- Keeps runtime scene reads synchronous by serving them from that preloaded
  in-memory cache.
- Persists scene writes for:
  - scene creation,
  - scene entity placement,
  - any future scene saves routed through the existing scene repository
    boundary.

Durability notes:

- `get_scene` can succeed after restart when the DB-backed scene store is
  injected.
- `activate_scene_for_session` can reference a persisted scene after restart
  when the DB-backed session snapshot store is also injected.
- `get_active_scene_state` can succeed after restart only when:
  - the session snapshot survives and still points at the active scene,
  - the scene definition survives,
  - character overlays survive with valid active-scene placement.
- This is still read-model recovery, not replay. Encounter state, stream
  delivery, and tactical event continuity remain non-durable.

### `DbBackedEncounterStore`

Current role:

- Loads persisted active encounters from the DB-backed encounter record
  boundary into a fresh in-memory encounter map on startup.
- Keeps runtime encounter reads synchronous by serving them from that preloaded
  in-memory cache.
- Persists active encounter writes for:
  - encounter creation,
  - encounter save/update,
  - active encounter end/delete.

Durability notes:

- `get_encounter_state` can succeed after restart when the DB-backed active
  encounter store is injected and durable session, scene, and character state
  still line up.
- The first durable invariant is now enforced in the DB boundary:
  - at most one active encounter per session.
- Encounter end still preserves current behavior:
  - the runtime may build and publish a final ended snapshot,
  - the active encounter then disappears from future reads,
  - durable encounter history is still out of scope.
- This remains read-model recovery, not replay. Encounter continuity beyond the
  reread boundary, missed event delivery, and outbox guarantees are still
  non-durable.

### `CommandIdempotencyStore`

Current interface:

- `getCachedSuccess(params)`
- `cacheSuccess(params)`

Current key shape:

- command category,
- command type,
- command ID,
- actor participant ID,
- session ID when present.

Persistence implications:

- The current store caches only successful mutating command responses.
- Failed command responses are not cached.
- Read commands are intentionally not idempotency-cached.
- Fingerprint conflicts throw `command_id_conflict` before runtime mutation.

Durability notes:

- A durable implementation should keep the same key/fingerprint behavior.
- Success records must be written in the same real transaction as the command's
  durable state mutation.
- Durable idempotency should not be implemented as a separate post-commit cache
  because that can record success without the state mutation, or mutate state
  without recording the successful response.

## Transaction Boundary Audit

| Flow                       | Stores touched                                                                              | SSE publication                                                                      | Boundary type                                            | Main risk today                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Attack resolution          | Session read, character read/write on hit, encounter read/write                             | `encounter_state` after encounter save, then `combat_event`                          | Multi-store mutation plus event publication              | Target HP can save while encounter action usage or either event publication fails.                                                              |
| Encounter-aware movement   | Session read, scene read, character read/write, encounter read/write when movement cost > 0 | `encounter_state` after encounter save when movement is spent, then `movement_state` | Multi-store mutation plus event publication              | Character position can save while encounter movement usage or event publication fails.                                                          |
| DM HP override             | Session read, character read/write                                                          | `character_state` after character save                                               | Store plus event publication                             | HP can save while `character_state` publication fails.                                                                                          |
| DM condition-tag editing   | Session read, character read/write                                                          | `character_state` after character save                                               | Store plus event publication                             | Conditions can save while `character_state` publication fails.                                                                                  |
| DM active-scene reposition | Session read, scene read, character read/write                                              | `movement_state` after character save                                                | Store plus event publication                             | Position can save while movement publication fails.                                                                                             |
| DM turn usage override     | Session read, encounter read/write                                                          | `encounter_state` after encounter save                                               | Store plus event publication                             | Encounter usage can save while encounter publication fails.                                                                                     |
| DM current-turn override   | Session read, encounter read/write                                                          | `encounter_state` after encounter save                                               | Store plus event publication                             | Current turn can save while encounter publication fails.                                                                                        |
| DM encounter end           | Session read, encounter read/delete active                                                  | final `encounter_state` after active encounter is cleared                            | Store plus event publication                             | Active encounter can be cleared while final ended-state publication fails.                                                                      |
| Character assignment       | Session read, character read, session mutation                                              | `session_state` inside session store mutation                                        | Cross-store validation plus session mutation/event       | Session assignment can update after character validation; if publication fails, assignment remains mutated without replay.                      |
| Scene activation           | Session read/write, scene read                                                              | `session_state` inside session store mutation                                        | Cross-store validation plus session mutation/event       | Active scene can update after scene validation; if publication fails, active scene remains changed without replay.                              |
| Encounter start            | Session read, scene read, character reads, encounter create                                 | `encounter_state` after encounter create                                             | Store plus event publication with cross-store validation | Encounter can be created while publication fails, or active-scene/character state can change between validation and create in a durable future. |

## First Durable Repository Recommendation

Recommended first target: `CharacterRepository`.

Why:

- It is central to the most important current gameplay state:
  - HP,
  - downed gating,
  - attack damage,
  - active-scene position,
  - condition tags,
  - DM HP and condition overrides.
- Its interface is small and already repository-shaped.
- It can be implemented and tested without changing public command or SSE
  schemas.
- It gives the next slice meaningful durability without forcing a full session,
  encounter, or event-store redesign.

Tradeoffs at the time of Slice 1:

- Durable characters alone would not have made the whole runtime restart-safe
  because sessions, assignments, active scene, encounters, and idempotency were
  still in-memory.
- Character overlays currently contain active-scene position and active
  conditions; persisting characters means persisting some runtime overlay state
  earlier than session/encounter state.
- Multi-store flows like attack still need real transactions later because
  attack touches both character and encounter state.

Why not `InMemorySessionStore` first at the time of Slice 1:

- It mixes durable session/participant data with process-local subscriber state.
- It needs a design split before a clean repository replacement.
- It is more important for restart-safe reconnect, but broader and riskier as a
  first DB slice.

Why not `EncounterRepository` first at the time of Slice 1:

- Encounters reference session participants and character IDs.
- Durable encounters without durable sessions/assignments/characters can create
  unrecoverable state after restart.
- Attack and movement need encounter transactions with character updates, so
  encounter durability is best after at least one durable entity repository
  exists.

Why not `SceneRepository` first at the time of Slice 1:

- Scenes are a clean persistence target, but less connected to current combat
  reliability.
- Persisting scenes first would not have preserved HP, positions, downed state,
  assignments, active scene, or encounter state.

Why not durable idempotency first at the time of Slice 1:

- Durable idempotency is valuable only when it can be committed with the
  durable state mutation it protects.
- Implementing it before any durable domain repository risks durable command
  records that do not correspond to durable game state.

## Durable Idempotency Placement

Durable idempotency should live at the server command boundary, after protocol
parsing and before runtime mutation, but it must participate in the same real
database transaction as the durable mutation.

Slice 3 implemented the first storage boundary:

- `completed_command_idempotency_records` stores successful command responses by
  the existing deterministic key and stable fingerprint.
- The server idempotency interface is awaitable, so a DB-backed store can be
  injected without changing HTTP routes, protocol schemas, response shapes, SSE
  shapes, or gameplay behavior.
- The default local server path still uses `InMemoryCommandIdempotencyStore`.
- The DB-backed store persists only character-record mutation command types by
  default:
  - `create_character`,
  - `update_character`,
  - `finalize_character`,
  - `dm_set_character_current_hp`,
  - `dm_set_character_active_conditions`.
- Unsupported command types use an in-memory fallback because their underlying
  session, scene, encounter, assignment, movement, or stream state is still
  non-durable.
- The follow-up transactional boundary adds `DndDatabaseUnitOfWork` and
  `DbBackedCharacterCommandTransactionBoundary` so supported character-mutation
  commands can perform idempotency lookup/conflict check, character write, and
  successful idempotency response write in one database transaction.
- For supported transactional DM character updates, `character_state` SSE is
  buffered during the transaction and published only after commit.

This means Slice 3 provides a real durable idempotency boundary, but not a full
restart-safe guarantee for the entire command surface.

Recommended future flow for fully durable mutating commands:

1. Parse and validate the command body with the existing protocol schema.
2. Determine whether the command is mutating. Read commands remain uncached.
3. Build the idempotency key and stable command fingerprint from the parsed
   command.
4. Start a database transaction or unit-of-work for commands with durable
   mutations.
5. Within the transaction, check the idempotency record:
   - if the same key/fingerprint has a successful cached response, return that
     response without runtime mutation or SSE publication,
   - if the same key has a different fingerprint, reject with
     `command_id_conflict`,
   - if there is no record, continue.
6. Execute runtime mutation using transaction-bound repositories.
7. Build the success response.
8. Persist the successful idempotency record in the same transaction as the
   domain state mutation.
9. If an outbox exists, persist outbound event records in the same transaction.
10. Commit.
11. Publish SSE only after commit.
12. Send the success response.

Rules:

- Do not cache failed command responses in this phase.
- Do not write a successful idempotency record before the domain mutation
  commits.
- Do not publish SSE before the durable transaction commits.
- Duplicate successful retries should not publish new SSE events.
- Until an outbox exists, publication failure after commit remains a known risk.
- Until durable session/scene/encounter repositories exist, do not widen durable
  idempotency to those command types.

## Outbox Recommendation

For Slice 2, use an outbox-ready design but do not implement an outbox table
unless the slice wires DB-backed repositories into live multi-store command
paths.

Reasoning:

- A first DB character adapter can be implemented and tested without claiming
  durable event delivery.
- The existing runtime-facing `CharacterRepository` is synchronous, while real
  Drizzle/Postgres access is async. If Slice 2 does not introduce a runtime
  async boundary, it should be treated as persistence groundwork rather than
  completed end-to-end durable runtime integration.
- Slice 2B resolved that mismatch by adding an internal awaitable runtime
  character repository boundary while preserving public HTTP/protocol/SSE
  behavior.
- Adding an outbox before the first durable repository would be mostly
  speculative.
- However, the design should not pretend SSE publication is transactional.

Recommended sequence:

1. Slice 2: implement the first DB-backed repository groundwork with tests.
2. Slice 2B: wire the live runtime to an async character repository boundary
   without changing public API behavior.
3. Slice 3: implement durable command idempotency once it can commit with real
   durable state changes.
4. Add an outbox soon after any production path depends on durable writes plus
   reliable SSE publication.

Outbox should eventually cover:

- `session_state`,
- `movement_state`,
- `encounter_state`,
- `combat_event`,
- `character_state`.

Replay remains deferred. An outbox can support reliable publication without
exposing a client replay/cursor contract yet.

## Current Durable Baseline After Phase 11 Slice 2

With DB-backed stores injected, the current narrow restart-safe read-model
baseline is:

- character records can be reread through `get_character`,
- session membership and stored `activeSceneId` can be reread through
  `reconnect_session`,
- scene definitions can be reread through `get_scene`,
- active encounters can be reread through `get_encounter_state`,
- `get_active_scene_state` can recover only when those three persisted
  boundaries line up and character overlays already contain valid active-scene
  placement,
- `get_encounter_state` can recover only when durable session, character,
  scene, and active encounter state all line up.

This is still not full runtime durability. Encounter state, movement live
continuity, stream delivery, replay/catch-up semantics, and outbox guarantees
remain out of scope.

## Durable Encounter Boundary Recommendation

Phase 11 Slice 2 implements the first DB-backed active-encounter boundary.

Recommended minimal durable encounter state:

- encounter identity,
- owning session ID,
- active scene ID,
- participants,
- initiative/order,
- current turn index,
- round number,
- current turn usage,
- encounter status,
- created/updated timestamps.

Implemented durable semantics for the first encounter slice:

- durably enforce at most one active encounter per session,
- keep ended encounters non-historical to preserve current behavior,
- allow the runtime to construct and publish a final ended snapshot before the
  active encounter disappears from future reads,
- defer durable encounter history until a later dedicated slice.

Cross-store consistency risks that a durable encounter slice must respect:

- `session_snapshots`
  - `encounter.sessionId` must match durable session identity,
  - participant IDs must still belong to the session,
  - `session.activeSceneId` must still match `encounter.sceneId` for
    `get_encounter_state` to remain coherent.
- `character_records`
  - encounter participants reference character IDs owned elsewhere,
  - downed gating depends on durable character HP,
  - attack and encounter-aware movement already mutate both character and
    encounter state.
- `scene_records`
  - `encounter.sceneId` must still reference a durable scene definition,
  - start and read flows still depend on the active scene grid and entity
    layout.

Honest restart expectations for the current DB-backed active encounter slice:

- `get_encounter_state` can become rereadable after restart only when durable
  session, character, scene, and encounter boundaries all remain coherent.
- This still would not restore:
  - SSE subscribers,
  - missed `encounter_state`,
  - missed `movement_state`,
  - missed `combat_event`,
  - replay/catch-up semantics,
  - outbox-backed publication guarantees.

Transaction and publication implications after the first encounter slice:

- `start_encounter`
  - currently validates session, active scene, and placed characters before the
    encounter write,
  - a durable slice can persist the encounter itself, but broader atomicity with
    session/character state still remains a later decision.
- `advance_turn`, `use_action`, `use_bonus_action`, `use_reaction`,
  `record_movement_usage`, `dm_set_current_turn_usage`,
  `dm_set_current_turn_participant`
  - these are encounter-local writes once a durable active encounter exists,
    but SSE publication still remains post-write without an outbox.
- `dm_end_active_encounter`
  - should preserve current behavior in the first durable slice by publishing a
    final ended snapshot and then removing the active encounter from future
    reads.
- `attack`
  - still spans character HP mutation, encounter action usage, and both
    `encounter_state` plus `combat_event` publication,
  - it should not be treated as restart-safe combat continuity until a later
    cross-store transaction/outbox design exists.
- encounter-aware movement
  - still spans character position mutation, encounter movement usage, and both
    `encounter_state` plus `movement_state` publication,
  - it should not be treated as fully durable live tactical continuity yet.

## Remaining Atomicity Gaps

- Character assignment still validates durable character state and then writes
  the durable session snapshot without a single cross-store transaction.
- Scene activation still validates the scene and then writes the durable
  session snapshot without a single cross-store transaction.
- Scene writes are durable, but scene commands still use the non-durable
  idempotency path.
- Encounter writes are now durable, but encounter commands still use the
  non-durable idempotency path.
- Attack resolution and encounter-aware movement still span character,
  encounter, session, and event publication boundaries that are not jointly
  durable.
- Encounter start, turn advancement, turn usage, current-turn overrides, and
  encounter end now operate on durable active-encounter state when the
  DB-backed encounter store is injected, but they still are not transactionally
  coupled to other stores or outboxed publication.
- Outside the supported transactional DM character update path, SSE publication
  is still post-write and non-outboxed.

## Visible Persistence Technical Debt

- The runtime intentionally preserves stable public HTTP behavior by allowing
  some internal runtime methods to return a Promise on injected DB-backed paths
  even though their signatures read like synchronous values in many call sites.
- Narrow persistence invariants are duplicated today:
  - row keys plus IDs inside JSON documents,
  - `session_id` / `scene_id` columns plus `session.id`, `scene.sessionId`, or
    `encounter.sessionId` / `encounter.sceneId` inside persisted payloads.
- The DB-backed session, scene, and active-encounter stores currently preload
  durable records into fresh in-memory runtime maps on startup to keep live
  read paths synchronous. That is a valid narrow baseline, but it is not yet a
  full repository/runtime redesign.

## Slice 2 Result

Completed target:

- Implement DB-backed character storage while keeping `InMemoryCharacterStore`
  available.

Completed expectations:

- Add the minimal schema for `StoredCharacterRecord`.
- Preserve public HTTP/protocol/SSE behavior.
- Resolve the sync/async character repository mismatch before claiming live
  runtime integration.
- Add repository tests for create, get, save, missing character errors, and
  clone/value semantics.
- Keep runtime command behavior unchanged.
- Do not add event replay, durable idempotency, or broad DB wiring in the same
  slice.

## Next Slice Recommendation

The next encounter persistence slice should be an **encounter transaction
boundary design** pass before any attempt at restart-safe combat continuity,
outbox delivery, or replay semantics.
