---
name: dnd-review
description: Pre-merge review of a DND-web diff, PR, or implementation report against the full project checklist - scope, product direction, server authority, DM gates, library/runtime separation, i18n, accessibility, tests, docs drift. Review-only, broader than dnd-boundary-review.
---

# DND-web Pre-Merge Review

Review-only. Do not patch code. Cite exact file paths and line numbers. Mark
opinion clearly as opinion, and list missing evidence as uncertainty rather than
guessing.

`dnd-boundary-review` covers the non-negotiable guardrails in depth; run it
first for risky diffs. This skill is the broader pre-merge pass.

## Checklist

### Scope

- Does the diff match the approved task, and nothing more?
- Are there unrelated reformats, file moves, or drive-by refactors?
- Are docs-only tasks free of runtime code changes?

### Product direction

- Does it keep the product DM-first and tabletop-oriented rather than drifting
  toward a CRPG or full automation?
- Does it make the Training Room Skirmish flow easier or harder to run?
- Does it hide a known MVP limit behind demo-only copy?

### Server authority and DM gates

- Browser renders, server decides. Any client-side outcome determination?
- Every DM-only behavior gated in `apps/server`, with a test proving a player is
  rejected?

### Character Library / runtime separation

- No live HP, position, condition, movement-usage, encounter-membership, or DM
  override writes back into a Character Library entry.
- Runtime character commands and library commands stay on their own endpoints.

### Realtime / persistence / auth claims

- No new claim of replay, stream cursors, catch-up, exactly-once delivery,
  cold-boot redelivery, or multi-process coordination.
- Auth still described as an MVP.

### i18n and RTL

- New copy lives in `apps/web/lib/i18n.tsx`, present in both `en` and `fa`.
- Canonical IDs are not localized; user-entered data is not auto-translated.
- Layout uses logical properties where RTL matters.

### Accessibility

- Interactive elements are real buttons/inputs with accessible names.
- Meaning is not carried by color alone — the existing panels pair tone with
  text.
- Keyboard reachability preserved, especially on the tactical board, which
  already has roving focus and arrow/Home/End navigation.

### Tests and validation honesty

- New logic has assertions, in the right test file.
- Reported validation matches what was actually run; failures are disclosed.

### Docs drift

- Does this change make `docs/engineering/CURRENT_STATE.md`,
  `docs/api-surface.md`, or `CODEX_CONTEXT.md` inaccurate?
- Those three are kept current per slice and should be updated with the change.

## Report

Findings grouped **Blocker / Risk / Note / Uncertainty**, each with a file
reference and a concrete fix. End with `approve`, `approve with cautions`, or
`request changes`, and state what a human still needs to decide.
