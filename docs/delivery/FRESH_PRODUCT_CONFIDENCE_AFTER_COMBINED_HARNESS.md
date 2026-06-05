# Fresh Product-Confidence Intake After Combined Harness

## Slice 1: Fresh Product-Confidence Intake After Combined Harness

- Date: 2026-06-05
- Branch/build: local working tree after the saved-character-to-Training-Room
  combined DB-mode browser evidence harness
- Runtime/product code changed during intake: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Goal

Review the current combined evidence after the saved-character-to-Training-Room
browser harness and decide whether a fresh, narrow product-confidence follow-up
is justified. Keep the decision evidence-first and avoid expanding scope just
because a broad product area is nearby.

## Evidence Reviewed

Current source-of-truth docs:

- `CODEX_CONTEXT.md`
- `docs/engineering/CURRENT_STATE.md`
- `docs/codex-workflow.md`
- `docs/delivery/NEXT_MILESTONE.md`
- `docs/delivery/SAVED_CHARACTER_TRAINING_ROOM_PRODUCT_FLOW_TRIAGE.md`

Current harness/code evidence:

- `apps/web/package.json` exposes
  `corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db`.
- `apps/web/scripts/runtime-bridge-db-smoke.mjs` now has a 12-step DB-mode
  browser path that seeds a finalized saved Character Library entry, submits it
  from Player mode, assigns the separate runtime copy from DM mode, validates
  reusable-entry separation, builds and activates a Training Room scene with
  existing server commands, places the assigned runtime copy, starts an
  encounter, recovers both browser profiles, verifies first-turn/action
  feedback, and confirms Player Local Reset recovery.

Latest recorded validation from the combined harness implementation:

- `node --check apps/web/scripts/runtime-bridge-db-smoke.mjs` passed.
- `corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db`
  passed all 12 steps and included DB readiness.
- `corepack pnpm --filter @dnd/web test` passed.
- `corepack pnpm --filter @dnd/web typecheck` passed.
- `git diff --check` passed.
- `corepack pnpm format:check` passed.

## Product-Confidence Readout

Healthy / closed for current evidence:

- The previously observed split-evidence gap is closed: one DB-mode browser
  run now follows a single saved Character Library entry through the runtime
  Training Room loop.
- Server authority remains intact: the harness uses server commands and read
  models for session, scene, placement, encounter, and character truth.
- DM authority remains intact: Player saved-character submission still becomes
  pending assignment, and DM assignment is still an explicit browser action.
- Character Library/runtime separation remains intact: the runtime copy keeps
  source-library provenance and the reusable finalized entry is reread after
  runtime work to confirm it was not mutated.
- Local Reset behavior is product-honest: the harness verifies Player Local
  Reset clears browser state while server-owned scene and encounter read models
  remain recoverable.
- No fresh evidence points to a DB readiness, auth MVP, portrait, PDF, bridge,
  Training Room, recovery, or Local Reset blocker.

Observed nuance, not a blocker:

- The combined harness is confidence/evidence infrastructure, not a polished
  human playtest artifact. It validates visible browser text and read models,
  but it does not create a screenshot packet or a narrative run log for a
  reviewer.
- During harness implementation, stable UI evidence came from current-turn,
  encounter, readiness, placed-token, and action feedback rather than a single
  universal roster label. That suggests future reviewer-facing evidence should
  describe the exact panels/assertions used instead of relying on one label as
  the product proxy.

No current blocker:

- No runtime protocol blocker.
- No DM gate blocker.
- No Character Library/runtime separation blocker.
- No DB schema, migration, transaction, idempotency, outbox, or auth blocker.
- No replay/catch-up, production auth, or broader automation claim was added.
- No current evidence justifies expanding into combat automation, spell
  automation, inventory, fog of war, monster AI, production asset storage, or
  broader D&D systems.

## Recommended Next Slice

Combined Harness Evidence Closure / Review Packet.

Recommended effort: `medium`.

Goal:

Create a short reviewer-facing closure packet from the existing combined
harness evidence: command, 12-step meaning, boundaries verified, what is not
claimed, and any remaining manual review notes. This can be docs-only unless a
human explicitly asks for screenshot automation.

Why `medium`:

- The mechanics are already covered, but the next useful confidence step is
  translating the harness into reviewable product evidence. It should not touch
  production runtime code, but it does need careful boundary wording and
  current-state alignment.

Scope:

- Summarize the combined harness in reviewer language.
- Include exact validation command and the covered product loop.
- State non-claims clearly: no replay/catch-up, no production auth, no broad
  combat automation, no mutation of reusable Character Library entries.
- Note that a screenshot packet is optional and should be approved as a
  separate follow-up if needed.

Non-goals:

- No runtime protocol changes.
- No DB/auth/schema changes.
- No production code changes.
- No new bridge behavior.
- No new PDF, portrait, inventory, spell, monster AI, fog-of-war, replay, or
  production auth scope.

Suggested validation:

- `git diff --check`
- `corepack pnpm format:check`
- If the closure packet changes docs only, runtime tests do not need to be
  rerun.

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings: none.

Minor findings:

- Keep the next slice review/closure-oriented. The current evidence does not
  justify product-scope expansion by itself.

Uncertainties / missing evidence:

- There is no screenshot packet for the combined saved-character-to-Training
  Room path. This is only a reviewer-evidence gap, not a mechanics blocker.

Recommended next action:

Run a medium-effort Combined Harness Evidence Closure / Review Packet task, or
move to human review/merge decision if the current harness evidence is already
enough.

## Slice 2: Combined Harness Evidence Closure / Review Packet

- Date: 2026-06-05
- Runtime/product code changed: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Status: implemented in
`docs/delivery/COMBINED_HARNESS_EVIDENCE_CLOSURE_PACKET.md`.

Outcome:

- The closure packet summarizes the combined harness command, the 12-step
  product loop, reviewer evidence map, boundary review, explicit non-claims,
  and closure decision.
- The recommended next action is human review / merge decision.
- If visual reviewer evidence is needed, approve a separate optional
  screenshot packet for the same combined harness path.
