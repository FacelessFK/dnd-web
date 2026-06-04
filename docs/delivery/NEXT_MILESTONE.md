# Next Milestone

## Recommendation

Training Room Skirmish / Phase 6 playable flow polish.

The Character Library -> runtime assignment bridge already has a server-side
path, Player-mode submit UI, DM preview/assignment flow, and narrow DB
transaction/outbox coverage on the injected DB path. The next useful milestone
is to make the first named demo scenario feel coherent for a real DM-player
playtest without adding new protocol, combat automation, replay, or production
auth scope.

## Goal

Polish the Training Room Skirmish presentation and manual playtest script so a
reviewer can run the named scenario, understand the product direction, and see
the current DM-first tabletop loop through existing runtime commands and current
local sample data.

## Scope

- Keep the named Training Room Skirmish scenario as the first playable demo
  path.
- Clarify DM setup, scene state, player readiness, assignment, turn state,
  encounter status, recovery status, and action feedback where the current UI
  already exposes those concepts.
- Tighten English/Persian copy and preserve LTR/RTL behavior.
- Improve manual playtest guidance around the existing scenario.
- Keep existing read-model recovery through `reconnect_session`, `get_scene`,
  `get_active_scene_state`, `get_encounter_state`, and `get_character`.
- Document current limitations directly and honestly.

## Non-Goals

- New runtime protocol or command semantics.
- New combat rules automation, full spell automation, ranged/inventory/death
  save systems, opportunity attacks, or monster AI.
- Fog of war, line of sight, lighting, traps, locks, scripts, or automatic
  transition automation.
- Durable replay, stream cursors, catch-up API, exactly-once delivery, startup
  auto-redelivery, or multi-process subscriber coordination.
- Production auth, account security expansion, deployment, monitoring, or
  alerting.
- Mutating reusable Character Library entries with live HP, placement,
  conditions, movement usage, encounter membership, or DM overrides.

## Risks

- Accidentally turning a presentation polish slice into protocol or combat-rule
  work.
- Adding English-only copy or breaking Persian RTL layout.
- Making the browser appear authoritative instead of rendering server responses
  and read models.
- Suggesting that outbox visibility or read-model recovery is replay/catch-up.
- Hiding known MVP limits behind demo-only copy.

## Acceptance Criteria

- The named Training Room Skirmish path remains runnable with existing runtime
  commands and current local sample data.
- The DM can understand the next setup/play action without reading protocol
  JSON.
- Player and DM surfaces keep assignment, readiness, turn, encounter, and
  recovery state clear enough for a manual playtest.
- New or changed user-facing copy is localization-aware and preserves
  English/Persian direction.
- Docs continue to state that SSE is live delivery only and clients recover
  current truth through read models.
- No new claims are made for replay, stream cursors, catch-up, exactly-once
  delivery, multi-process coordination, production auth, or broader D&D
  automation.

## Suggested Small Slices For Codex

### Slice 1: Scenario Presentation Audit

Inspect the current named demo scenario setup, runtime sample data, manual
validation script, and smoke path. Identify only the UI/docs wording needed to
make the existing flow easier to run.

### Slice 2: Training Room Skirmish Presentation Polish

Tighten the scenario-facing runtime copy and state presentation without changing
runtime protocol, combat semantics, auth, DB requirements, or read-model
recovery behavior.

### Slice 3: Manual Playtest Script Pass

Update the manual validation path so a reviewer can run the Training Room
Skirmish flow, recover after refresh, confirm Player-mode guardrails, and see
known limitations without internal implementation context.

Status: implemented.

### Slice 4: Playtest Evidence Triage

Use one completed Training Room Skirmish run template and checklist result to
choose the next narrow UI polish slice. Keep this as triage only unless a human
explicitly approves implementation. Do not broaden into protocol, combat
automation, replay/catch-up, production auth, or broader D&D systems.

Status: implemented from the Codex browser run recorded in
`docs/delivery/TRAINING_ROOM_SKIRMISH_CODEX_BROWSER_RUN.md`.

### Slice 5: Persian / RTL Runtime Status Polish

Polish Persian/RTL scanability for the Training Room runtime status and setup
panels by localizing remaining high-traffic demo/status labels and making mixed
Persian plus canonical ID rows easier to scan. Keep this frontend-only and do
not change runtime protocol, command semantics, combat automation, auth, DB
requirements, or read-model recovery behavior.

Status: implemented.

### Slice 6: Post-Slice-5 Playtest Evidence Triage

Use the completed one-profile and two-profile Training Room smoke evidence plus
source inspection to choose the next narrow UI polish slice. Keep this as
triage only unless a human explicitly approves implementation. Do not broaden
into protocol, combat automation, replay/catch-up, production auth, DB/auth
requirements, or broader D&D systems.

