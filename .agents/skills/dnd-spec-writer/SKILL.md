---
name: dnd-spec-writer
description: Use to convert an approved DND-web user story and optional codebase research findings into a short technical brief before implementation.
---

# DND-web Spec Writer

Use this skill to turn an approved DND-web user story, acceptance criteria, and
optional `dnd-codebase-researcher` findings into a short technical brief for
implementation. Produce the brief only; do not edit files, implement code, or
start the build workflow.

Trigger examples:

- "write a technical brief"
- "turn this story into a spec"
- "spec this DND-web slice"
- "technical brief before implementation"
- "plan this approved story"
- "prepare implementation brief"

## Inputs

Use the provided:

- approved user story and acceptance criteria;
- optional `dnd-codebase-researcher` findings;
- optional human constraints, risks, or non-goals.

If the story implies server, protocol, DB, auth, outbox, or runtime
architecture changes that were not explicitly approved, stop and ask for human
approval before writing an implementation-ready brief.

## Spec Rules

- Produce technical brief output only.
- Never edit files, create files, patch code, or implement code.
- Never create broad architecture rewrites.
- Prefer existing patterns, source-of-truth docs, and current code reality.
- Call out uncertainty instead of guessing.
- Keep the brief short enough for one narrow DND-web implementation slice.
- Require human approval before implementation begins.
- Require `dnd-runtime-boundary-review` before implementation when the spec
  touches runtime authority, DM gates, Character Library/runtime separation,
  i18n, realtime/outbox claims, auth/security, or product scope boundaries.
- Do not create `CLAUDE.md`.

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
- Keep current priority focused on Training Room Skirmish / Phase 6 playable
  DM-player product-flow polish unless a human explicitly changes the
  milestone.

## Output Format

1. **Brief title**

2. **Approved story summary**
   - Summarize the approved user story and acceptance criteria.

3. **Implementation scope**
   - In scope.
   - Out of scope.

4. **Existing patterns/files to reuse**
   - Name relevant patterns or file areas from the story/research findings.
   - Do not prescribe broad rewrites.

5. **Data/read-model assumptions**
   - What can be derived from authoritative server/read-model state.
   - What must not be inferred from browser-local state.

6. **UI changes, if any**
   - Default to none unless the story requires UI behavior.

7. **Server/API/protocol changes, if any**
   - Default to `none` unless explicitly scoped and approved.

8. **Persistence/DB/outbox/auth changes, if any**
   - Default to `none` unless explicitly scoped and approved.

9. **i18n/RTL considerations**
   - Include English/Persian and LTR/RTL expectations when copy or layout is
     affected.

10. **Tests required**
    - Success cases.
    - Failure or blocked states.
    - Edge cases.

11. **Runtime/product boundary risks**
    - Server authority.
    - DM authority.
    - Character Library/runtime separation.
    - Realtime/outbox honesty.
    - Auth/security claims.
    - i18n/RTL.
    - Scope creep.

12. **Validation plan**
    - Include `git diff --check`.
    - Include relevant `corepack pnpm` checks based on touched areas.
    - If validation may be blocked, require exact blocker reporting.

13. **Open questions**
    - List missing evidence or human decisions needed before implementation.

14. **Recommended next skill**
    - `dnd-runtime-boundary-review` for risky specs.
    - `dnd-build-with-tests` for approved implementation.
    - `dnd-feature-factory` for full workflow orchestration.

## Output Rule

Return only the technical brief in the format above plus a human approval
checkpoint. Do not implement, create files, edit files, run validation as if
code changed, or start another workflow until the human explicitly approves the
implementation task.
