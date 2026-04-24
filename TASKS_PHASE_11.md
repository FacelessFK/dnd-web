# Phase 11 — Durable Encounter Boundary & Combat Recovery Design

## Phase Numbering Note

This is the next internal task phase after `TASKS_PHASE_10.md`. It intentionally
does **not** correspond to `ROADMAP.md` Phase 11 as a one-to-one product phase;
it is still part of the broader reliability, reconnect, and persistence
hardening track.

Gameplay expansion remains deferred.

## Phase Goal

Design and land the first honest durable persistence boundary for encounter
state without changing gameplay behavior or overclaiming restart-safe combat
continuity.

This phase should make the encounter persistence shape, active-encounter
semantics, cross-store consistency risks, restart expectations, and transaction
implications explicit, then land the first DB-backed active-encounter
groundwork before any broader combat-continuity claims.

## Phase Scope

- Preserve the current public command and SSE API behavior.
- Keep encounter design aligned with the current server-authoritative runtime:
  - `start_encounter`,
  - `get_encounter_state`,
  - `advance_turn`,
  - `use_action`,
  - `use_bonus_action`,
  - `use_reaction`,
  - `record_movement_usage`,
  - `attack`,
  - `dm_set_current_turn_usage`,
  - `dm_set_current_turn_participant`,
  - `dm_end_active_encounter`.
- Define the minimal durable encounter state needed for a first DB-backed
  active-encounter repository.
- Decide active-encounter semantics and ended-encounter behavior intentionally.
- Map cross-store consistency risks with:
  - durable session snapshots,
  - durable character records,
  - durable scene records.
- Document honest restart expectations for future durable encounter reads.
- Document transaction/publication implications for attack, encounter-aware
  movement, encounter start/end, and DM encounter overrides.
- Recommend the next implementation slice after the first DB-backed
  active-encounter groundwork lands.

## Explicit Non-Goals

- No gameplay expansion.
- No protocol changes.
- No HTTP route changes.
- No SSE schema changes.
- No outbox or replay implementation.
- No event cursor or catch-up stream.
- No durable movement stream history.
- No durable combat-event history.
- No auth or frontend work.
- No monster, spell, weapon, ranged-attack, or opportunity-attack work.
- No hidden claim of restart-safe combat continuity before the underlying
  transactions exist.

## Design Principles

- Server remains authoritative.
- A first durable encounter slice should preserve current behavior before it
  broadens capabilities.
- At most one active encounter per session should remain an explicit invariant.
- Encounter persistence should stay honest about its dependencies on session,
  character, and scene durability.
- Replay and outbox concerns should stay separate until durable encounter writes
  actually depend on reliable publication semantics.
- Design should prefer a narrow active-encounter baseline before any history or
  archival work.

## Suggested Slice Breakdown

### Slice 1 — Durable Encounter Boundary Design

Status: completed.

Goal:

- Define the first honest durable encounter boundary before DB-backed
  implementation work begins.

Tasks:

- Audit `EncounterRepository` and the current encounter-touching flows:
  - `start_encounter`,
  - `get_encounter_state`,
  - `advance_turn`,
  - `use_action`,
  - `use_bonus_action`,
  - `use_reaction`,
  - `record_movement_usage`,
  - `attack`,
  - `dm_set_current_turn_usage`,
  - `dm_set_current_turn_participant`,
  - `dm_end_active_encounter`.
- Define the minimal durable encounter state:
  - encounter identity,
  - owning session ID,
  - active scene ID,
  - participants,
  - initiative/order,
  - round/current-turn state,
  - current turn usage,
  - encounter status,
  - created/updated timestamps.
- Decide active-encounter semantics:
  - durably enforce at most one active encounter per session,
  - keep ended encounters non-historical in the first durable slice to preserve
    current behavior.
- Map cross-store consistency risks with:
  - session snapshots,
  - character records,
  - scene records.
- Document honest restart expectations and remaining gaps.
- Decide whether the next slice should remain design-only or move to first
  DB-backed active-encounter groundwork.

Acceptance:

- The durable encounter boundary is explicitly defined.
- The design preserves current encounter semantics intentionally.
- Ended-encounter behavior is chosen explicitly rather than left implied.
- Cross-store transaction risks are documented concretely.
- The next implementation slice is narrow and implementation-ready.

Completed outcome:

- Confirmed the current `EncounterRepository` is a single-active-encounter
  boundary keyed by `sessionId`.
- Confirmed the minimal durable encounter state already matches the current
  `Encounter` model:
  - `id`,
  - `sessionId`,
  - `sceneId`,
  - `status`,
  - `participants`,
  - `currentTurnIndex`,
  - `roundNumber`,
  - `currentTurnUsage`,
  - `createdAt`,
  - `updatedAt`.
- Chose the first durable semantics intentionally:
  - one active encounter per session remains durably enforced,
  - ended encounters remain deleted/non-historical in the first durable slice,
    while an ended snapshot can still be returned and published for current API
    behavior.
