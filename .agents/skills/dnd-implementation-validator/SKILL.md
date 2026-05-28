---
name: dnd-implementation-validator
description: Use after implementation to compare a completed DND-web change against the approved story, acceptance criteria, and technical brief, and report gaps by severity.
---

# DND-web Implementation Validator

Use this skill after implementation to validate whether the completed change
matches the approved story, acceptance criteria, and technical brief. Validate
only; do not edit files, fix code directly, or start a follow-up build.

Trigger examples:

- "validate this implementation"
- "compare implementation to story"
- "check this against the technical brief"
- "implementation validator"
- "did this satisfy the acceptance criteria?"
- "validate before PR review"

## Inputs

Use the provided:

- approved user story and acceptance criteria;
- optional technical brief from `dnd-spec-writer`;
- implementation report or diff summary;
- changed files;
- `dnd-test-verifier` output if available;
- validation output.

If evidence is missing, list it as uncertainty instead of guessing. Do not
invent acceptance criteria, implementation facts, test results, or validation
results.

## Validation Rules

- Validate only.
- Never edit files, create files, patch code, or fix code directly.
- Inspect the approved story, acceptance criteria, technical brief,
  implementation report, changed files, test report, and validation output
  before making claims.
- Compare what was requested against what changed.
- Report missing behavior, wrong behavior, out-of-scope behavior, missing
  tests, boundary risks, and docs drift.
- Recommend the next action without implementing it.
- Do not create `CLAUDE.md`.

## What To Check

- Every acceptance criterion.
- Success path behavior.
- Failure or blocked states.
- Relevant edge cases.
- Whether the implementation stayed inside approved scope.
- Whether tests match the promised behavior.
- Whether validation commands are appropriate for the risk and touched areas.
- Whether UI copy and i18n changed consistently.
- Whether browser-local state was accidentally treated as authoritative.
- Whether server, protocol, persistence, auth, outbox, or runtime architecture
  changed without approval.

## DND-web Guardrails

- Browser is never authoritative.
- The server owns runtime/session state and validates commands.
- DM-only actions remain server-side role gated.
- Character Library entries stay separate from runtime overlays.
- Runtime HP, position, conditions, movement usage, encounter membership, scene
  placement, and DM overrides must not mutate reusable Character Library
  entries.
- Preserve English/Persian i18n and LTR/RTL behavior.
- Do not overclaim durable replay, stream cursor, catch-up, exactly-once
  delivery, or multi-process SSE semantics.
- Do not broaden into CRPG, monster AI, full automation, full spell systems,
  fog of war, broad inventory/ranged/death-save systems, or production auth.

## Output Format

1. **Verdict**
   - `Validated`
   - `Validated with cautions`
   - `Request changes`
   - `Blocked`

2. **Critical findings**
   - Must fix before merge.

3. **Important findings**
   - Should fix before merge.

4. **Minor findings**
   - Nice to have.

5. **Acceptance criteria validation**
   - Criterion.
   - Implemented?
   - Tested?
   - Evidence.
   - Notes.

6. **Scope review**
   - In-scope changes.
   - Out-of-scope changes, if any.

7. **Boundary review summary**
   - Server authority.
   - DM gates.
   - Character Library/runtime separation.
   - Realtime/outbox/auth claims.
   - i18n/RTL.
   - Product scope.

8. **Validation evidence**
   - Commands reported or inspected.
   - Missing, blocked, or overclaimed validation.

9. **Docs drift / follow-ups**
   - Note docs drift revealed by the implementation or review.

10. **Recommended next action**
    - Approve.
    - Run `dnd-build-with-tests` for a fix.
    - Run `dnd-test-verifier`.
    - Run `dnd-runtime-boundary-review`.
    - Run `dnd-pr-reviewer`.
    - Clarify story/spec.

## Output Rule

Return only the implementation validation in the format above. Do not
implement, edit files, create tests, or run fixes unless the human explicitly
approves a follow-up implementation task.
