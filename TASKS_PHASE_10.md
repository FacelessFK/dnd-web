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
- Add the first narrow durable repository slice behind an existing interface.
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

Status: planned.

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

### Slice 2 — First Durable Repository Slice

Status: planned.

Goal:

- Add the first narrow database-backed repository behind an existing boundary.

Recommended first target:

- `CharacterRepository`, because character state is central to HP, downed
  gating, DM HP overrides, condition tags, and combat damage while still being
  narrower than full session/event durability.

Tasks:

- Add the minimal schema/migration needed for the selected repository.
- Implement a database-backed repository behind the existing interface.
- Keep the in-memory repository available for tests and local development.
- Add tests proving clone-safety/serialization behavior still holds.
- Add tests proving the durable repository can save and read current state.
- Avoid changing public command shapes or runtime behavior.

Acceptance:

- Existing runtime behavior can use the durable repository by configuration or
  narrow wiring.
- Repository tests pass for both in-memory and durable behavior where practical.
- No unrelated repositories are rewritten.
- No gameplay behavior changes.

### Slice 3 — Durable Command Idempotency Baseline

Status: planned.

Goal:

- Move the current process-local successful-command cache toward durable command
  deduplication.

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

Acceptance:

- Duplicate successful mutating command retries do not repeat side effects after
  a durable read.
- Command ID conflicts still fail before runtime mutation.
- Failed command responses remain uncached.
- No distributed/multi-process guarantee is claimed unless actually built.

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
