# Phase 10 — Persistence & Durable Runtime Foundation

## Phase Numbering Note

This is the next internal task phase after `TASKS_PHASE_9.md`. It intentionally
does **not** correspond to `ROADMAP.md` Phase 10, which is spellcasting. This
phase aligns primarily with `ROADMAP.md` Phase 11 — Reliability, Reconnect &
Persistence Hardening.

Gameplay expansion remains deferred.

## Phase Goal

Move the current server-authoritative runtime from process-local memory toward a
durable runtime foundation without changing gameplay behavior.

This phase should make persistence boundaries, transaction expectations,
idempotency durability, reconnect durability, and future event/outbox needs
explicit before the project adds broader combat, spell, condition, frontend, or
production features.

## Phase Scope

- Preserve the current public command and SSE API behavior.
- Keep the in-memory runtime usable while adding durable boundaries
  incrementally.
- Design persistence around the existing repository boundaries:
  - sessions,
  - characters,
  - scenes,
  - encounters,
  - command idempotency.
- Identify transaction boundaries for existing multi-store flows.
- Plan durable event/outbox needs without implementing replay yet.
- Add the first narrow durable repository groundwork, then wire it through the
  live runtime boundary once the sync/async contract is resolved.
- Add durable command idempotency direction and tests when implemented.
- Clarify reconnect expectations once state survives process restart.
- Keep manual validation and task docs aligned with any persistence slice.

## Explicit Non-Goals

- No gameplay expansion.
- No spells.
- No opportunity attacks.
- No weapons, inventory, or ranged attacks.
- No death saves or recovery rules.
- No full condition engine or condition effects.
- No frontend battle UI.
- No frontend DM panel.
- No authentication.
- No distributed scaling, Redis, or multi-process coordination.
- No event sourcing.
- No durable event replay in the first slices.
- No global event cursor unless a later slice explicitly designs it.
- No fake in-memory transaction abstraction.
- No broad database rewrite.

## Design Principles

- Server remains authoritative.
- Existing in-memory stores remain the baseline/fallback while durable stores
  are introduced.
- Public protocol contracts should stay stable unless a persistence correctness
  issue requires a narrow change.
- Repository interfaces should stay small and domain-specific.
- Transactions should be real database transactions, not simulated in memory.
- Event/outbox planning should be explicit, but replay should not be smuggled
  into this phase.
- Slice implementation should prefer one durable boundary at a time.
- Every implementation slice must include tests and validation.

## Suggested Slice Breakdown

### Slice 1 — Persistence Boundary And Transaction Design

Status: completed.

Goal:

- Turn the Phase 8 transaction-boundary notes into an implementation-ready
  persistence design.

Tasks:

- Audit existing repository interfaces:
  - `CharacterRepository`,
  - `SceneRepository`,
  - `EncounterRepository`,
  - `InMemorySessionStore`,
  - `CommandIdempotencyStore`.
- Identify which stores need durable equivalents first.
- Define the first database-backed repository target.
- Document transaction boundaries for existing multi-store mutations:
  - attack resolution,
  - encounter-aware movement,
  - DM HP override,
  - DM condition tag editing,
  - DM active-scene reposition,
  - DM turn usage/current turn overrides,
  - DM encounter end,
  - character assignment and scene activation.
- Decide where durable idempotency checks belong relative to runtime mutation.
- Decide whether the first persistence slice needs an outbox table design,
  without implementing replay.
- Document what still remains process-local after Slice 1.

Acceptance:

- A clear persistence design exists before database code changes.
- The design names the first durable repository target.
- Multi-store transaction risks are mapped to future real DB transactions.
- No fake in-memory transaction abstraction is introduced.
- No runtime/gameplay behavior changes.

Completed outcome:

- Added `docs/persistence-boundaries.md`.
- Audited current persistence implications for:
  - `CharacterRepository`,
  - `SceneRepository`,
  - `EncounterRepository`,
  - `InMemorySessionStore`,
  - `CommandIdempotencyStore`.
