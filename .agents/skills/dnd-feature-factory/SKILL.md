---
name: dnd-feature-factory
description: Use to orchestrate a small DND-web feature or polish slice through research, story/spec approval, guarded implementation, validation, review, and human merge decision.
---

# DND-web Feature Factory

Use this skill to guide a small DND-web feature or polish slice through the
repo-local Codex workflow. It coordinates existing skills; it does not replace
their detailed instructions.

Successful reference run: `8dca926 feat: clarify runtime character assignment
flow`.

Trigger examples:

- "run the DND feature factory"
- "use dnd-feature-factory"
- "take this slice through the factory"
- "orchestrate this DND-web task"
- "run intake, build, boundary review, and PR review"
- "factory workflow for this polish task"

## Workflow

### 1. Intake

- If the request is rough, broad, ambiguous, risky, or not already approved,
  use `dnd-task-intake` to produce a structured implementation prompt.
- For tiny docs-only or simple UI polish tasks, this lightweight path may skip
  story/spec only when the human explicitly approves a narrow implementation
  prompt.
- Never skip human approval before implementation.

### 2. Optional Read-Only Research

- Use `dnd-codebase-researcher` when the task area is unfamiliar, risky, or
  depends on existing patterns.
- Research must stay read-only.

### 3. Product Story Shaping

- Use `dnd-story-writer` when product behavior, acceptance criteria, edge
  cases, or out-of-scope boundaries are unclear.
- Stop for human story approval before technical planning.

### 4. Technical Brief

- Use `dnd-spec-writer` after an approved story when implementation needs a
  technical plan.
- Stop for human spec approval before implementation.

### 5. Scope Confirmation

- Restate the approved scope in one or two sentences.
- Classify the task: docs-only, UI-only, frontend, backend, protocol,
  DB/persistence, runtime, auth/security, i18n, or mixed.
- If the task is too broad, stop and ask for a narrower approved scope.

### 6. Pre-Implementation Boundary Review

Use or recommend `dnd-runtime-boundary-review` before implementation if the
story, spec, or plan touches:

- server authority;
- DM role gates;
- Character Library/runtime separation;
- realtime/outbox claims;
- auth/security claims;
- English/Persian i18n or LTR/RTL;
- product scope boundaries.

If the boundary review blocks the plan, stop and ask for a narrower or revised
human-approved task.

### 7. Guarded Implementation

- Use `dnd-build-with-tests`.
- Inspect relevant files before editing.
- Keep small, repo-native diffs.
- Reuse existing patterns.
- Add or update relevant tests.
- Run relevant validation.
- Do not broaden scope beyond the approved task.

### 8. Test Verification

- Use `dnd-test-verifier` after implementation when acceptance criteria
  coverage is non-trivial.
- If missing coverage is found, recommend or request approval for a focused
  test-only follow-up task.

### 9. Implementation Validation

- Use `dnd-implementation-validator` to compare the completed implementation
  against the approved story, acceptance criteria, and technical brief.
- If Critical or Important findings appear, stop and ask for human approval
  before creating a fix task.

### 10. Post-Implementation Boundary Review

- Use `dnd-runtime-boundary-review` after implementation for risky diffs or
  any task touching non-negotiable boundaries.
- If Critical or Important findings appear, stop and ask for human approval
  before creating a fix task.

### 11. PR Review

- Use `dnd-pr-reviewer` on the diff, commit, or implementation report before
  merge.
- If Critical or Important findings appear, stop and request changes.
- If the verdict is Approve or Approve with cautions, present the final merge
  recommendation.

### 12. Human Merge Decision

- Never claim merge is complete unless a human performs or explicitly requests
  the merge.
- Provide a suggested commit message only if needed.
- Make the next action concrete: approve prompt, implement, fix findings,
  merge, or choose a follow-up slice.

## DND-web Guardrails

- Browser is never authoritative.
- The server owns runtime/session state and validates commands.
- DM-only actions remain role-gated server-side.
- Character Library entries stay separate from live runtime/session overlays.
- Runtime HP, position, conditions, movement usage, encounter membership, scene
  placement, and DM overrides must not mutate reusable Character Library
  entries.
- Preserve English/Persian i18n and LTR/RTL behavior.
- Do not overclaim durable replay, stream cursor, catch-up, exactly-once
  delivery, or multi-process SSE semantics.
- Do not broaden into CRPG, monster AI, full automation, full spell systems,
  fog of war, broad inventory/ranged/death-save systems, or production auth.
- Keep current priority focused on Training Room Skirmish / Phase 6 playable
  DM-player product-flow polish unless a human explicitly changes the
  milestone.
- Do not create `CLAUDE.md`.

## Output Format

1. **Current workflow stage**
2. **Scope summary**
3. **Skill used or recommended**
4. **Human approval needed?**
5. **Validation status**
6. **Review status**
7. **Next action**
