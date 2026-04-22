# Phase 9 — Runtime/API Surface Cleanup & Manual Validation Readiness

## Phase Goal

Make the current authoritative runtime easier to operate, inspect, manually
validate, and hand off before adding more gameplay systems or frontend battle
work.

Phase 9 should refresh the project-facing documentation and manual validation
surface so it reflects the runtime through Phase 8: combat foundation, combat
state foundation, command idempotency, reconnect read-model recovery,
event/revision semantics, and transaction boundary limitations.

## Phase Scope

- Update server/API status documentation where it has become stale.
- Refresh README current-status sections and manual validation guidance.
- Document the current command/API surface at a practical level.
- Document read vs mutating commands and current idempotency behavior.
- Document SSE stream event types and snapshot/transient semantics.
- Document reconnect recovery through existing read models.
- Add or refresh copy-pasteable manual validation flows.
- Add or refresh a lightweight smoke/manual validation script only if it stays
  simple.
- Ensure task files and handoff context reflect completed phases accurately.
- Identify stale docs from earlier phases before gameplay expands further.

## Explicit Non-Goals

- No new gameplay features.
- No opportunity attacks.
- No condition engine.
- No death saves or recovery rules.
- No spells.
- No weapon system.
- No ranged attacks.
- No frontend battle UX.
- No database persistence.
- No event sourcing.
- No event replay.
- No Redis or distributed coordination.
- No production deployment work.
- No authentication.
- No character builder or rules-library implementation.

## Suggested Slice Breakdown

### Slice 1 — Server/API Status & README Sync

- Status: completed.
- Update server root status metadata if it still references an old phase.
- Update README current implementation status.
- Summarize current server command endpoints.
- Summarize current mutating vs read command behavior.
- Document the current SSE event types.
- Document reconnect read-model recovery expectations.
- Refresh manual validation notes to include runtime behavior through Phase 8.
- Avoid runtime/protocol behavior changes unless a stale metadata string is the
  only source of confusion.

### Slice 2 — Manual End-to-End Validation Scenario

- Status: planned.
- Define a complete manual validation path:
  - create a session,
  - join/reconnect participants,
  - create, finalize, and assign characters,
  - create and activate a scene,
  - place and move characters,
  - start an encounter,
  - use action, bonus action, reaction, and movement usage commands,
  - resolve an attack,
  - verify downed actor gating,
  - reconnect and re-read session, active scene, encounter, and character state,
  - verify idempotent retry behavior for selected mutating commands.
- Keep the flow practical and copy-pasteable.
- Add a script only if it remains lightweight and does not become a test
  framework.

### Slice 3 — API Surface Documentation

- Status: planned.
- Document command endpoints:
  - `/api/session/command`,
  - `/api/characters/command`,
  - `/api/scenes/command`,
  - `/api/movement/command`,
  - `/api/encounters/command`.
- Document SSE endpoint usage:
  - `/api/sessions/:sessionId/stream?participantId=:participantId`.
- Document command categories and command types.
- Document which commands are mutating and protected by in-memory idempotency.
- Document which commands are read models and intentionally not cached.
- Document current error/status semantics at a high level.
- Document SSE event types:
  - `session_state`,
  - `movement_state`,
  - `encounter_state`,
  - `combat_event`.
- Document snapshot vs transient event behavior.

### Slice 4 — Project Handoff Refresh

- Status: planned.
- Refresh project handoff context with completed Phase 6, Phase 7, and Phase 8
  behavior.
- Capture known limitations:
  - no persistence,
  - no durable event replay,
  - no global event cursor,
  - no full transaction boundary,
  - no production deployment posture yet.
- Capture likely next work options after Phase 9.
- Keep handoff content concise enough to be useful in future chats and reviews.
- Avoid duplicating every task file verbatim.

## Slice 1 Detailed Task List

- Inspect the server root response and update stale phase/status labels if
  needed.
- Inspect README status sections for outdated phase language.
- Update README with a concise current runtime capability summary.
- Add or refresh a command endpoint summary.
- Add or refresh a short manual validation sequence covering current runtime
  basics through Phase 8.
- Document the idempotency baseline:
  - mutating successful command responses are cached in memory,
  - duplicate successful retries do not repeat side effects,
  - read commands are not cached,
  - idempotency is process-local and not durable.
- Document reconnect expectations:
  - reconnect returns a session snapshot,
  - active scene, encounter, and character state should be recovered through
    read models,
  - missed transient SSE events are not replayed.
- Document event semantics:
  - `session_state` and `encounter_state` are snapshot-style events,
  - `movement_state` is a live partial movement update,
  - `combat_event` is a transient combat notification.
- Run validation after documentation/status changes.

## Acceptance Criteria

- Current README/status documentation matches the implemented runtime.
- Server root metadata is not misleading about the current phase/status.
- Manual validation guidance covers the main happy path through Phase 8.
- API endpoint documentation is clear enough for manual curl or client work.
- SSE event documentation distinguishes snapshot-style and transient events.
- Reconnect recovery guidance points clients to the existing read models.
- Idempotency behavior is documented without implying durable dedupe.
- No gameplay systems are expanded during Phase 9.
- No persistence, event replay, or distributed coordination is added.
- Each implementation slice passes the required validation commands.

## Tests And Manual Validation To Add Later

- Manual validation flow for creating a session and joining participants.
- Manual validation flow for creating, finalizing, assigning, and reading
  characters.
- Manual validation flow for creating and activating a scene.
- Manual validation flow for placing and moving characters.
- Manual validation flow for starting an encounter and mutating turn usage.
- Manual validation flow for resolving an attack and reading updated HP.
- Manual validation flow for reconnecting and re-reading authoritative state.
- Manual validation flow for duplicate mutating command retries.
- Optional lightweight smoke script only if it stays easy to maintain.

## Phase Exit Checklist

- Server/API status metadata is current.
- README current-status documentation is current.
- Manual validation flow is practical and copy-pasteable.
- Command/API surface is documented.
- SSE event behavior is documented.
- Reconnect/read-model recovery path is documented.
- Idempotency behavior and limitations are documented.
- Project handoff context is refreshed if useful.
- Stale phase references from earlier docs are identified or cleaned up.
- No runtime/gameplay scope was expanded.
- Required validation passes.

## Future Work Notes

- Gameplay expansion should resume only after the manual validation baseline is
  clear.
- Opportunity attacks still need a dedicated future slice because they require
  out-of-turn reaction semantics and event-ordering decisions.
- Conditions, death saves, weapons, spells, ranged attacks, and frontend battle
  UX remain separate future phases/slices.
- Persistence work should build on the Phase 8 transaction boundary notes, not
  on fake in-memory transaction abstractions.
- Durable event replay and reconnect catch-up should wait for a future event log
  or outbox design.
