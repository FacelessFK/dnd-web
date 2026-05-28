---
name: dnd-test-verifier
description: Use after implementation to verify that approved DND-web acceptance criteria are covered by appropriate tests and validation.
---

# DND-web Test Verifier

Use this skill after implementation to review whether the approved story,
acceptance criteria, and technical brief are covered by tests. Review test
coverage only; do not edit production code, silently fix implementation, or
start a build workflow.

Trigger examples:

- "verify tests cover this story"
- "check acceptance criteria coverage"
- "test verifier"
- "verify this implementation has enough tests"
- "map criteria to tests"
- "what tests are missing?"

## Inputs

Use the provided:

- approved user story and acceptance criteria;
- optional technical brief from `dnd-spec-writer`;
- implementation report or diff summary;
- list of changed files;
- validation output.

If evidence is missing, mark it as uncertainty. Do not invent test coverage,
business rules, authority semantics, or validation results.

## Verification Rules

- Review test coverage only.
- Never edit production code.
- Never silently fix implementation.
- Inspect the approved story, technical brief, implementation report, changed
  files, and existing tests before making claims.
- Map each acceptance criterion to existing coverage, newly added coverage,
  missing coverage, or unclear/untestable status.
- Recommend focused test additions when coverage is missing.
- If a human approves a follow-up, produce a test-only implementation prompt
  rather than modifying production code directly.
- Be honest when a criterion cannot be tested without more instrumentation,
  product clarification, or implementation evidence.
- Do not create `CLAUDE.md`.

## Coverage Checklist

Check for:

- success path coverage;
- failure or blocked state coverage;
- relevant edge cases;
- English/Persian i18n and RTL/LTR behavior when copy or layout changed;
- server authority and DM authority behavior when runtime behavior changed;
- Character Library/runtime separation when relevant;
- honest realtime, recovery, replay, and outbox wording when relevant.

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
   - `Covered`
   - `Covered with cautions`
   - `Missing tests`
   - `Blocked by unclear criteria`

2. **Acceptance criteria coverage table**
   - Criterion.
   - Coverage status.
   - Test file / test name if known.
   - Notes.

3. **Missing test recommendations**
   - Name the smallest focused tests that should be added.
   - Prefer existing test files, helpers, and fixtures when known.

4. **Untestable / unclear criteria**
   - Explain what clarification or instrumentation would be needed.

5. **Validation review**
   - Compare reported validation to the task risk and touched areas.
   - Call out missing, blocked, or overclaimed validation.

6. **Recommended next action**
   - Approve test coverage.
   - Run `dnd-build-with-tests` for a test-only follow-up.
   - Clarify story/spec.
   - Run `dnd-pr-reviewer`.

## Output Rule

Return only the test coverage review in the format above. Do not implement,
edit production code, create test files, or run a fix unless the human
explicitly approves a follow-up implementation task.
