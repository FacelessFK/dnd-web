# Curated Merge Or Optional Screenshot Packet

## Decision Status

- Date: 2026-06-05
- Scope: operational decision packet after the Human Review / Merge Decision
  packet for the combined saved-character-to-Training Room evidence slice
- Runtime/product code changed during this packet: no
- Git staging, commit, merge, push, and PR actions performed during this
  packet: no
- Recommended path: curated merge preparation, with an optional screenshot
  packet only if a visual reviewer requires it

## Decision

Choose curated merge preparation as the default next path.

Reason:

- The combined harness evidence slice already has command-line validation,
  product-confidence intake, closure evidence, and a human review / merge
  decision packet.
- No current evidence shows a mechanics blocker that requires screenshot
  evidence before review.
- The working tree is intentionally dirty with multiple prior slices and
  untracked files, so the main risk is accidentally merging unrelated work, not
  lack of current harness evidence.

Optional path:

- Create a screenshot evidence packet only if the human reviewer specifically
  wants visual proof of the same combined harness path before merge.

## Curated Merge Scope

The combined harness evidence slice depends on the already-approved
implementation and documentation chain. A reviewer preparing a merge should
stage only the intended approved slice and prerequisites, not the entire dirty
working tree.

Core combined harness files:

- `apps/web/scripts/runtime-bridge-db-smoke.mjs`
- `apps/web/package.json`

Current-state and workflow pointers:

- `CODEX_CONTEXT.md`
- `docs/engineering/CURRENT_STATE.md`
- `docs/codex-workflow.md`
- `docs/manual-validation.md`
- `docs/delivery/NEXT_MILESTONE.md`

Evidence and decision docs:

- `docs/delivery/SAVED_CHARACTER_TRAINING_ROOM_PRODUCT_FLOW_TRIAGE.md`
- `docs/delivery/FRESH_PRODUCT_CONFIDENCE_AFTER_COMBINED_HARNESS.md`
- `docs/delivery/COMBINED_HARNESS_EVIDENCE_CLOSURE_PACKET.md`
- `docs/delivery/HUMAN_REVIEW_MERGE_DECISION_COMBINED_HARNESS.md`
- `docs/delivery/CURATED_MERGE_OR_SCREENSHOT_PACKET.md`

Do not include unrelated paths unless they are part of a separately approved
slice.

## Dirty Worktree Caution

The current worktree contains changed and untracked paths from earlier work
outside this packet's docs-only scope, including web code, web scripts, package
files, DB tooling, and earlier delivery docs.

Merge caution:

- Do not stage by broad pattern such as `git add .`.
- Do not merge every changed file as one review unit unless a human explicitly
  approves that broader bundle.
- If staging manually, inspect each path before staging.
- If staging includes package, script, DB, generated, env-like, or
  credential-like paths, run the sensitive-file guard before commit.

## Suggested Validation Before Curated Merge

For the exact curated slice:

```bash
git diff --check
corepack pnpm format:check
corepack pnpm --filter @dnd/web test
corepack pnpm --filter @dnd/web typecheck
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

If staging package/script/DB/tooling paths, also run:

```bash
corepack pnpm guard:sensitive-files
```

If only this decision packet is being reviewed as docs-only:

```bash
git diff --check
corepack pnpm format:check
corepack pnpm guard:docs-only
```

## Optional Screenshot Packet Scope

Use this only if a visual reviewer asks for it.

Goal:

- Capture reviewer-facing visual evidence for the same combined harness path
  without adding runtime behavior or broadening product scope.

Suggested screenshot evidence:

- DM recovered Training Room with assigned saved character and encounter /
  current-turn evidence.
- Player recovered Training Room with assigned saved character, readiness
  summary, placed-token state, `Turn & Target`, and action feedback.
- Player Local Reset cleared local browser state.
- Player recovered the same backend session after Local Reset.

Non-goals:

- No production code changes.
- No new protocol commands.
- No replay/catch-up claims.
- No production auth claims.
- No new Character Library -> Runtime bridge behavior.
- No combat automation, spell automation, inventory, fog of war, monster AI,
  or broader D&D system scope.

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings: none.

Minor findings / cautions:

- Curated merge preparation should remain a git/review operation, not a new
  feature slice.
- Optional screenshots are visual evidence only. They must not be used to imply
  production deployment behavior, durable replay, or multi-process guarantees.
- The dirty worktree is the main operational risk.

## Final Recommendation

Proceed with curated merge preparation for the intended combined harness
evidence slice.

Next action:

- If the human wants a commit/PR now, explicitly request staging/commit/PR and
  confirm the exact file set.
- If the human wants visual evidence first, run a separate optional screenshot
  evidence packet for the existing combined harness path.
