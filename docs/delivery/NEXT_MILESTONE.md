# Next Milestone

## Recommendation

Complete Character Library -> Runtime Assignment Bridge.

This is the next product milestone because the Character Library and Builder
MVP now exists and the first server-side bridge foundation is implemented, but
the product still needs UI affordances and DB-mode hardening before the bridge
feels complete.

## Goal

Allow a finalized Character Library entry to be selected/submitted for a live
session and assigned by the DM, creating or linking runtime session state while
preserving the reusable entry as immutable-with-respect-to-live-play.

## Scope

- Inspect existing Character Library commands, runtime character commands,
  session assignment flows, DB ownership, and i18n surfaces.
- Define the bridge contract between a reusable library entry and live runtime
  character/session state.
- Preserve the server-side command that lets eligible finalized library entries
  be submitted for a live session.
- Add product UI that lets a player select/submit a finalized library entry.
- Let the DM review pending runtime character assignment and assign it through
  the existing authoritative DM assignment path.
- Create or link runtime character/session overlay state from the reusable
  entry without mutating the entry.
- Ensure live HP, movement, conditions, encounter state, and DM overrides remain
  separate from the library entry.
- Preserve English/Persian UI support for any new copy.

## Non-Goals

- Full level-up/progression system.
- Full inventory, spells, conditions, weapons, or monster automation.
- Production auth expansion.
- Cloud asset storage.
- Rewriting the Character Builder.
- Replacing existing runtime assignment all at once if a narrower bridge can
  preserve compatibility.
- Player-specific visibility overhaul.

## Risks

- Mutating reusable Character Library entries with live HP/position/condition
  state.
- Confusing runtime character IDs with library entry IDs.
- Letting a player assign a character without DM authority.
- Breaking DB-mode ownership checks.
- Hardcoding new English-only UI strings.
- Overexpanding the bridge into broader rules or character-builder work.

## Acceptance Criteria

- A finalized library entry can be selected for submission to a live session.
- Server verifies ownership/auth where auth is injected.
- Server rejects non-finalized or unauthorized entries.
- DM remains the actor who authoritatively assigns a participant.
- Runtime state created or linked from the library entry is separate from the
  reusable entry.
- Live damage, movement, conditions, and DM overrides do not mutate the library
  entry.
- Read/recovery behavior exposes assigned or pending runtime state honestly.
- New user-facing copy is localization-aware for English/Persian.
- Tests cover server-side boundaries and any changed UI helpers.
- Docs and API notes are updated without claiming replay/exactly-once/full auth
  guarantees.
- DB-mode behavior is documented honestly until the bridge is covered by a
  transaction/outbox boundary.

## Suggested Small Slices For Codex

### Slice 1: Contract Inspection And Bridge Design

Inspect:

- `packages/protocol/src/character-library.ts`
- `packages/protocol/src/character.ts`
- `packages/shared/src/index.ts`
- `apps/server/src/character-library-store.ts`
- `apps/server/src/session-server.ts`
- `apps/server/src/game-runtime.ts`
- `apps/server/src/session-store.ts`
- `apps/server/src/db-session-store.ts`
- `apps/web/lib/character-library-api.ts`
- `apps/web/lib/i18n.tsx`
- `apps/web/app/runtime/runtime-cockpit.tsx`

Deliver a narrow design note before code changes.

### Slice 2: Server Bridge Foundation

Implemented: server-side protocol/service behavior and tests now submit a
finalized library entry into a session assignment path without mutating the
library entry.

### Slice 3: Runtime Assignment Integration

Implemented foundation: submission creates a separate ready runtime character
copy and stores it as `pendingCharacterId`. DM assignment still uses the
existing `assign_character_to_participant` command.

### Slice 4: Web UI Affordance

Add localization-aware UI for selecting/submitting a library entry and showing
pending/assigned status.

This is the recommended next implementation slice.

### Slice 5: DB Transaction/Outbox Hardening

If the bridge must be durable across multi-store DB failures, add a narrow
transaction boundary for creating the runtime character, updating session
pending assignment, idempotency, and event publication. Keep replay/cursor
claims out of scope unless explicitly implemented.

### Slice 6: Validation And Docs

Run targeted server/web tests, then the practical validation set from
`docs/codex-workflow.md`. Update docs to match the implemented behavior.

## Recommended Prompt Effort

Use Codex model effort `high` for the normal multi-file frontend/backend
implementation tasks. Use `extra high` only if the slice changes DB schema,
transaction boundaries, idempotency, security, or data-model invariants.