- Documented transaction-risk flows:
  - attack resolution,
  - encounter-aware movement,
  - DM HP override,
  - DM condition-tag editing,
  - DM active-scene reposition,
  - DM turn usage override,
  - DM current-turn override,
  - DM encounter end,
  - character assignment,
  - scene activation,
  - encounter start.
- Confirmed `CharacterRepository` as the recommended first durable repository
  target.
- Clarified durable idempotency placement:
  - after command parsing,
  - before runtime mutation,
  - inside the same real database transaction as durable state writes.
- Recommended an outbox-ready design now, with actual outbox implementation
  deferred until durable writes need reliable SSE publication.
- No runtime, protocol, SSE, DB, or gameplay behavior changed.

### Slice 2 — First Durable Repository Slice

Status: completed.

Goal:

- Add the first narrow database-backed repository behind an existing boundary.

Recommended first target:

- `CharacterRepository`, confirmed by the Slice 1 boundary audit, because
  character state is central to HP, downed gating, DM HP overrides, condition
  tags, active-scene position, and combat damage while still being narrower than
  full session/event durability.

Tasks:

- Use `docs/persistence-boundaries.md` as the design source of truth.
- Add the minimal schema/migration needed for the selected repository.
- Implement a database-backed repository behind the existing runtime boundary.
- Keep the in-memory repository available for tests and local development.
- Add tests proving clone-safety/serialization behavior still holds.
- Add tests proving the durable repository can save and read current state.
- Avoid changing public command shapes or runtime behavior.
- Do not add durable idempotency, event replay, or outbox behavior in this same
  slice unless a narrow test-only repository harness absolutely requires it.

Acceptance:

- Existing runtime behavior can use the durable repository by configuration or
  narrow wiring.
- Repository tests pass for both in-memory and durable behavior where practical.
- No unrelated repositories are rewritten.
- No gameplay behavior changes.

Groundwork completed:

- Added a real Drizzle/Postgres character persistence boundary in
  `packages/db`.
- Added a `character_records` migration with:
  - `character_id` primary key,
  - JSONB `record` document,
  - `created_at` / `updated_at` timestamps.
- Added `DrizzleCharacterRecordDatabase` as the DB-layer adapter for
  `character_records`.
- Added `DbBackedCharacterRepository` as an async server-side repository adapter
  over that DB boundary.
- Persisted the full current `StoredCharacterRecord` document through the DB
  boundary:
  - canonical `character`,
  - runtime `overlay`.
- Kept `InMemoryCharacterStore` available and unchanged as the default runtime
  store.
- Removed the JSON file-backed store path as the Slice 2 completion approach.
- Added focused repository tests for:
  - create/get round trip,
  - save/update behavior,
  - missing read and save failures,
  - clone/value semantics,
  - HP persistence,
  - active condition persistence,
  - position and overlay field persistence.
- Documented create-over-existing-ID behavior by matching the existing
  in-memory repository overwrite semantics intentionally.
- No public command, protocol, gameplay, SSE, session, encounter, idempotency,
  outbox, replay, auth, or frontend behavior changed.

Sync/async contract resolution:

- Real Drizzle/Postgres access is async.
- The in-memory `CharacterRepository` contract remains synchronous:
  - `createCharacter(record): StoredCharacterRecord`,
  - `getCharacter(characterId): StoredCharacterRecord`,
  - `saveCharacter(record): StoredCharacterRecord`.
- The runtime now has an internal awaitable character repository boundary for
  live command paths.
- Server command handlers now await runtime command results, preserving public
  HTTP/protocol/SSE behavior while allowing async character storage.
- The default in-memory path still returns synchronously for existing runtime
  tests and local behavior.

Durability boundary after Slice 2 + Slice 2B:

- Character records have a real DB-backed storage boundary through
  `DrizzleCharacterRecordDatabase`.
- Character repository semantics are tested through the async
  `DbBackedCharacterRepository` adapter.
- The live server/runtime command path can use `DbBackedCharacterRepository`
  without changing public command shapes, response shapes, SSE schemas, or
  gameplay behavior.
