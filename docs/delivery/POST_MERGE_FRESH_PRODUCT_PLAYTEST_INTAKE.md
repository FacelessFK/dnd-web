# Post-Merge Fresh Product Playtest Intake

## Intake Status

- Date: 2026-06-05
- Chosen path: reviewer-facing Character Library -> Runtime handoff playtest
  intake
- Recommended effort: `medium`
- Scope: evidence/readout-only product intake after the curated combined
  harness slice landed on `main`
- Runtime/product code changed during this intake: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Why This Path

The post-merge closure ended the curated combined harness evidence slice on
`main`. The next useful product question is not whether the mechanics work, but
whether a reviewer can understand the current journey:

1. create and finalize a reusable Character Library entry;
2. preview and download the character sheet PDF from saved data;
3. take the finalized saved entry into Player-mode `runtime`;
4. wait for explicit DM assignment of the separate runtime copy;
5. see that Training Room play mutates runtime/session state, not the reusable
   library entry;
6. recover after refresh or Player Local Reset through authoritative read
   models.

This path keeps the project grounded in the current DM-first tabletop product
loop without starting another automatic runtime or Character Library hardening
sequence.

## Evidence Collected

Source / product inspection:

- `docs/product/USER_FLOWS.md` still describes Character Library creation as
  reusable content and runtime assignment as a separate live-session flow.
- `apps/web/app/characters/character-builder-ui.tsx` uses `useI18n`, renders
  localized Character Library shell/card copy, opens PDF preview dialogs before
  download, exposes card-level finalization, and shows a finalized-card hint
  pointing users to Player-mode `runtime`.
- `apps/web/app/runtime/runtime-cockpit.tsx` lists saved Character Library
  entries in Player mode, submits selected entries through
  `submit_character_library_entry_for_assignment`, shows pending assignment
  state, lets DM assign the runtime copy, and displays source-library
  provenance on assigned runtime character cards.
- `apps/web/scripts/character-builder-export-db-smoke.mjs` proves persisted
  Character Library creation, portrait persistence, Review/card PDF preview,
  PDF artifact capture, finalization, and finalized-state reread.
- `apps/web/scripts/runtime-bridge-db-smoke.mjs` proves saved-character
  submission, DM assignment, runtime-copy provenance, Training Room placement,
  encounter start, DM/Player recovery, Player Local Reset, and read-model
  recovery.

Validation evidence:

- `corepack pnpm --filter @dnd/db check:readiness` passed with DB connection,
  UTF8 encoding, and required tables present.
- `corepack pnpm --filter @dnd/web test:smoke:builder-export-db` passed all 9
  steps for a Persian saved Character Library entry, portrait persistence,
  Review/card PDF preview and artifact checks, browser finalization, and
  finalized-state reread.
- `corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db`
  passed all 12 steps for saved-character submission, DM runtime-copy
  assignment, Character Library/runtime separation, Training Room placement,
  encounter start, DM/Player recovery, and Player Local Reset recovery.

## Intake Findings

Healthy / closed for current evidence:

- DB readiness is healthy in the current local environment.
- Character Library Builder/Export remains healthy, including Persian content,
  portrait persistence, preview-before-download, PDF artifact capture, and
  card-level finalization.
- The saved-character -> runtime handoff remains healthy in DB mode.
- DM assignment remains explicit.
- Assigned runtime copies preserve source Character Library provenance.
- Player Local Reset remains browser-local and does not clear server-owned
  active scene or encounter state.

Observed product gap:

- No fresh mechanics blocker appeared. The remaining gap is reviewer guidance:
  the product loop is proven by harnesses, but a human reviewer still benefits
  from a concise playtest brief that names what to look at on `/characters`,
  Player-mode `/runtime`, DM-mode assignment, Training Room recovery, and
  reusable-entry separation.

## Recommended Next Slice

Create a short reviewer playtest brief for the Character Library -> Runtime
handoff path.

Recommended effort: `medium`.

Scope:

- Document the browser path a reviewer should run or inspect.
- Tie each review checkpoint to the existing smoke evidence.
- Call out the exact boundaries: reusable Character Library entry, separate
  runtime copy, explicit DM assignment, Player Local Reset as browser-local,
  and read-model recovery as current-state recovery rather than replay.
- Include English/Persian scanability checkpoints.

Non-goals:

- No runtime protocol changes.
- No DB schema, migration, transaction, idempotency, outbox, or auth changes.
- No PDF template, portrait storage, or production asset changes.
- No new Character Library -> Runtime bridge behavior.
- No replay/cursor/catch-up, production auth, combat automation, monster AI,
  fog of war, spell automation, inventory, or broader D&D systems.

Suggested validation for the docs-only brief:

- `git diff --check`
- `corepack pnpm exec prettier --check` for the touched docs
- `node scripts/guards/check-docs-only.mjs --all-changed`

Runtime tests are not required for the brief itself if it only records this
already-collected evidence.

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings: none.

Minor findings / cautions:

- This intake should not restart automatic runtime polish or bridge hardening.
- The smoke evidence is strong for local single-process DB mode, but it does
  not claim production deployment behavior, durable replay, multi-process SSE
  coordination, exactly-once delivery, or production auth/security.
- Screenshot evidence remains optional and should only be created if a visual
  reviewer asks for it.

## Closure Decision

Proceed with the reviewer playtest brief as the next narrow docs-only slice.

Do not change runtime, Character Library mechanics, PDF/portrait behavior,
DB/auth, or protocol unless the reviewer brief or a fresh browser pass reveals
a specific blocker.

## Reviewer Playtest Brief

Status: implemented in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEWER_PLAYTEST_BRIEF.md`.

Closure decision: use the brief as the current manual review guide for the
already-implemented Character Library -> Runtime handoff path. If review finds
no fresh blocker, choose the next product task from a new human-approved
playtest goal instead of extending this handoff sequence automatically.

## Reviewer Result / Closure Packet

Status: implemented in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_CLOSURE_PACKET.md`.

Closure decision: use the packet to record `pass`, `follow-up`, or `blocked`
review outcomes. If review passes, close the current handoff sequence and pick
the next task from a new human-approved product goal.

## Recorded Reviewer Verdict

Status: implemented in
`docs/delivery/CHARACTER_LIBRARY_RUNTIME_HANDOFF_REVIEW_VERDICT.md`.

Verdict: `pass` with cautions.

Closure decision: close the current Character Library -> Runtime handoff review
sequence. No new runtime, Character Library, PDF, portrait, DB/auth, or bridge
work should start automatically from this evidence.
