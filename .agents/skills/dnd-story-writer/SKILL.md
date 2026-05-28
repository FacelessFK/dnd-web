---
name: dnd-story-writer
description: Use to convert rough DND-web feature ideas or codebase research findings into a user story, acceptance criteria, edge cases, out-of-scope items, and open questions before technical planning.
---

# DND-web Story Writer

Use this skill to turn a rough DND-web feature idea, polish request, user
feedback, or `dnd-codebase-researcher` findings into clear product/story
output before technical planning. Produce product language only; do not
implement code or write technical design.

Trigger examples:

- "write a user story"
- "turn this idea into acceptance criteria"
- "story for this DND-web feature"
- "define product behavior before spec"
- "clarify this polish request"
- "write acceptance criteria for this slice"

## Inputs

Use any provided:

- rough feature idea or polish request;
- `dnd-codebase-researcher` findings;
- product constraints, user feedback, or manual QA notes.

If intent is unclear, ask open questions instead of guessing. Do not invent
business rules, D&D rules, automation behavior, or authority semantics.

## Story Rules

- Produce product/story output only.
- Never implement code, patch files, or run implementation commands.
- Never write technical design, architecture, or file-level implementation
  plans.
- Use plain product language a human stakeholder can review.
- Keep the story narrow enough for one small DND-web slice.
- Preserve the current Training Room Skirmish / Phase 6 playable DM-player
  priority unless a human explicitly changes the milestone.
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

## Output Format

1. **User story**
   - Use: "As a `<role>`, I want `<behavior>`, so that `<outcome>`."
   - Prefer DM, Player, or reviewer roles when relevant.

2. **Acceptance criteria**
   - Must be testable.
   - Include success cases.
   - Include failure, blocked, empty, loading, or unavailable states where
     relevant.
   - Include English/Persian i18n and RTL/LTR criteria when user-facing copy or
     layout changes.
   - Include server authority and DM authority criteria when runtime behavior
     is involved.
   - Keep criteria observable; avoid naming files, functions, or technical
     implementation details.

3. **Edge cases worth thinking about**
   - List product and UX edge cases that may affect the story.
   - Mark uncertainty when evidence is missing.

4. **Out of scope**
   - Explicitly exclude tempting expansions.
   - For runtime work, usually exclude protocol/server/persistence/auth/outbox
     changes, replay/catch-up claims, production auth, fog of war, monster AI,
     full spell systems, and broader D&D automation unless a human approved
     them.

5. **Open questions**
   - Ask only questions needed to avoid inventing product behavior.
   - Keep questions answerable by a human product/engineering reviewer.

6. **Recommended next skill**
   - Usually `dnd-spec-writer` once it exists.
   - Use `dnd-task-intake` when the story is ready to become a safe
     implementation prompt.
   - Use `dnd-runtime-boundary-review` when authority, runtime state,
     Character Library/runtime separation, realtime/outbox claims, auth, i18n,
     or scope boundaries are risky.

## Output Rule

Return only the story output in the format above. Do not start implementation,
write a technical plan, create files, edit files, or invoke build/review
workflows unless the human explicitly asks for a later task.