- The default runtime still uses `InMemoryCharacterStore`.
- Sessions are still in memory.
- Scenes are still in memory.
- Encounters are still in memory.
- Command idempotency is still in memory.
- SSE delivery is still non-durable.

### Slice 2B — Runtime Character Repository Async Boundary

Status: completed.

Goal:

- Make the live runtime capable of using the async DB-backed character
  repository through real command paths without changing public API behavior.

Tasks:

- Introduce the narrowest internal async boundary needed for character
  repository access.
- Update server command handlers to await runtime operations where needed while
  preserving existing response shapes.
- Keep `InMemoryCharacterStore` usable through the same runtime path.
- Do not add durable sessions, scenes, encounters, idempotency, outbox, replay,
  or gameplay changes.
- Add server/runtime tests proving DB-backed character persistence works through
  at least one real command path.

Acceptance:

- `DbBackedCharacterRepository` can be used by the live runtime path.
- Public command schemas, response schemas, SSE schemas, and gameplay behavior
  are unchanged.
- Existing in-memory tests continue to pass.
- Slice 2 can then be marked fully complete.

Completed outcome:

- Added an internal awaitable runtime character repository boundary.
- Kept the public in-memory `CharacterRepository` contract synchronous.
- Allowed `InMemoryGameRuntime` to accept either:
  - `InMemoryCharacterStore`,
  - `DbBackedCharacterRepository`.
- Updated server handlers to await runtime command results while preserving
  external HTTP behavior.
- Added a server-level integration test proving a real command path can:
  - create a character through the DB-backed repository,
  - finalize and assign it,
  - apply a DM HP override,
  - read the updated HP back,
  - observe the expected `character_state` SSE event shape.
- No protocol, response, SSE, gameplay, idempotency, session, scene, encounter,
  outbox, replay, auth, or frontend behavior changed.

### Slice 3 — Durable Command Idempotency Baseline

Status: completed.

Goal:

- Move the current process-local successful-command cache toward durable command
  deduplication without overclaiming restart safety for non-durable runtime
  stores.

Tasks:

- Add durable storage for completed successful mutating commands.
- Preserve the current idempotency key shape:
  - command category,
  - command type,
  - command ID,
  - actor participant ID,
  - session ID when available.
- Preserve fingerprint conflict behavior with `command_id_conflict`.
- Cache only successful mutating command responses unless a later design changes
  this explicitly.
- Keep read commands uncached.
- Add restart-oriented tests where practical.

Completed outcome:

- Added a Drizzle/Postgres `completed_command_idempotency_records` table for
  successful command response records.
- Added a DB access boundary and server-side `DbBackedCommandIdempotencyStore`.
- Made the server idempotency boundary awaitable while preserving the existing
  public HTTP/protocol/SSE behavior.
- Kept `InMemoryCommandIdempotencyStore` as the default local/server startup
  behavior.
- Added a partially durable idempotency integration that persists only
  character-record mutation command types where the current durable repository
  boundary can honestly support the mutation result:
  - `create_character`,
  - `update_character`,
  - `finalize_character`,
  - `dm_set_character_current_hp`,
  - `dm_set_character_active_conditions`.
- Kept all other command types on the process-local in-memory fallback because
  sessions, scenes, encounters, assignments, movement state, SSE delivery,
  replay, and outbox are still non-durable.
- Added a real DB unit-of-work path for supported durable character-mutation
  commands so the idempotency lookup/conflict check, character write, and
  successful idempotency response record are executed in one database
  transaction.
- Buffered `character_state` SSE for supported transactional DM character
  mutations and published it only after the transaction commits.

Acceptance:

- Duplicate successful supported character-record mutation command retries do
  not repeat side effects after a durable idempotency read.
- Command ID conflicts still fail before runtime mutation.
- Failed command responses remain uncached.
- Unsupported command types remain protected only by the process-local fallback.
- No distributed/multi-process or full restart-safe runtime guarantee is
  claimed.

### Slice 3B — Transactional Character Idempotency Boundary

Status: completed.

Goal:

