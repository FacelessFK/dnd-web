# Next Milestone

## Recommendation

Read-Model Recovery Audit And Realtime Delivery Boundaries.

The Character Library -> runtime bridge now has narrow DB transaction/outbox
coverage. The next useful milestone is to make missed realtime delivery easier
to detect and recover from without claiming durable replay, stream cursors,
exactly-once delivery, or multi-process subscriber coordination.

## Goal

Keep the product honest and operable when post-commit SSE delivery is missed:
surface unpublished outbox backlog, preserve current read-model recovery
paths, and document where clients must reread authoritative state rather than
expect event replay.

## Scope

- Preserve the current no-auto-drain cold-boot behavior.
- Expose a read-only unpublished outbox backlog summary.
- Keep status responses free of row IDs, command IDs, payloads, or secrets.
- Confirm status reads do not publish events or mark outbox rows as published.
- Keep existing recovery through `reconnect_session`, `get_character`,
  `get_scene`, `get_active_scene_state`, and `get_encounter_state`.
- Update API and engineering docs without overclaiming replay/catch-up.

## Non-Goals

- Durable replay or stream cursors.
- Exactly-once delivery.
- Multi-process subscriber coordination.
- Startup auto-redelivery.
- Admin auth, production monitoring, alerting, or deployment work.
- Replacing existing SSE with another transport.

## Risks

- Accidentally marking unpublished rows as published from a status/read path.
- Exposing command payloads, row IDs, session IDs, or user data in an
  operational endpoint.
- Suggesting that backlog visibility means clients can replay events.
- Breaking the targeted post-commit outbox drains used by covered commands.

## Acceptance Criteria

- `GET /api/outbox/status` returns whether outbox dispatch is configured.
- The response includes total unpublished row count, event-type counts, and
  oldest unpublished creation time.
- Status reads do not publish events or mutate outbox rows.
- In-memory/no-dispatcher startup reports `configured: false` with zero counts.
- Docs explain that this is observability only, not replay/catch-up.
- Existing transaction/outbox tests continue to pass.

## Suggested Small Slices For Codex

### Slice 1: Outbox Status Endpoint

Implemented: `GET /api/outbox/status` reports unpublished backlog counts
without draining rows or exposing row details.

### Slice 2: Recovery Audit

Implemented: a DB-backed missed-live-delivery test proves the current
browser/server recovery contract. Clients can recover current truth by
rereading session, scene, active-scene, encounter, and character read models
after reconnect or refresh, while late SSE subscribers do not receive
historical event replay.

### Slice 3: UI Or Operator Surface

If product needs it, decide whether `/runtime` or a separate dev/operator view
should show a non-blocking "realtime backlog exists" indicator. Keep it
localization-aware and avoid production monitoring claims.

### Slice 4: Future Replay Design

Only if explicitly requested, design replay/cursor semantics as a separate
milestone with schema, auth, retention, ordering, and multi-process boundaries.

## Recommended Prompt Effort

Use Codex model effort `high` for recovery docs/tests or small UI surfacing.
Use `extra high` for any replay, cursor, retention, auth, or multi-process
delivery work.
