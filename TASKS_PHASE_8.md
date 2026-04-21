# Phase 8 — Runtime Reliability & Reconnect Readiness

## Phase Goal

Harden the existing server-authoritative runtime before adding more gameplay
features.

Phase 8 focuses on command reliability, reconnect expectations, SSE/read-model
consistency, revision semantics, and known in-memory limitations. It should make
the current runtime safer to use and easier to evolve without expanding combat,
rules automation, frontend features, or persistence.

## Phase Scope

- Define a narrow command idempotency baseline.
- Clarify how command IDs should be tracked in the in-memory runtime.
- Prevent duplicate side effects for selected mutating commands.
- Document SSE event ordering and delivery expectations.
- Clarify reconnect snapshot expectations for late or returning clients.
- Improve participant reconnect consistency where needed.
- Clarify session revision consistency and known gaps.
- Clarify which events are snapshots and which are transient notifications.
- Document current in-memory limitations explicitly.
- Document future persistence and transaction boundary needs.

## Explicit Non-Goals

- No gameplay expansion.
- No opportunity attacks.
- No full reaction system.
- No condition engine.
- No death saves or recovery rules.
- No spells.
- No weapon system.
- No ranged attacks.
- No monster or NPC AI.
- No frontend UI work.
- No database persistence implementation.
- No full event sourcing.
- No distributed scaling.
- No Redis or multi-process coordination.
- No production deployment work.

## Suggested Slice Breakdown

### Slice 1 — Command Idempotency Baseline

- Define which command IDs are tracked.
- Define the minimum response behavior for duplicate commands.
- Prevent duplicate side effects for selected mutating commands.
- Keep command tracking in memory only.
- Avoid durable command logs, event sourcing, or database-backed deduplication.
- Start with narrow runtime commands that already mutate authoritative state.

### Slice 2 — Reconnect Snapshot Consistency

- Clarify what reconnecting clients receive after reconnect.
- Ensure current snapshot/read-model state is sufficient after reconnect.
- Document which SSE events are transient and not replayed yet.
- Confirm active scene, movement placement, encounter state, and combat-relevant
  state can be re-read authoritatively.
- Avoid adding a second stream or generalized replay system.

### Slice 3 — Event / Revision Semantics Review

- Clarify which state mutations increment session revision.
- Clarify which SSE events are authoritative snapshots.
- Clarify which SSE events are transient action/result notifications.
- Document known limitations around ordering, replay, and revision coverage.
- Keep event shapes stable unless a narrow correctness fix is required.

### Slice 4 — Transaction Boundary Planning

- Document multi-store write risks in the current in-memory architecture.
- Pay special attention to attack resolution, where character HP, encounter
  usage, and SSE events are coordinated.
- Identify future transaction boundaries needed for database persistence.
- Avoid implementing database persistence in this phase.
- Avoid fake transaction abstractions that do not improve correctness.

## Slice 1 Detailed Task List

- Inventory existing commands and classify them as mutating or read-only.
- Choose a narrow initial set of mutating commands for idempotency protection.
- Define in-memory command tracking ownership and lifetime.
- Define duplicate command behavior, including whether to return the original
  response or reject duplicates explicitly.
- Ensure duplicate commands do not create duplicate sessions, participants,
  characters, scenes, movements, encounters, attacks, or turn-usage mutations
  for the selected baseline.
- Keep command tracking server-owned and scoped clearly.
- Add explicit error codes only if the existing runtime error surface is too
  vague.
- Document that idempotency is in-memory only and does not survive server
  restart yet.
- Add focused tests for duplicate command behavior.

## Acceptance Criteria

- Phase 8 improves runtime reliability without expanding gameplay.
- Slice 1 defines and implements an in-memory idempotency baseline.
- Duplicate selected mutating commands do not apply duplicate side effects.
- Reconnect expectations are documented before adding broader reconnect logic.
- SSE event semantics are documented clearly enough for future client work.
- Current in-memory limitations are explicit.
- Multi-store transaction risks are documented before persistence work begins.
- Each implementation slice passes `pnpm lint`, `pnpm test`,
  `pnpm typecheck`, and `pnpm format:check`.

## Tests To Add Later

- Duplicate selected command IDs do not duplicate side effects.
- Duplicate create/join/session commands behave according to the chosen
  idempotency policy.
- Duplicate movement commands do not double-spend movement usage.
- Duplicate encounter turn-usage commands do not double-consume action, bonus
  action, reaction, or movement.
- Duplicate attack commands do not reroll, double-damage, or emit duplicate
  events for the selected baseline.
- Reconnect flows can read enough authoritative state to recover current
  session, active scene, placement, and encounter state.
- SSE event/read-model consistency holds for movement, encounter, and combat
  state after reconnect.

## Phase Exit Checklist

- Command idempotency baseline is implemented and tested.
- Reconnect snapshot expectations are documented and validated where practical.
- Event and revision semantics are documented.
- Known transient event limitations are documented.
- Current in-memory restart limitations are documented.
- Future persistence transaction boundaries are documented.
- No gameplay systems were expanded during Phase 8.
- No database, Redis, event-sourcing, or distributed coordination work was added.
- All implemented slices pass the required validation commands.

## Future Work Notes

- Durable idempotency should be revisited during a persistence phase.
- Full event replay should remain separate from this phase and should not be
  added accidentally through SSE cleanup.
- Multi-process coordination likely needs Redis or another shared runtime layer,
  but that belongs in a future infrastructure phase.
- Opportunity attacks, condition engines, death saves, spells, weapons, and
  ranged attacks should wait until reliability boundaries are clearer.
- Frontend battle UX should consume documented snapshots/events after reconnect
  expectations are stable.
