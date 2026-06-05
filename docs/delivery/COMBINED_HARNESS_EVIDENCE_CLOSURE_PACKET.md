# Combined Harness Evidence Closure Packet

## Review Status

- Date: 2026-06-05
- Scope: reviewer-facing closure packet for the saved-character-to-Training
  Room combined DB-mode browser evidence harness
- Runtime/product code changed during this closure packet: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no
- Recommended review decision: ready for human review / merge decision for the
  current evidence slice

## Validation Command

Run from the repo root with DB mode configured and migrations applied:

```bash
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

The command is currently backed by
`apps/web/scripts/runtime-bridge-db-smoke.mjs`. `test:smoke:bridge-db` remains
an alias for the same combined harness.

## Product Loop Covered

The combined harness follows one saved Character Library entry through the
current product loop:

1. Check DB-mode configuration.
2. Check DB-mode local environment readiness, including UTF8/readiness probes.
3. Start the DB-backed authoritative server.
4. Start the Next `/runtime` UI.
5. Seed an authenticated finalized saved Character Library entry.
6. Create a runtime session.
7. Submit the saved character from a Player browser profile.
8. Assign the separate runtime copy from a DM browser profile.
9. Validate runtime-copy provenance and reusable library-entry separation.
10. Build a Training Room around the assigned runtime copy with existing
    server commands.
11. Recover Training Room evidence in both DM and Player browser profiles.
12. Validate Player Local Reset and recovery.

## Reviewer Evidence Map

DB and auth readiness:

- The harness requires `DATABASE_URL` and runs the project DB readiness check
  before starting the browser flow.
- It registers a DB-backed Character Library user through the current auth MVP.
- It does not print database URLs, cookies, session tokens, or credentials.

Saved Character Library evidence:

- The harness creates and finalizes one reusable saved Character Library entry.
- The saved entry is submitted from Player mode through the existing
  saved-character bridge.
- The Player sees pending DM assignment after submission.

DM authority evidence:

- DM assignment remains an explicit browser action.
- The Player-submitted runtime copy is not treated as assigned until the DM
  clicks the assignment affordance.
- The harness checks that pending assignment clears after DM assignment.

Character Library/runtime separation evidence:

- The assigned character is a separate runtime copy.
- The runtime copy preserves `sourceCharacterLibraryEntryId` metadata.
- The reusable Character Library entry is reread after runtime assignment and
  remains finalized with unchanged HP.
- Training Room placement, encounter membership, and Local Reset recovery are
  validated against runtime/session read models, not by mutating the reusable
  library entry.

Training Room and encounter evidence:

- The harness creates a `Training Room` scene with existing scene commands.
- It activates that scene for the session.
- It places the assigned runtime copy through the movement command.
- It starts an encounter through the existing encounter command.
- It verifies active-scene and encounter read models after setup.

Browser recovery evidence:

- The DM profile recovers the session and verifies visible Training Room,
  assigned saved character, encounter status, and current-turn evidence.
- The Player profile recovers the same session and verifies visible Training
  Room, assigned saved character, readiness summary, placed-token state,
  turn-ready state, `Turn & Target`, and action feedback.

Local Reset evidence:

- Player Local Reset clears that browser profile's stored cockpit session.
- The DM browser profile retains its stored session.
- The Player can recover the same backend session after Local Reset.
- Final read-model checks confirm the server-owned active scene and active
  encounter survive Player Local Reset.

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings: none.

Minor findings:

- The packet is evidence packaging only. It should not be treated as a request
  for new runtime behavior.
- A screenshot packet may be useful for a visual reviewer, but it is separate
  optional evidence work and is not a mechanics blocker.

Uncertainties / missing evidence:

- No screenshot packet is attached to this closure packet.
- The harness validates a single local DB-mode browser path. It does not
  claim production deployment behavior, multi-process behavior, or durable
  event replay.

## Explicit Non-Claims

This closure packet does not claim:

- production auth or account security;
- durable replay;
- stream cursors;
- catch-up delivery;
- exactly-once delivery;
- multi-process SSE coordination;
- cold-boot outbox redelivery;
- production asset storage;
- PDF compliance beyond the existing local template/fallback behavior;
- full spell automation;
- broad combat automation;
- monster AI;
- fog of war;
- broad inventory, ranged, or death-save systems;
- mutation of reusable Character Library entries by live runtime HP,
  placement, conditions, movement usage, encounter membership, or DM
  overrides.

## Closure Decision

The saved-character-to-Training Room product-confidence gap is closed for the
current local single-process DB-mode browser evidence path. The combined
harness proves the current product loop in one run and preserves the project's
server-authoritative, DM-first, Character Library/runtime-separated boundary.

Recommended next action:

- Move this slice to human review / merge decision.
- If a visual reviewer needs more confidence, approve a separate optional
  screenshot evidence packet for the same combined harness path.

## Human Review / Merge Decision

Status: implemented in
`docs/delivery/HUMAN_REVIEW_MERGE_DECISION_COMBINED_HARNESS.md`.

Decision:

- Approve with cautions for the reviewed combined harness evidence slice.
- Use curated staging for the intended slice; do not merge the entire dirty
  working tree as one unreviewed unit.
- Request an optional screenshot evidence packet only if visual reviewer
  evidence is required.
