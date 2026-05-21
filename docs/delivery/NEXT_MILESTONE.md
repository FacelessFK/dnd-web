# Next Milestone

## Recommendation

DB Transaction/Outbox Hardening For The Character Library -> Runtime Assignment
Bridge.

This is the next product milestone because the Character Library and Builder
MVP now exists, the server-side bridge foundation is implemented, and
Player-mode `/runtime` has a localization-aware saved-character submission UI.
The remaining bridge risk is DB-mode multi-store durability.

## Goal

Make bridge submission durable and idempotent across the runtime character
copy, session pending assignment, command success cache, and stream/outbox
publication path, while preserving the reusable library entry as
immutable-with-respect-to-live-play.

## Scope

- Inspect the existing DB-backed character repository, session transaction
  boundary, idempotency claim/success records, and command outbox patterns.
- Preserve the existing command and UI contract for
  `submit_character_library_entry_for_assignment`.
- Add a narrow transaction boundary if the current DB architecture can support
  character-copy creation, session pending assignment, idempotency, and outbox
  publication in one honest slice.
- Keep runtime character/session overlay state separate from the reusable
  library entry.
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

- Existing UI submission of a finalized library entry still works.
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
- DB-mode behavior is either covered by a narrow transaction/outbox boundary or
  the remaining gap is documented honestly.

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

Implemented: Player-mode `/runtime` can load finalized saved entries for the
authenticated user, select one, submit it through the bridge, and show the
result through existing pending/assignment state.

### Slice 5: DB Transaction/Outbox Hardening

Implemented: DB mode routes `submit_character_library_entry_for_assignment`
through the DB-backed session command transaction boundary when injected. The
library entry read, runtime character copy, session pending assignment, durable
idempotency success, and one post-commit `session_state` outbox row are covered
without adding replay/cursor guarantees.

### Slice 6: Validation And Docs

Run targeted server/web tests, then the practical validation set from
`docs/codex-workflow.md`. Update docs to match the implemented behavior.

## Recommended Prompt Effort

Use Codex model effort `high` for the normal multi-file frontend/backend
implementation tasks. Use `extra high` only if the slice changes DB schema,
transaction boundaries, idempotency, security, or data-model invariants.
