# Persistence Boundary And Transaction Design

This document started as the Phase 10 Slice 1 design pass. Later Phase 10
slices update it as the source of truth for the currently implemented durable
boundaries and remaining persistence gaps, without changing gameplay behavior.

For the product/domain separation between reusable Character Library entries
and live runtime overlays, see `docs/domain/DOMAIN_MODEL.md` and
`docs/decisions/0005-character-library-runtime-bridge.md`. This document
describes persistence reality; the current bridge copies reusable library
entries into separate runtime characters and does not make library entries live
overlays.

## Current Boundary Audit

### `CharacterLibraryEntryDatabase`

Current interface:

- `insertCharacterLibraryEntry(write)`
- `getCharacterLibraryEntry({ entryId, ownerParticipantId })`
- `getCharacterLibraryEntryByUser({ entryId, ownerUserId })`
- `listCharacterLibraryEntries(ownerParticipantId)`
- `listCharacterLibraryEntriesByUser(ownerUserId)`
- `updateCharacterLibraryEntry(write)`
- `updateCharacterLibraryEntryByUser(write)`

Persistence implications:

- Stores reusable Character Library entries separately from live runtime
  character overlays in the `character_library_entries` table.
- Stores the whole builder/library document as JSONB plus durable owner,
  created, and updated columns.
- Uses `ownerUserId` for authenticated DB-mode ownership while retaining
  `ownerParticipantId` for protocol/backward compatibility and explicit
  no-auth in-memory/dev paths. The character library command route requires the
  authenticated user ID to match the command actor and payload owner when auth
  is injected.
- Uploaded portraits are validated by MIME type and size, then stored as data
  URL references in the library document for the MVP. There is no cloud object
  storage or full asset pipeline in this slice.

Durability notes:

- `SERVER_PERSISTENCE_MODE=db` with a valid `DATABASE_URL` wires the Character
  Library service to the Drizzle/Postgres adapter.
- The default in-memory server path still exists for local development and
  tests.
- Mutating Character Library commands use the normal command idempotency store
  category. In DB mode their idempotency success rows are durable.
- Finalized library entries remain reusable records. The runtime bridge command
  can copy one into a separate runtime character and pending assignment, but
  that live state is not stored back on the library entry.
- In DB mode, `submit_character_library_entry_for_assignment` uses the
  DB-backed session command transaction boundary when it is injected. The
  library-entry read, runtime character-copy creation, session pending
  assignment, durable idempotency success, and one `session_state` outbox row
  commit in the same unit of work. Dispatch remains a post-commit,
  process-local SSE action with no replay/cursor/catch-up guarantee.

### `AuthUserDatabase`

Current interface:

- `createAuthUser(insert)`
- `getAuthUserByEmail(email)`
- `createAuthSession(insert)`
- `getAuthUserBySessionTokenHash(tokenHash, now)`
- `revokeAuthSession(tokenHash)`

Persistence implications:

- `auth_users` stores normalized email, display name, a password hash, and
  timestamps. Password plaintext is never stored.
- `auth_sessions` stores only a hash of the high-entropy opaque session token.
  The raw token is sent only in the `dnd_web_session` HttpOnly cookie.
- Logout revokes the current row with `revoked=true` and `revoked_at`.
- Cookie protection is `HttpOnly`, `SameSite=Lax`, `Path=/`, bounded
  expiry/max-age, and `Secure` in production or when explicitly configured.

Durability notes:

- Auth requires DB-mode injection for the browser Character Library. In-memory
  test fakes exist, but they are not durable.
- CSRF protection is limited to `SameSite=Lax` in this MVP; there is no
  dedicated CSRF token yet.

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
- After Phase 11 Slice 7, the implemented narrow restart baseline is still:
  - a restarted runtime can reread persisted character state through
    `get_character` when the same DB-backed character store is injected,
  - `reconnect_session` can also recover session membership when the DB-backed
    session store is injected,
  - `get_active_scene_state` can recover when the DB-backed scene store is
    injected too and character overlays still point into the active scene,
  - `get_encounter_state` can recover when the DB-backed active-encounter
    store is injected too and durable session, character, and scene state still
    line up,
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
- Encounter rereads still require the DB-backed active-encounter store too.
- Movement SSE continuity and replay still do not survive restart.

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

