# 0005: Character Library And Runtime State Stay Separate

## Status

Accepted

## Context

The Character Library and Builder now provide reusable player-owned
build/identity records. The runtime already has session character assignment,
pending assignment, placement, movement, HP, conditions, encounters, attacks,
and DM overrides.

The active product milestone is connecting these surfaces so a finalized
Character Library entry can be used in a live session.

The main risk is collapsing reusable character identity/build data and mutable
live runtime state into the same record.

## Decision

Character Library entries must remain separate from live session overlays.

Assignment from the library should create or link runtime session state derived
from the reusable entry, but live play must not mutate the reusable library
entry.

Live-session state includes:

- assigned participant/session linkage;
- active-scene position;
- current HP and downed/defeated state;
- active condition tags;
- turn usage;
- encounter membership;
- DM corrections and overrides.

Reusable library state includes:

- player-owned identity/build data;
- rules profile;
- selected species/race, class, and background;
- ability setup;
- derived previews;
- proficiencies, languages, tools, equipment, and spells;
- portrait/template references;
- draft/finalized library status.

## Why

- A player should be able to reuse the same character record across sessions.
- Live damage, movement, conditions, or DM overrides from one session should not
  corrupt the reusable build.
- Runtime recovery and encounter behavior need session-local truth.
- DB ownership for library entries is a different concern from session
  participant assignment.
- The bridge can evolve without forcing a broad rewrite of the Character
  Builder.

## Consequences

- Bridge work needs a clear mapping between library entry IDs and runtime
  character/session IDs.
- Assignment should validate ownership/auth where auth is injected.
- Non-finalized or unauthorized library entries should be rejected.
- The DM remains the authoritative assignment actor.
- Tests should assert that live runtime mutations do not write back into the
  library entry.
- Docs must keep the distinction clear for future Codex tasks.

## Implementation Note

The first server-side bridge foundation now exists through
`submit_character_library_entry_for_assignment`.

Current behavior:

- reads a finalized Character Library entry through the Character Library
  service;
- validates ownership scope, player role, finalization status, and rules
  profile compatibility;
- creates a separate ready runtime character copy;
- records `meta.sourceCharacterLibraryEntryId` on the runtime character;
- submits the copied runtime character as the player's `pendingCharacterId` for
  the existing DM assignment command.
- provides a Player-mode `/runtime` selector for finalized saved entries owned
  by the authenticated user.

Remaining work:

- continued validation that the DB transaction/outbox bridge path does not
  mutate reusable library entries;
- continued validation that live HP, movement, conditions, and DM overrides do
  not mutate the reusable library entry.

## Next Milestone

Use `docs/delivery/NEXT_MILESTONE.md` as the planning source for the next
read-model recovery and realtime delivery-boundary slice.
