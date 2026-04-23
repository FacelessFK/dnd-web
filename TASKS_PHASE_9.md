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

- Status: completed.
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

- Status: completed.
- Document command endpoints:
  - `/api/session/command`,
  - `/api/characters/command`,
  - `/api/scenes/command`,
  - `/api/movement/command`,
  - `/api/encounters/command`,
  - `/api/dm/command`.
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
  - `combat_event`,
  - `character_state`.
- Document snapshot vs transient event behavior.

### Slice 4 — Project Handoff Refresh

- Status: completed.
- Refresh project handoff context with completed Phase 6, Phase 7, and Phase 8
  behavior.
- Capture completed Roadmap Phase 8 backend DM controls behavior.
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

## Slice 2 Detailed Task List

- Added a dedicated manual validation guide at `docs/manual-validation.md`.
- Kept README concise and pointed it to the full manual flow.
- Covered the current end-to-end runtime path:
  - server status check,
  - session creation,
  - SSE subscription,
  - player joins,
  - character creation, finalization, assignment, and readback,
  - scene creation and activation,
  - character placement and active-scene readback,
  - encounter start,
  - reaction and bonus action usage,
  - attack resolution,
  - idempotent retry of a successful attack command,
  - downed actor gating,
  - reconnect and read-model recovery.
- Did not add scripts or replace copy-paste manual validation.

## Slice 3 Detailed Task List

- Expanded README API surface documentation with all current command endpoints:
  - `/api/session/command`,
  - `/api/characters/command`,
  - `/api/scenes/command`,
  - `/api/movement/command`,
  - `/api/encounters/command`,
  - `/api/dm/command`.
- Documented the session SSE stream endpoint:
  - `/api/sessions/:sessionId/stream?participantId=:participantId`.
- Documented current command groups and command types.
- Documented mutating commands versus read-only commands.
- Clarified that successful mutating command responses are cached by the
  process-local in-memory idempotency store.
- Clarified that read commands are intentionally not cached.
- Documented practical error/status behavior:
  - validation errors generally return `400`,
  - missing resources generally return `404`,
  - state conflicts generally return `409`,
  - role/DM authorization failures return `403`,
  - unexpected internal failures return `500`.
- Documented current SSE event semantics:
  - `session_state` is a snapshot-style session update with revision,
  - `encounter_state` is a snapshot-style encounter update,
  - `movement_state` is a live partial movement/placement/reposition update,
  - `combat_event` is a transient combat result notification,
  - `character_state` is a live partial character update for DM HP and
    condition-tag changes.
- Updated manual validation notes to include the current backend DM command
  surface.
- No runtime, protocol, or gameplay behavior changed.

## Slice 4 Detailed Task List

- Added `dnd_project_handoff_context.md` as a concise current-state handoff.
- Captured completed Phase 6 combat foundation:
  - narrow attack command,
  - legality-before-RNG,
  - fixed damage,
  - HP floor,
  - `encounter_state` before `combat_event`.
- Captured completed Phase 7 combat-state foundation:
  - HP-derived downed state,
  - downed actor gating,
  - current-turn reaction usage foundation.
- Captured completed internal Phase 8 reliability foundation:
  - in-memory command idempotency,
  - reconnect/read-model recovery,
  - event/revision semantics,
  - transaction-boundary limitations.
- Captured completed Roadmap Phase 8 backend DM controls:
  - HP override,
  - condition-tag editing,
  - active-scene reposition,
  - turn usage override,
  - current turn override,
  - encounter end.
- Captured remaining limitations and likely next work options after Phase 9.
- Kept the handoff concise and did not duplicate every task file.
- No runtime, protocol, or gameplay behavior changed.

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
- Project handoff context is refreshed.
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