Status: implemented from the post-Slice-5 triage recorded in
`docs/delivery/TRAINING_ROOM_SKIRMISH_CODEX_BROWSER_RUN.md`.

### Slice 7: Persian Readiness / Roster Microcopy Polish

Polish remaining Persian readiness/roster microcopy in the Training Room flow by
replacing mixed English/Persian high-traffic labels with localization-aware
Persian equivalents while preserving canonical IDs, `runtime`, `Session ID`,
and server URLs where they are intentionally stable. Keep this
frontend/i18n-only and do not change runtime protocol, command semantics,
combat automation, auth, DB requirements, or read-model recovery behavior.

Status: implemented.

### Slice 8: Persian Table Setup / Disabled Helper Microcopy Polish

Polish remaining Persian Table Setup and disabled-reason helper copy in the
Training Room flow by replacing mixed English/Persian setup blockers with
localization-aware Persian equivalents while preserving canonical IDs,
`runtime`, `Session ID`, server URLs, and protocol/debug labels where they are
intentionally stable. Keep this frontend/i18n-only and do not change runtime
protocol, command semantics, combat automation, auth, DB requirements, or
read-model recovery behavior.

Status: implemented.

### Slice 9: Persian Assignment Bridge Microcopy Polish

Polish remaining Persian Assignment Request and Character Library bridge copy in
the Training Room flow by replacing mixed English/Persian helper terms such as
`pending`, `preview`, `submit`, `recover`, and `session` with
localization-aware Persian equivalents while preserving canonical IDs,
`runtime`, `Session ID`, source-library identifiers, server URLs, and
protocol/debug labels where they are intentionally stable. Keep this
frontend/i18n-only and do not change runtime protocol, command semantics,
Character Library/runtime separation, combat automation, auth, DB requirements,
or read-model recovery behavior.

Status: implemented.

### Slice 10: Persian Recovery / Stream Status Microcopy Polish

Polish remaining Persian Recovery Status, stream/event-feed, and active-scene
status copy in the Training Room flow by replacing mixed English/Persian helper
terms such as `session`, `scene`, `read model`, `stream`, `subscribe`,
`recover`, `feed`, and `condition` with localization-aware Persian equivalents
while preserving canonical IDs, `runtime`, `Session ID`, SSE, server URLs, and
protocol/debug labels where they are intentionally stable. Keep this
frontend/i18n-only and do not change runtime protocol, command semantics,
replay/catch-up claims, SSE behavior, combat automation, auth, DB requirements,
or read-model recovery behavior.

Status: implemented.

### Slice 11: Persian Debug / Scene Builder Helper Microcopy Polish

Polish remaining Persian Debug panel and Scene Builder helper copy in the
Training Room flow by replacing mixed English/Persian helper terms such as
`Payload`, `protocol`, `debug`, `command`, `ledger`, `entity`, `cell`, and
draft/prerequisite wording with localization-aware Persian equivalents while
preserving canonical command IDs, protocol payload names, `SSE`, server URLs,
and debug labels where they are intentionally stable. Keep this
frontend/i18n-only and do not change runtime protocol, command semantics,
scene authority, combat automation, auth, DB requirements, or read-model
recovery behavior.

Status: implemented.

### Slice 12: Persian Combatant / DM Override Helper Microcopy Polish

Polish remaining Persian Combatant, action, and DM override helper copy in the
Training Room flow by replacing mixed English/Persian helper terms such as
`combatant`, `attack`, `target`, `damage`, `override`, `turn`, `movement`,
`reaction`, and draft/prerequisite wording with localization-aware Persian
equivalents while preserving canonical command IDs, `DM`, `HP`, `AC`,
`monster/NPC`, dice notation, protocol/debug labels, and server-owned combat
authority where they are intentionally stable. Keep this frontend/i18n-only
and do not change runtime protocol, command semantics, target legality,
damage automation, turn validation, auth, DB requirements, or read-model
recovery behavior.

Recommended effort: `medium`.

## Historical Note

The previous read-model recovery and realtime delivery-boundary milestone is
implemented as a narrow observability/recovery slice:

- `GET /api/outbox/status` reports unpublished backlog counts without draining
  rows or exposing row details.
- A DB-backed missed-live-delivery test proves clients can recover current truth
  through read models while late SSE subscribers do not receive historical event
  replay.
- `/runtime` DM mode includes a compact manual outbox status badge as a
  development/operator visibility aid, not production monitoring, replay, or
  recovery automation.

Keep these as current limitations and supporting infrastructure, not the next
product milestone.

## Recommended Prompt Effort

Use Codex model effort `medium` for docs-only cleanup, small UI polish, and
small helper/test updates around the Training Room flow.

Use `high` for normal multi-file frontend/backend implementation or any DB,
transaction, idempotency, outbox, auth/security, or runtime data-model boundary
work.

Use `extra high` only if a task combines several high-risk areas.