- Close the atomicity gap for the currently supported durable character-mutation
  commands.

Completed outcome:

- Added `DndDatabaseUnitOfWork` and `DrizzleDndDatabaseUnitOfWork`.
- Added `DbBackedCharacterCommandTransactionBoundary`.
- The supported transactional command types are:
  - `create_character`,
  - `update_character`,
  - `finalize_character`,
  - `dm_set_character_current_hp`,
  - `dm_set_character_active_conditions`.
- Unsupported command types still use the existing non-transactional path.
- No outbox or replay behavior was added.

Acceptance:

- Successful supported character mutations write both character state and the
  durable completed-command idempotency record atomically.
- Duplicate retries return the cached durable success response without
  re-running runtime mutation.
- `command_id_conflict` still rejects conflicting command fingerprints before
  runtime mutation.
- Failed commands do not persist durable idempotency records.
- `character_state` SSE is published only after commit for supported
  transactional DM character updates.

### Slice 4 — Reconnect Durability Baseline

Status: planned.

Goal:

- Ensure reconnect recovery can use durable read models for the first persisted
  state areas.

Tasks:

- Define what state is durable after the first repository/idempotency slices.
- Add tests showing persisted state can be re-read after runtime/store
  reinitialization where practical.
- Confirm `reconnect_session` and existing read models remain the recovery path.
- Document which SSE events remain transient and not replayed.
- Avoid adding event replay or a second stream.

Acceptance:

- Reconnect documentation distinguishes durable read-model recovery from event
  replay.
- Persisted state can be recovered through existing read commands where the
  selected durable repositories support it.
- Transient SSE limitations remain explicit.
- No event replay, cursor, or event sourcing is added.

### Slice 5 — Persistence Exit Pass

Status: planned.

Goal:

- Close the initial durable-runtime foundation and decide the next safe
  direction.

Tasks:

- Review repository boundaries for consistency.
- Review transaction/outbox notes against implemented durable slices.
- Confirm no gameplay scope slipped into persistence work.
- Update README/manual validation/handoff notes if behavior or setup changed.
- List remaining persistence gaps:
  - non-persisted stores,
  - non-transactional flows,
  - transient events,
  - missing outbox/replay,
  - missing deployment/migration workflow.

Acceptance:

- The phase leaves the runtime more durable without broadening gameplay scope.
- Remaining durability gaps are documented clearly.
- Validation passes.
- Next implementation options are concrete and narrow.

## Acceptance Criteria

- The current server-authoritative runtime behavior remains stable.
- Persistence design is explicit before broad database work begins.
- At least one durable repository boundary is implemented or the phase clearly
  stops after an approved design slice.
- Durable idempotency direction is documented and implemented only when its
  transaction behavior is clear.
- Reconnect recovery remains read-model based.
- Event replay remains deferred unless a later dedicated slice explicitly
  scopes it.
- No gameplay systems are expanded.
- No frontend UI work is added.
- No fake transaction abstraction is introduced.
- Each implementation slice passes:
  - `pnpm lint`,
  - `pnpm test`,
  - `pnpm typecheck`,
  - `pnpm format:check`.

## Validation Expectations

For planning-only slices:

- Run `pnpm format:check`.
- Run broader validation if docs or package metadata changes could affect
  workspace checks.

For implementation slices:

- Run `pnpm lint`.
- Run `pnpm test`.
- Run `pnpm typecheck`.
- Run `pnpm format:check`.

Any slice that adds database-backed behavior should also include targeted tests
for the new repository or idempotency boundary.

## Future Work Notes

- Durable event outbox should be a dedicated future slice after initial
  persistence boundaries are understood.
- Missed-event replay should wait for an explicit event log/cursor design.
- Multi-process coordination should wait until single-process durable semantics
  are stable.
- Auth should remain separate from persistence unless a later product decision
  requires user identity before durable runtime work.
- Frontend battle UX should consume stable read models and documented SSE
  semantics after persistence boundaries are clearer.
- Gameplay expansion should resume only after durability risks are acceptable
  for the intended next milestone.