- Documented the cross-store consistency risks:
  - session snapshots carry active-scene identity and participant membership,
  - character records carry HP, downed state, and active-scene placement,
  - scene records carry the active scene definition used by encounter reads and
    movement validation.
- Documented honest restart expectations:
  - a future durable encounter repository could make `get_encounter_state`
    rereadable after restart only when durable session, character, and scene
    boundaries remain coherent too,
  - this still would not restore SSE subscribers, missed `encounter_state`,
    `movement_state`, or `combat_event` emissions,
  - replay/catch-up/outbox behavior remains deferred.
- Documented the remaining transaction/publication implications:
  - `start_encounter` validates session/scene/placements before creating the
    encounter,
  - `attack` mutates both character HP and encounter usage,
  - encounter-aware movement mutates both character position and encounter
    movement usage,
  - DM encounter overrides are single-encounter mutations but still publish
    after save,
  - `dm_end_active_encounter` still publishes a final ended snapshot before the
    active encounter disappears from future reads.
- Chose the next slice explicitly:
  - proceed to implementation with a first DB-backed active-encounter
    repository groundwork slice.

### Slice 2 — First DB-Backed Active Encounter Repository Groundwork

Status: completed.

Goal:

- Add the first DB-backed active-encounter repository behind the existing
  encounter boundary without changing public gameplay behavior.

Tasks:

- Add the minimal encounter schema and migration.
- Implement a DB-backed active-encounter repository adapter.
- Preserve the current single-active-encounter-per-session behavior.
- Keep ended encounters non-historical in this first slice.
- Keep `InMemoryEncounterStore` as the default startup path.
- Add focused repository tests and at least one restart-oriented read test.

Acceptance:

- A DB-backed active-encounter repository exists.
- `get_encounter_state` can be reread after restart only for the supported
  injected path.
- No replay, outbox, or broader gameplay scope is added.

Completed outcome:

- Added `active_encounter_records` in `packages/db` with:
  - `encounter_id` primary key,
  - unique `session_id`,
  - `scene_id`,
  - JSONB `record`,
  - `created_at` / `updated_at`.
- Added `DrizzleActiveEncounterRecordDatabase`.
- Added `DbBackedEncounterStore`, which:
  - preloads durable active encounters into a fresh in-memory encounter map on
    startup,
  - keeps runtime encounter reads synchronous,
  - persists active-encounter create, save, and end/delete writes durably.
- Preserved current active-encounter semantics intentionally:
  - at most one active encounter per session,
  - ended encounters removed from future reads,
  - no durable encounter history yet.
- Kept `InMemoryEncounterStore` as the default startup path.
- Added focused repository tests for:
  - create/read active encounter,
  - uniqueness of one active encounter per session,
  - save/update behavior,
  - end/delete behavior,
  - missing encounter failures.
- Added a restart-oriented server test proving:
  - `reconnect_session` can recover the session snapshot on the injected path,
  - `get_encounter_state` can reread a durable active encounter after restart
    only when durable session, scene, character, and active-encounter state all
    line up.
- Did not add replay, outbox, encounter history, or broader combat-continuity
  guarantees.

### Slice 3 — Encounter Transaction Boundary Design

Status: completed.

Goal:

- Define the real cross-store transaction needs before claiming restart-safe
  combat continuity.

Tasks:

- Map transaction requirements for:
  - attack resolution,
  - encounter-aware movement,
  - encounter start,
  - encounter end,
  - DM encounter overrides.
- Decide which flows can stay encounter-only and which require cross-store
  atomicity with character/session state.
- Decide when outbox/publication work becomes necessary.

Acceptance:

- The repository knows exactly which encounter flows are still non-atomic after
  the first DB-backed active-encounter slice.

Completed outcome:

- Mapped the exact store sets touched by:
  - `start_encounter`,
  - `advance_turn`,
  - `use_action`,
  - `use_bonus_action`,
  - `use_reaction`,
  - `record_movement_usage`,
  - `attack`,
  - `dm_set_current_turn_usage`,
  - `dm_set_current_turn_participant`,
  - `dm_end_active_encounter`,
  - encounter-aware movement.
- Classified the flows into three buckets:
  - encounter-only durable writes after cross-store validation reads,
  - cross-store writes involving character plus encounter state,
  - cross-store writes plus multi-event publication.
- Made the current non-atomic gaps explicit:
  - target HP write plus encounter usage write in `attack`,
  - character position write plus encounter movement usage write in
    encounter-aware movement,
  - validation against durable session/scene/character state before encounter
    writes,
  - final ended snapshot publication after active encounter deletion.
- Chose the first honest transactional target:
  - start with encounter-only transactional work for encounter-local mutation
    commands,
  - defer `attack` and encounter-aware movement until a later cross-store
    transaction design slice.
- Clarified when durable idempotency for encounter commands becomes worth
  adding:
  - once the command can write durable encounter state and the durable
    completed-command record in the same real transaction.