- Phase 11 Slice 2 implements the first durable active-encounter baseline through a
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
  - Phase 11 Slice 2 closes the active-encounter reread gap for that baseline when
    the DB-backed active-encounter store is also injected,
  - encounter continuity and stream continuity still do not survive restart.

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
  - passive scene entity update,
  - passive scene entity reposition,
  - passive scene entity delete,
  - scene transition create,
  - scene transition update,
  - scene transition delete,
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
- Phase 11 Slice 4 now refreshes the live DB-backed encounter cache from the
  committed transaction state for supported encounter-only commands so future
  reads in the same runtime reflect the durable write/delete.
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

| Flow                                     | Stores touched                                                                              | SSE publication                                                                      | Boundary type                                            | Main risk today                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Attack resolution                        | Session read, character read/write on hit, encounter read/write                             | `encounter_state` after encounter save, then `combat_event`                          | Multi-store mutation plus event publication              | Target HP can save while encounter action usage or either event publication fails.                                                              |
| Encounter-aware movement                 | Session read, scene read, character read/write, encounter read/write when movement cost > 0 | `encounter_state` after encounter save when movement is spent, then `movement_state` | Multi-store mutation plus event publication              | Character position can save while encounter movement usage or event publication fails.                                                          |
| DM HP override                           | Session read, character read/write                                                          | `character_state` after character save                                               | Store plus event publication                             | HP can save while `character_state` publication fails.                                                                                          |
| DM condition-tag editing                 | Session read, character read/write                                                          | `character_state` after character save                                               | Store plus event publication                             | Conditions can save while `character_state` publication fails.                                                                                  |
| DM active-scene reposition               | Session read, scene read, character read/write                                              | `movement_state` after character save                                                | Store plus event publication                             | Position can save while movement publication fails.                                                                                             |
| DM turn usage override                   | Session read, encounter read/write                                                          | `encounter_state` after encounter save                                               | Store plus event publication                             | Encounter usage can save while encounter publication fails.                                                                                     |
| DM current-turn override                 | Session read, encounter read/write                                                          | `encounter_state` after encounter save                                               | Store plus event publication                             | Current turn can save while encounter publication fails.                                                                                        |
| DM encounter end                         | Session read, encounter read/delete active                                                  | final `encounter_state` after active encounter is cleared                            | Store plus event publication                             | Active encounter can be cleared while final ended-state publication fails.                                                                      |
| Character assignment                     | Session read, character read, session mutation                                              | `session_state` inside session store mutation                                        | Cross-store validation plus session mutation/event       | Session assignment can update after character validation; if publication fails, assignment remains mutated without replay.                      |
| Scene activation / transition activation | Session read/write, scene read                                                              | `session_state` inside session store mutation                                        | Cross-store validation plus session mutation/event       | Active scene can update after scene or transition validation; if publication fails, active scene remains changed without replay.                |
| Encounter start                          | Session read, scene read, character reads, encounter create                                 | `encounter_state` after encounter create                                             | Store plus event publication with cross-store validation | Encounter can be created while publication fails, or active-scene/character state can change between validation and create in a durable future. |

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

## Current Durable Baseline After Phase 11 Slice 7

With DB-backed stores injected, the current narrow restart-safe read-model
baseline is:

- character records can be reread through `get_character`,
- session membership and stored `activeSceneId` can be reread through
  `reconnect_session`,
- scene definitions can be reread through `get_scene`,
- active encounters can be reread through `get_encounter_state`,
- supported encounter-only mutations can commit durable encounter state and a
  durable completed-command success record atomically through the encounter
  transaction boundary,
- supported injected-path `attack` commands can commit target character HP or
  target scene-combatant HP, active encounter usage, and a durable
  completed-command success record atomically through the cross-store combat
  transaction boundary,
- supported injected-path `move_character_in_active_scene` commands can now do
  the same only for the narrow branch that both:
  - moves the character, and
  - spends active-encounter movement usage,
- zero-cost encounter movement and no-active-encounter movement still stay on
  the existing non-transactional path intentionally,
- `get_active_scene_state` can recover only when those three persisted
  boundaries line up and character overlays already contain valid active-scene
  placement,
- `get_encounter_state` can recover only when durable session, character,
  scene, and active encounter state all line up.

This is still not full runtime durability. Encounter state, movement live
continuity, stream delivery, replay/catch-up semantics, and outbox guarantees
remain out of scope.

## Encounter-Only Transactional Baseline After Phase 11 Slice 4

Phase 11 Slice 4 implements the first encounter-only transactional durability
baseline.

