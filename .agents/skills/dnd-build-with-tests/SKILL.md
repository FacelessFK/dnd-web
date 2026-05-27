---
name: dnd-build-with-tests
description: Use when implementing an approved narrow DND-web task with tests and validation, after the task has been scoped and approved.
---

# DND-web Build With Tests

Use this skill to implement an approved, narrow DND-web task. If the request is
broad, ambiguous, risky, or not yet approved, stop and use or recommend
`dnd-task-intake` first.

Trigger examples:

- "implement this approved task with tests"
- "use dnd-build-with-tests"
- "build this narrow DND-web change"
- "apply this approved prompt"
- "ship this small slice"
- "make this implementation with validation"

## 1. Confirm Approved Scope

- Restate the task in one or two sentences.
- Classify the task: docs-only, UI-only, frontend, backend, protocol,
  DB/persistence, runtime, auth/security, i18n, or mixed.
- Identify the approved files, directories, non-goals, and validation
  expectations.
- If scope is unclear or too broad, do not edit. Ask for approval on a narrower
  prompt or use `dnd-task-intake`.

## 2. Inspect Before Editing

- Read `AGENTS.md` and `CODEX_CONTEXT.md`.
- Read the relevant source-of-truth docs for the touched area.
- Inspect 2-3 similar existing features or tests before editing.
- Identify the files to change and the boundaries they touch.
- For multi-file or code work, read `docs/codex-workflow.md`.

## 3. Plan A Small Diff

- Provide a short implementation plan before editing.
- Keep changes narrow, repo-native, and aligned with existing patterns.
- Avoid unrelated refactors, file moves, broad rewrites, and cosmetic churn.
- Explicitly list non-goals.
- Preserve the current Training Room Skirmish / Phase 6 playable DM-player
  priority unless a human approved a different milestone.

## 4. Preserve DND-web Guardrails

- Browser is never authoritative.
- Server owns runtime/session state and validates commands.
- DM-only actions stay role-gated server-side.
- Character Library entries remain separate from runtime overlays.
- Runtime HP, position, conditions, movement usage, encounter membership, scene
  placement, and DM overrides must not mutate reusable Character Library
  entries.
- Preserve English/Persian i18n and LTR/RTL behavior.
- Do not overclaim durable replay, stream cursor, catch-up, exactly-once
  delivery, or multi-process SSE semantics.
- Do not broaden scope into CRPG, monster AI, full automation, fog of war, full
  spell systems, broad inventory/ranged/death-save systems, or production auth.
- Never print `.env`, cookies, tokens, credentials, or secrets.
- Do not create `CLAUDE.md`.

## 5. Implement With Tests

- Add or update the smallest relevant tests for the changed behavior.
- Prefer existing test patterns, fixtures, helpers, and test data builders.
- Cover success, failure, and at least one relevant edge case when applicable.
- For docs-only changes, do not add runtime tests.
- For UI changes, preserve existing i18n, accessibility, and interaction
  patterns.
- For server/runtime changes, verify protocol schemas, role gates, command
  validation, idempotency/persistence boundaries, and recovery expectations as
  relevant.

## 6. Run Validation

- Always run `git diff --check`.
- For docs-only changes, run `corepack pnpm format:check` when cheap and
  appropriate.
- For code changes, choose the relevant validation set from `AGENTS.md`,
  `CODEX_CONTEXT.md`, and `docs/codex-workflow.md`.

Typical validation options:

- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm --filter @dnd/server test`
- `corepack pnpm --filter @dnd/web test`
- `corepack pnpm --filter @dnd/web build`
- `corepack pnpm --filter @dnd/web test:smoke`

If validation is blocked, report the exact command, exact blocker, closest
equivalent run, and what remains unvalidated.

## 7. Review Before Final Response

- Use or recommend `dnd-runtime-boundary-review` for risky plans or diffs
  involving server authority, DM gates, Character Library/runtime separation,
  realtime/outbox claims, auth/security, i18n, or scope creep.
- Summarize the diff.
- Call out docs drift or follow-up work.
- Do not claim success beyond what validation proved.

## Final Report Format

1. Summary
2. Files changed
3. Tests/validation run
4. Risks / follow-ups
5. Any docs drift noticed
6. Boundary review notes, if applicable