- Clarified when outbox/publication work becomes necessary:
  - still deferrable for the first encounter-only transactional slice,
  - becomes harder to defer once cross-store combat writes need reliable
    ordered `encounter_state`, `movement_state`, and `combat_event` delivery.

### Slice 4 — Encounter-Only Transactional Baseline

Status: completed.

Goal:

- Add the first real transaction boundary for encounter-local durable writes
  before any attempt at cross-store combat continuity.

Tasks:

- Introduce a real DB transaction/unit-of-work path for encounter-local durable
  commands.
- Keep public HTTP/protocol/SSE behavior unchanged.
- Target commands whose durable mutation is encounter-only:
  - `advance_turn`,
  - `use_action`,
  - `use_bonus_action`,
  - `use_reaction`,
  - `record_movement_usage`,
  - `dm_set_current_turn_usage`,
  - `dm_set_current_turn_participant`,
  - `dm_end_active_encounter`,
  - and possibly `start_encounter` if the narrower validation assumptions stay
    explicit.
- Add durable idempotency for supported encounter commands only when the
  idempotency record can commit in the same real transaction as the encounter
  write.
- Keep outbox/replay deferred, with post-commit publication risk documented
  honestly.

Acceptance:

- Supported encounter-only commands can commit the durable encounter mutation
  and durable idempotency record atomically.
- Duplicate successful retries do not rerun the supported encounter mutation.
- No claim is made that `attack` or encounter-aware movement are transactionally
  durable yet.

Completed outcome:

- Added `DbBackedEncounterCommandTransactionBoundary`.
- Extended `DndDatabaseUnitOfWork` so the real DB transaction context now
  includes active-encounter records alongside character and completed-command
  idempotency records.
- Added a transaction-scoped encounter runtime path that:
  - reuses current session/scene/character validation reads,
  - swaps in a transaction-bound `DbBackedEncounterStore`,
  - buffers `encounter_state` SSE until commit.
- Supported transactional encounter commands are now:
  - `start_encounter`,
  - `advance_turn`,
  - `use_action`,
  - `use_bonus_action`,
  - `use_reaction`,
  - `record_movement_usage`,
  - `dm_set_current_turn_usage`,
  - `dm_set_current_turn_participant`,
  - `dm_end_active_encounter`.
- Supported transactional encounter commands now perform:
  - durable idempotency lookup/conflict check,
  - durable encounter create/save/delete,
  - durable completed-command success record insert
    in one real DB transaction.
- Duplicate successful retries now return the cached durable success response
  without rerunning the supported encounter mutation or republishing
  `encounter_state`.
- `command_id_conflict` still rejects conflicting fingerprints before runtime
  mutation.
- Failed supported encounter commands do not persist durable success records.
- `dm_end_active_encounter` still preserves current behavior intentionally:
  - the runtime can return and publish a final ended snapshot,
  - the active encounter then disappears from future reads,
  - durable encounter history remains out of scope.
- `attack` and encounter-aware movement remain outside this slice because they
  still need a later cross-store transaction/publication design.

### Slice 5 — Cross-Store Combat Transaction Design

Status: planned.

Goal:

- Define the honest next transaction boundary for the combat flows that span
  both durable encounter state and durable character state.

Tasks:

- Map the exact cross-store transaction needs for:
  - `attack`,
  - encounter-aware movement.
- Decide whether the first cross-store transactional target should be:
  - attack-only,
  - movement-only,
  - or a shared character+encounter transaction boundary.
- Re-evaluate durable idempotency placement for those cross-store commands.
- Decide when outbox/publication work stops being deferrable.

Acceptance:

- The repo has an implementation-ready design for the first cross-store combat
  transaction slice.

### Slice 6 — Encounter Persistence Exit Pass

Status: planned.

Goal:

- Close the initial durable encounter foundation and recommend the next safe
  implementation step.

Tasks:

- Review implemented encounter durability against the design.
- Reconfirm non-goals and remaining gaps.
- Update README, handoff, and persistence notes.

Acceptance:

- The durable encounter baseline is explicit, validated, and does not overclaim
  restart-safe combat continuity.

## Acceptance Criteria

- Encounter persistence design remains explicit as DB-backed encounter work
  expands.
- Active-encounter semantics are chosen intentionally.
- Cross-store risks with session snapshots, character records, and scene
  records are documented clearly.
- Restart expectations remain read-model based and honest.
- Gameplay scope remains unchanged.
- The next encounter implementation slice is narrow and concrete.

## Validation Expectations

For design-only slices:

- Run `pnpm format:check`.
- Run broader validation only if doc or package metadata edits justify it.

For implementation slices:

- Run `pnpm lint`.
- Run `pnpm test`.
- Run `pnpm typecheck`.
- Run `pnpm format:check`.

## Future Work Notes

- Encounter history should be a separate decision after the first durable
  active-encounter slice.
- Outbox and replay should remain separate from the first encounter persistence
  slice and from the first encounter-only transactional slice unless product
  requirements force reliable ordered delivery sooner.
- Restart-safe combat continuity should wait for honest cross-store transaction
  work.
