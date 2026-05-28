---
name: dnd-codebase-researcher
description: Use for read-only exploration of DND-web code before planning or implementation.
---

# DND-web Codebase Researcher

Use this skill to map the relevant code, docs, helpers, tests, patterns, risks,
and open questions for a proposed DND-web task before planning or
implementation. Research only; do not edit files or implement fixes.

Trigger examples:

- "research this area before planning"
- "map the relevant code"
- "explore before build"
- "find existing patterns"
- "inspect the codebase for this task"
- "read-only codebase research"

## Research Rules

- Perform read-only exploration only.
- Never edit files, create files, patch code, or implement fixes.
- Never run destructive commands.
- Inspect the smallest relevant set of files.
- Prefer targeted `rg` searches and focused file reads over broad codebase
  reading.
- Inspect current docs and code before making claims.
- Summarize uncertainty instead of guessing.
- Never print `.env`, cookies, tokens, credentials, or secrets.
- Do not create `CLAUDE.md`.

## What To Inspect

Start with `AGENTS.md` and `CODEX_CONTEXT.md`, then choose only the relevant
source-of-truth docs, apps, packages, helpers, and tests for the proposed task.
Use code, tests, and `packages/protocol` schemas as final truth when docs drift.

For runtime work, usually inspect the smallest useful subset of:

- `apps/web/app/runtime/`
- `apps/web/lib/i18n.tsx`
- `apps/web/lib/runtime-cockpit-helpers.ts`
- `apps/web/lib/runtime-cockpit-helpers.test.ts`
- `apps/server` and `packages/protocol` only when existing commands, schemas,
  or read models must be understood.

## Guardrails To Preserve

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

1. **Question / task being researched**
   - Restate the proposed task and classify it if possible: docs-only,
     UI-only, frontend, backend, protocol, DB/persistence, runtime,
     auth/security, i18n, or mixed.

2. **Relevant files**
   - Group by app, package, or domain.
   - Include why each file matters.
   - Note files intentionally not inspected when they are outside scope.

3. **Existing patterns to follow**
   - UI patterns.
   - Helper patterns.
   - Test patterns.
   - i18n patterns.
   - Server/protocol patterns if relevant.

4. **Authoritative data sources / read models**
   - Explain what state is safe to derive from.
   - Call out what must not be inferred from browser-local state.
   - Identify any protocol schemas or server read models that are final truth.

5. **Risks and boundaries**
   - Server authority.
   - DM authority.
   - Character Library/runtime separation.
   - Realtime/outbox honesty.
   - i18n and RTL/LTR.
   - Scope creep.

6. **Tests likely affected**
   - Name likely test files, smoke checks, or validation commands.
   - If no tests are likely needed, explain why.

7. **Unknowns / open questions**
   - List missing evidence, ambiguous scope, or decisions needing human
     approval.

8. **Recommended next skill**
   - `dnd-task-intake` when the task still needs a safe implementation prompt.
   - `dnd-runtime-boundary-review` when guardrails may be touched.
   - `dnd-build-with-tests` when the task is narrow, approved, and ready to
     implement.
   - `dnd-pr-reviewer` when reviewing a diff or report before merge.
   - `dnd-feature-factory` when a small slice should move through the full
     intake, approval, build, validation, review, and merge-decision workflow.

## Output Rule

Return only the research findings in the format above. Do not implement,
create follow-up files, run validation as if code changed, or start another
workflow unless the human explicitly asks.
