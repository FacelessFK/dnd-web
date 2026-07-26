---
name: dnd-validate
description: After implementing a DND-web change, verify that acceptance criteria are actually covered by tests and that the implementation matches the approved story and spec. Reports gaps by severity. Does not edit production code or silently fix implementation.
---

# DND-web Implementation Validator

Run after implementation, before review. Verify only — do not edit production
code, fix the implementation, or start a follow-up build.

## Inputs

The approved story and acceptance criteria, the technical brief if one exists,
the diff or implementation report, and the validation output.

If no story exists, validate against the stated task and say that acceptance
criteria were informal.

## Part 1 — Acceptance Criteria Coverage

Map **each** criterion to one of:

- **Covered** — name the test file and test case that asserts it.
- **Partially covered** — say what is asserted and what is not.
- **Not covered** — say what a test would need to assert.
- **Not testable here** — e.g. visual/RTL layout. Say how it was verified
  instead (browser smoke, manual pass, source inspection).

Do not accept "the code does it" as coverage. Coverage means an assertion.

## Part 2 — Implementation Match

Compare the change against the approved scope:

- **Missing behavior** — in the story, absent from the code.
- **Wrong behavior** — present but not as specified.
- **Out-of-scope behavior** — in the code, not in the story. Flag it even if it
  is an improvement; scope creep is a finding.

## Part 3 — Repo-Specific Checks

- **i18n:** every new `en` key has an `fa` counterpart, and no user-facing
  string was hardcoded outside `apps/web/lib/i18n.tsx`.
- **Logic placement:** new `/runtime` derivations live in
  `apps/web/lib/runtime-cockpit-helpers.ts` with tests, not inline in
  `runtime-cockpit.tsx`.
- **Role gates:** DM-only behavior is enforced server-side, and there is a
  server test proving a player is rejected.
- **Recovery:** if the change adds state a user would expect to survive refresh,
  confirm it is rebuilt from a read model and that a test or smoke step covers
  it.
- **Boundary:** no live runtime state writes back into a Character Library
  entry.

## Part 4 — Validation Honesty

Check the reported validation against what was actually run:

- Were `format:check`, `lint`, `typecheck`, and the relevant tests run?
- Was a browser smoke needed and skipped? Say so.
- Were results reported accurately, including failures?

A change is not "validated" because validation was described.

## Report

Group by severity — **Blocker**, **Risk**, **Note**, **Uncertainty** — then give
a verdict: `ready for review`, `ready with follow-ups`, or `needs rework`, with
the specific next action for each blocker.
