# Character Library -> Runtime Handoff Reviewer Playtest Brief

## Brief Status

- Date: 2026-06-05
- Recommended effort: `medium`
- Scope: reviewer-facing playtest brief for the current Character Library ->
  Runtime handoff path after post-merge main closure
- Runtime/product code changed during this brief: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Reviewer Goal

Review the current product loop from reusable saved character to live Training
Room play without adding new mechanics:

1. A user creates or reviews a reusable Character Library entry.
2. The entry can be finalized, previewed, and exported from saved data.
3. A Player submits the finalized saved entry from Player-mode `runtime`.
4. The server creates a separate runtime copy and marks it pending for DM
   assignment.
5. The DM explicitly assigns that runtime copy.
6. Training Room placement, encounter state, HP, movement, conditions, and DM
   overrides stay in runtime/session state, not on the reusable library entry.
7. Browser refresh and Player Local Reset recover through authoritative read
   models, not replay.

## Preconditions

Use local DB mode with migrations applied and UTF8 readiness passing:

```bash
corepack pnpm --filter @dnd/db check:readiness
```

The existing automated evidence path is:

```bash
corepack pnpm --filter @dnd/web test:smoke:builder-export-db
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

The brief assumes the reviewer is inspecting the already-implemented product
path. It does not require a new protocol command, seed script, screenshot
packet, or production deployment setup.

## Review Path

### 1. Character Library Saved Entry

Open `/characters` after logging in through the DB-backed auth MVP.

Review checkpoints:

- The Character Library shell, list, card actions, and PDF affordances are
  understandable in English and Persian.
- Draft and finalized states are visually distinguishable.
- Finalized cards explain that saved entries are submitted from Player-mode
  `runtime`.
- Card copy does not imply live HP, movement, conditions, scene placement, or
  encounter membership belongs to the reusable Character Library entry.

Automated evidence:

- `test:smoke:builder-export-db` verifies authenticated Persian draft
  persistence, browser reload, card rendering, card-level finalization, and
  finalized-state reread.

### 2. Portrait And PDF Preview

From the edit/review path or a finalized library card, inspect portrait
rendering and character-sheet export.

Review checkpoints:

- Uploaded portrait preview and card rendering are visible after persistence.
- PDF actions open the web character-sheet preview before download.
- The preview clearly reflects saved Character Library data such as character
  name, class/level, species, background, and armor class.
- Download remains an explicit action inside the preview dialog.

Automated evidence:

- `test:smoke:builder-export-db` verifies portrait upload persistence, Review
  preview content, card preview content, PDF artifact headers, PDF file names,
  and finalized-state reread.

### 3. Player Saved-Character Submission

Open `/runtime` in Player mode and recover or join a session.

Review checkpoints:

- The saved Character Library selector lists finalized entries for the
  authenticated user.
- The Player can submit a finalized saved entry for DM assignment.
- The Player sees pending/waiting state after submission.
- Copy makes clear that the submitted object is a runtime copy waiting for DM
  assignment.

Automated evidence:

- `test:smoke:saved-character-training-room-db` seeds a finalized saved entry,
  opens Player-mode `runtime`, submits the saved entry, and verifies Player
  pending/runtime-copy evidence.

### 4. DM Assignment

Open `/runtime` in DM mode for the same session.

Review checkpoints:

- The pending assignment request is visible to the DM.
- The request shows the character name and source-library provenance.
- Assignment is an explicit DM action.
- After assignment, the pending affordance clears and the assigned runtime
  character card keeps source-library provenance visible.

Automated evidence:

- `test:smoke:saved-character-training-room-db` verifies DM pending preview,
  source library entry ID, explicit runtime-copy assignment, pending cleanup,
  and assigned-character provenance.

### 5. Training Room And Encounter Recovery

Inspect the Training Room after the assigned runtime copy is placed and an
encounter is started.

Review checkpoints:

- DM and Player browsers show the Training Room.
- The assigned saved character appears as the runtime copy in scene/encounter
  state.
- Player readiness, turn readiness, `Turn & Target`, action feedback, and
  encounter status are understandable.
- Runtime-copy/source-library identifiers are treated as provenance, not as
  editable library state.

Automated evidence:

- `test:smoke:saved-character-training-room-db` builds the Training Room around
  the assigned runtime copy, starts an encounter, and verifies DM/Player
  recovery evidence.

### 6. Local Reset Boundary

Use Player Local Reset and then recover the same backend session.

Review checkpoints:

- Player Local Reset clears only that browser profile's stored cockpit session.
- The DM browser still retains its local session.
- The Player can recover the same backend session afterward.
- Active scene and encounter state survive because they are server-owned
  runtime state.

Automated evidence:

- `test:smoke:saved-character-training-room-db` verifies stored-session
  separation, Player Local Reset, DM continuity, Player recovery, active-scene
  read model recovery, and encounter read model recovery.

## Boundary Checklist

Pass conditions:

- Browser state is not treated as authoritative.
- DM assignment remains explicit and server-side role gated.
- Reusable Character Library entries remain separate from runtime copies.
- Runtime HP, placement, encounter state, movement usage, conditions, and DM
  overrides do not mutate reusable library entries.
- Recovery is described as read-model recovery of current state, not replay,
  cursor, catch-up, exactly-once delivery, or multi-process SSE coordination.
- Character Library auth is described as an MVP with opaque HttpOnly-cookie
  sessions, not production account security.
- Portrait uploads remain MVP data/storage, not production asset storage.
- PDF export remains local template/fallback behavior, not a production
  compliance claim.

## English / Persian Scanability

Review both English and Persian where practical.

Check:

- Navigation and high-traffic card actions stay localized.
- Persian text remains readable in RTL layout.
- Canonical IDs, `runtime`, `DM`, `HP`, `AC`, `PDF`, dice notation, source
  library IDs, and runtime copy IDs may stay stable where intentionally
  product/protocol-facing.
- User-entered character names and notes are not auto-translated.
- Mixed-language rows remain understandable and do not hide the boundary
  between reusable saved data and live runtime state.

## Known Non-Claims

This playtest brief does not claim:

- production auth or deployment readiness;
- durable replay, stream cursors, catch-up delivery, exactly-once delivery, or
  multi-process SSE coordination;
- cold-boot outbox redelivery;
- production asset storage;
- PDF compliance beyond the existing local template/fallback path;
- full spell automation, broad combat automation, monster AI, fog of war,
  broad inventory, ranged combat, or death-save systems.

## Closure Decision

The reviewer should use this brief as the current manual review guide for the
already-implemented Character Library -> Runtime handoff path.

If review finds no fresh blocker, choose the next product task from a new
human-approved playtest goal instead of extending this handoff sequence
automatically.

If review finds a concrete issue, turn only that observed issue into a narrow
follow-up slice and preserve the boundaries above.

## Review Closure Packet

Status: implemented in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_CLOSURE_PACKET.md`.

Use that packet to record the reviewer verdict as `pass`, `follow-up`, or
`blocked`, and to keep any next task scoped to the exact observed issue.

## Recorded Verdict

Status: implemented in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_VERDICT.md`.

Verdict: `pass` with cautions. No follow-up slice is required from the current
evidence.