Supported transactional encounter commands:

- `start_encounter`
- `advance_turn`
- `use_action`
- `use_bonus_action`
- `use_reaction`
- `record_movement_usage`
- `dm_set_current_turn_usage`
- `dm_set_current_turn_participant`
- `dm_end_active_encounter`

Implemented transactional semantics:

- the server command boundary now performs durable idempotency
  lookup/conflict check, durable encounter create/save/delete, and durable
  completed-command success record insert in one real DB transaction,
- `encounter_state` is buffered during the transaction and published only after
  commit,
- duplicate successful retries return the cached durable success response
  without rerunning the supported encounter mutation or republishing
  `encounter_state`,
- `dm_end_active_encounter` still preserves the current ended-encounter
  behavior intentionally:
  - the runtime can return and publish a final ended snapshot,
  - the active encounter then disappears from future reads,
  - durable encounter history remains deferred.

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
  - now has a cross-store transactional baseline on the injected DB-backed
    path,
  - but it still should not be treated as restart-safe combat continuity
    because publication remains best-effort without an outbox.
- encounter-aware movement
  - now has a cross-store transactional baseline only for the movement-spending
    active-encounter branch of `move_character_in_active_scene`,
  - zero-cost encounter movement and no-active-encounter movement still remain
    on the existing path,
  - it still should not be treated as fully durable live tactical continuity
    because publication remains best-effort and the whole movement command is
    not uniformly transactional.

## Encounter Transaction-Boundary Matrix

