---
name: dnd-task-intake
description: Use when turning rough DND-web goals, feature ideas, bugs, polish requests, or docs requests into safe Codex implementation prompts before coding starts.
---

# DND-web Task Intake

Use this skill to convert a rough request into a ready-to-paste Codex
implementation prompt. Do not implement the task directly when this skill is
invoked. First structure the request, then ask for human approval before any
coding begins.

Trigger examples:

- "turn this into a Codex prompt"
- "make a safe implementation prompt"
- "prepare the next task"
- "scope this feature"
- "plan this DND-web change"
- "before coding, structure this request"

## Intake Rules

- Keep the generated prompt narrow, safe, and production-quality.
- Preserve the current priority: Training Room Skirmish / Phase 6 playable
  DM-player product-flow polish unless a human explicitly changes the
  milestone.
- Prefer small implementation slices over broad rewrites.
- Call out files to inspect first; do not ask the implementer to read the
  whole codebase.
- Include non-goals, risks, validation, and final report expectations.
- End with a human approval checkpoint.

## Model Effort

Recommend:

- `medium` for docs-only, UI polish, small helpers, and small tests.
- `high` for DB schema, migrations, transactions, idempotency, outbox,
  auth/security, runtime data-model boundaries, and normal multi-file
  frontend/backend work.
- `extra high` only when several high-risk areas combine.

## Source-Of-Truth Defaults

Include the relevant subset in the generated prompt:

- `AGENTS.md`
- `CODEX_CONTEXT.md`
- `docs/engineering/CURRENT_STATE.md`
- `docs/project-handoff.md`
- `docs/api-surface.md`
- `docs/persistence-boundaries.md`
- `docs/product/PRODUCT_BRIEF.md`
- `docs/product/USER_FLOWS.md`
- `docs/product/I18N_POLICY.md`
- `docs/domain/DOMAIN_MODEL.md`
- `docs/delivery/PLAYABLE_MVP_PHASES.md`
- `docs/delivery/NEXT_MILESTONE.md`
- `docs/delivery/TASK_TEMPLATE.md`
- `docs/decisions/*`
- code, tests, and `packages/protocol` schemas as final truth when docs drift

## Non-Negotiable Boundaries

Always include these unless the human explicitly narrows the prompt to a
purely unrelated docs-only task:

- Browser is never authoritative.
- Server owns runtime/session state and validates commands.
- DM-only actions must remain server-side role gated.
- Character Library entries are reusable records and must remain separate from
  live runtime/session overlays.
- Runtime HP, position, conditions, movement usage, active encounter
  membership, scene placement, and DM overrides must never mutate reusable
  Character Library entries.
- Preserve English/Persian i18n and LTR/RTL behavior.
- Do not claim durable replay, stream cursor, catch-up, exactly-once delivery,
  or multi-process SSE semantics unless implemented.
- Do not broaden scope into full spell automation, monster AI, CRPG systems,
  fog of war, broad inventory/ranged/death-save systems, or production auth.
- Do not create `CLAUDE.md`.

## Prompt Template

Produce a prompt with these sections:

1. **Task title**
   - One precise line naming the slice.
   - Include recommended model effort.

2. **Goal**
   - State the single outcome.
   - Avoid bundled wishlist language.

3. **Product north star reminder**
   - DM-first, tabletop-oriented, server-authoritative D&D runtime and
     character product.
   - Visually rich/tactical direction is welcome, but not CRPG automation.

4. **Relevant source-of-truth docs to inspect**
   - List only the docs needed for the task.
   - Include `AGENTS.md` and `CODEX_CONTEXT.md` by default.

5. **Likely files or directories to inspect first**
   - Identify the smallest likely code/doc areas.
   - Use directories when exact files are unknown, such as `apps/web`,
     `apps/server`, `packages/protocol`, `packages/db`, or specific docs.

6. **Non-negotiable architecture boundaries**
   - Include the boundary list above, trimming only items truly irrelevant to a
     docs-only task.

7. **Non-goals / out of scope**
   - Explicitly block tempting expansions.
   - For current runtime work, usually exclude new protocol, combat automation,
     replay/catch-up, production auth, fog of war, monster AI, and broad D&D
     systems unless the human explicitly requested them.

8. **Risk checklist**
   - Include risks specific to the slice.
   - Always consider authority drift, i18n/RTL breakage, Character
     Library/runtime mutation leaks, overclaimed durability, and scope creep.

9. **Implementation constraints**
   - Inspect before editing.
   - Keep diffs small and repo-native.
   - Preserve existing validation patterns.
   - Never print `.env`, cookies, tokens, credentials, or secrets.
   - Do not edit unrelated docs or code.

10. **Validation commands**
    - Docs-only: `git diff --check`; add `corepack pnpm format:check` when
      cheap.
    - Frontend/UI: add relevant `corepack pnpm` lint/typecheck/test/build
      commands and smoke when the runtime path changes.
    - Server/protocol/DB: add server tests, root tests, typecheck, and DB-mode
      setup/migration notes when persistence is involved.
    - Require exact blocker reporting for skipped commands.

11. **Expected final report format**
    - Summary
    - Files changed
    - Behavior added or docs changed
    - Tests added/updated
    - Validation run
    - Risks / follow-ups
    - Any docs drift noticed

12. **Human approval checkpoint**
    - End by asking the human to approve the structured prompt before
      implementation starts.
    - State that no files should be changed until approval is given.

## Output Rule

Return only the structured implementation prompt plus a brief approval request.
Do not start implementation, create files, edit files, run tests, spawn agents,
or create follow-up skills unless the human approves a later implementation
task.
