# Persistence Boundary And Transaction Design

This document completes Phase 10 Slice 1. It turns the current in-memory
runtime notes into an implementation-ready persistence direction without
changing runtime behavior.

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
- Because session assignment still lives in `InMemorySessionStore`, durable
  characters alone do not yet make full reconnect-after-restart possible.

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

- This is a clean future durable target, but it is less connected to current
  combat reliability than characters.
- Persisting scenes first would not preserve assignments, active scene, HP,
  downed state, or encounter state after restart.

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

- A durable encounter store needs a unique active-encounter constraint per
  session.
- Encounter persistence is tightly coupled to session and character consistency:
  encounter participants reference participant IDs and character IDs stored
  elsewhere.
- Persisting encounters before sessions/characters could preserve orphaned or
  unrecoverable encounter state.

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

Tradeoffs:

- Durable characters alone do not make the whole runtime restart-safe because
  sessions, assignments, active scene, encounters, and idempotency remain
  in-memory.
- Character overlays currently contain active-scene position and active
  conditions; persisting characters means persisting some runtime overlay state
  earlier than session/encounter state.
- Multi-store flows like attack still need real transactions later because
  attack touches both character and encounter state.

Why not `InMemorySessionStore` first:

- It mixes durable session/participant data with process-local subscriber state.
- It needs a design split before a clean repository replacement.
- It is more important for restart-safe reconnect, but broader and riskier as a
  first DB slice.

Why not `EncounterRepository` first:

- Encounters reference session participants and character IDs.
- Durable encounters without durable sessions/assignments/characters can create
  unrecoverable state after restart.
- Attack and movement need encounter transactions with character updates, so
  encounter durability is best after at least one durable entity repository
  exists.

Why not `SceneRepository` first:

- Scenes are a clean persistence target, but less connected to current combat
  reliability.
- Persisting scenes first does not preserve HP, positions, downed state,
  assignments, active scene, or encounter state.

Why not durable idempotency first:

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

Proceed with Phase 10 Slice 4: Reconnect Durability Baseline, or add the next
durable repository slice first if reconnect durability needs persistent
session/scene/encounter read models.