| Flow                                                            | Stores read or validated today                                                                                                   | Stores written today                                                            | Publication today                                 | Classification                                                    | Current non-atomic gap                                                                                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start_encounter`                                               | session snapshot, scene, character records via active-scene placement and participant build                                      | active encounter                                                                | `encounter_state`                                 | cross-store validation plus encounter-only durable write plus SSE | supported transactional path now commits encounter create plus durable idempotency atomically, but validation still happens before the write and publication remains post-commit                        |
| `advance_turn`                                                  | session snapshot, scene, active encounter, character records via `get_encounter_state` placement validation                      | active encounter                                                                | `encounter_state`                                 | encounter-only durable write after cross-store validation reads   | supported transactional path now commits encounter write plus durable idempotency atomically, but validation reads remain outside the write and publication remains post-commit                         |
| `use_action` / `use_bonus_action` / `use_reaction`              | session snapshot, scene, active encounter, character records via current-turn validation                                         | active encounter                                                                | `encounter_state`                                 | encounter-only durable write after cross-store validation reads   | same as above; supported transactional path covers encounter write plus durable idempotency, but validation and publication are still outside one durable boundary                                      |
| `record_movement_usage`                                         | session snapshot, scene, active encounter, current-turn character record for speed, character placement validation               | active encounter                                                                | `encounter_state`                                 | encounter-only durable write after cross-store validation reads   | supported transactional path covers the encounter write plus durable idempotency, but validation depends on character/session/scene reads outside the write and publication remains post-commit         |
| `dm_set_current_turn_usage` / `dm_set_current_turn_participant` | session snapshot, scene, active encounter, character placement validation through `get_encounter_state`                          | active encounter                                                                | `encounter_state`                                 | encounter-only durable write after cross-store validation reads   | supported transactional path covers encounter mutation plus durable idempotency, but validation reads and publication are not in one durable boundary                                                   |
| `dm_end_active_encounter`                                       | session snapshot, active encounter                                                                                               | delete active encounter                                                         | final `encounter_state` ended snapshot            | encounter-only durable delete plus SSE                            | supported transactional path covers delete plus durable idempotency, but the final ended snapshot is still best-effort post-commit without an outbox                                                    |
| `attack`                                                        | session snapshot, scene, active encounter, attacker record, target character/combatant record, active-scene placement validation | target character HP or target scene-combatant HP on hit, active encounter usage | `encounter_state`, then `combat_event`            | cross-store write plus multi-event publication                    | supported transactional path now commits target HP, encounter usage, and durable idempotency atomically, but publication is still best-effort post-commit without an outbox                             |
| encounter-aware movement                                        | session snapshot, scene, moving character record, all placed character records for occupancy, optional active encounter          | moving character position, optional active encounter usage                      | optional `encounter_state`, then `movement_state` | cross-store write plus multi-event publication                    | supported transactional path now commits the movement-spending active-encounter branch atomically, but zero-cost/no-encounter movement still use the existing path and publication is still best-effort |

## Transaction Slice Result

Phase 11 Slice 4 completed the first honest transactional encounter slice.

Why this was the right first transactional target:

- the durable active-encounter repository already existed,
- these commands mutate only encounter state, even though they still validate
  against session/scene/character reads first,
- they could gain a real DB transaction plus durable idempotency value without
  pretending `attack` or encounter-aware movement were solved.

What still stays deferred:

- `attack`
- encounter-aware movement

because those flows still need a real cross-store transaction boundary.

## Durable Encounter Idempotency Result

Durable idempotency is now implemented for the supported encounter-only
transactional commands because the server can write both:

- the durable encounter mutation, and
- the successful completed-command record

in the same real DB transaction.

It still stays deferred for the cross-store combat commands in this section
because they are tracked separately below.

## Outbox Recommendation For Encounter Work

Outbox/publication work is still deferrable immediately after the first
encounter-only transactional slice.

Why it can stay deferred one more slice:

- `encounter_state` remains a rereadable snapshot through `get_encounter_state`,
- the current product/runtime already accepts post-commit publication risk in
  exchange for read-model recovery,
- adding a transaction plus durable idempotency for encounter-only commands is
  still useful even before reliable stream delivery exists.

When outbox work stops being easy to defer:

- when ordered reliable delivery of `encounter_state`, `movement_state`, and
  `combat_event` becomes a product requirement,
- when the final ended snapshot from `dm_end_active_encounter` must be
  delivered reliably instead of being only best-effort post-commit.

## Cross-Store Combat Transactional Baseline After Phase 11 Slice 7

Phase 11 Slice 7 extends the cross-store combat transaction baseline to cover
the next narrow honest branch after `attack`.

Supported transactional cross-store combat commands:

- `attack`,
- `move_character_in_active_scene` only when:
  - the command resolves an active encounter, and
  - movement usage is actually spent.

Cross-store movement branches that still remain intentionally out of scope:

- zero-cost encounter movement,
- no-active-encounter movement,
- replay, outbox, and reliable catch-up semantics.

Implemented transactional combat semantics:

- the shared server command boundary now performs durable idempotency
  lookup/conflict check, the covered character write, the covered
  active-encounter write, and durable completed-command success record insert in
  one real DB transaction,
- `attack` still publishes `encounter_state` then `combat_event` only after
  commit,
- covered encounter-aware movement now publishes `encounter_state` then
  `movement_state` only after commit,
- duplicate successful retries return the cached durable success response
  without rerunning mutation or republishing buffered events,
- the runtime still reuses one shared character+encounter transaction shape
  rather than creating one-off attack and movement primitives.

## Cross-Store Combat Transaction-Boundary Matrix

| Flow                     | Current read/write/publication sequence                                                                                                                                                                                                                                   | Stores that must commit in one real transaction                                                                                 | Pre-transaction reads that can stay outside the first slice                                                                                                                                             | Invariants that become unsafe unless revalidated inside the transaction                                                                                                                                                                                                                                                          | Post-commit risk if outbox stays deferred                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `attack`                 | session snapshot read -> active scene read -> active encounter read/validation -> attacker and target character/combatant reads -> roll/damage resolution -> target HP write on hit -> encounter usage write -> `encounter_state` -> `combat_event`                       | `character_records`, `scene_records` for combatant targets, `active_encounter_records`, `completed_command_idempotency_records` | command parsing, idempotency-key construction, initial session membership lookup, active-scene definition/grid lookup, other read-model inputs that can be checked again against transaction-local rows | current-turn ownership and turn-usage state, target HP/downed-or-defeated state, attacker and target placement in the active scene, encounter/session/scene identity alignment, target still being a valid encounter participant                                                                                                 | supported transactional path now commits state and durable idempotency atomically, but clients can still miss post-commit `encounter_state`, `combat_event`, or both because publication is still best-effort without an outbox            |
| encounter-aware movement | session snapshot read -> active scene read -> moving character read -> all blocking placement reads -> optional active encounter read/validation -> character position write -> optional encounter movement-usage write -> optional `encounter_state` -> `movement_state` | `character_records`, optional `active_encounter_records`, `completed_command_idempotency_records`                               | command parsing, idempotency-key construction, initial session membership lookup, active-scene definition/grid lookup, other read-model inputs that can be checked again against transaction-local rows | moving-character origin placement, current speed allowance, current-turn ownership when movement usage is spent, actor consciousness/downed state when encounter movement usage is spent, occupancy/blocking placements used for destination validation, encounter/session/scene identity alignment when movement usage is spent | the movement-spending active-encounter branch now commits atomically with durable idempotency, but zero-cost/no-encounter movement still use the existing path and clients can still miss post-commit `encounter_state` / `movement_state` |

## Cross-Store Combat Transaction Result

Phase 11 Slice 7 completes the next recommended cross-store target:

- `attack`,
- plus the movement-spending encounter-aware branch of
  `move_character_in_active_scene`,
- both built on the same reusable character+encounter transaction shape.

What the shared transaction shape now proves:

- the underlying transaction primitive is reusable across both combat flows,
- cross-store durable idempotency can stay narrow and honest by covering only
  the branches whose state mutation can truly commit in one real DB
  transaction,
- movement needed narrower branch coverage than `attack`:
  - the movement-spending active-encounter branch is now transactional,
  - zero-cost encounter movement and no-active-encounter movement still stay on
    the existing path intentionally.

## Durable Idempotency Result For Cross-Store Combat

Durable idempotency is now implemented for:

- `attack`,
- the movement-spending active-encounter branch of
  `move_character_in_active_scene`.

That means the server can now commit, in one real DB transaction:

- durable idempotency lookup/conflict check,
- the covered character write,
- the covered active-encounter write,
- durable completed-command success record insert.

Durable idempotency still stays deferred for movement branches that remain on
the existing path:

- zero-cost encounter movement,
- no-active-encounter movement.

## Outbox Recommendation For Cross-Store Combat

Outbox work can still stay deferred one more slice after the new movement-aware
cross-store baseline if the runtime only claims:

- atomic durable combat state for the covered command branch,
- durable completed-command idempotency,
- best-effort post-commit event publication.

Exact risks that remain if outbox is still deferred for `attack`:

- committed target HP loss and committed encounter action usage can survive
  even if clients miss `encounter_state`,
- clients can miss `combat_event` entirely and still see the mutated state only
  through rereads,
- clients can observe `encounter_state` without `combat_event`, or vice versa,
  because post-commit publication is still best-effort,
- duplicate retries served from the durable idempotency cache will not
  republish missed transient events.

Exact risks that remain if outbox is still deferred for the covered movement
branch:

- committed position and committed encounter movement usage can survive even if
  clients miss `movement_state`,
- clients can miss `encounter_state` and `movement_state` independently,
- duplicate retries served from durable idempotency will not republish those
  missed updates.

The point where outbox work stops being easy to defer is:

- when `attack` needs reliable `combat_event` delivery rather than state-only
  reread recovery,
- when encounter-aware movement needs reliable ordered delivery of
  `encounter_state` followed by `movement_state`,
- when product requirements treat the transient event stream as part of the
  guaranteed combat record rather than best-effort UX.

## Remaining Atomicity Gaps

- Covered character assignment and player submit-for-assignment commands now
  validate durable character or library state and write the durable session
  snapshot through the DB-backed session transaction boundary when that boundary
  is injected.
- Scene activation still validates the scene and then writes the durable
  session snapshot without a single cross-store transaction.
- Supported scene-only writes now use the DB-backed scene transaction boundary
  for durable idempotency plus durable scene mutation when that boundary is
  injected.
- Supported encounter-only commands now have transactional durable idempotency,
  `attack` now has a cross-store transactional durable idempotency path, and
  the movement-spending encounter-aware branch now does too.
- Zero-cost encounter movement and no-active-encounter movement still do not
  have a cross-store transactional durable idempotency path.
- Even for the covered cross-store combat flows, publication is still
  post-commit and non-outboxed.
- Encounter start, turn advancement, turn usage, current-turn overrides, and
  encounter end now operate on durable active-encounter state with
  transactional durable idempotency when the DB-backed encounter store and
  encounter transaction boundary are injected, but they still are not
  transactionally coupled to other stores or outboxed publication.
- Outside the supported transactional DM character update path, supported
  encounter-only path, and the covered transactional cross-store combat paths,
  SSE publication is still post-write and non-outboxed.

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

The next encounter persistence slice should be a **persistence exit pass** that
closes the initial durable encounter foundation honestly:

- confirm the implemented DB-backed repository and transactional boundaries are
  described consistently,
- make the still-non-durable event-delivery and replay gaps explicit,
- recommend the next safe step after the initial combat transaction work lands.
