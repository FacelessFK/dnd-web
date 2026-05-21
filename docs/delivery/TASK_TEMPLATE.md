# Codex Task Template

Use this template for future implementation prompts.

## Context

Summarize the current product and implementation reality. Link the exact source
docs the agent should trust first.

Recommended starting docs:

- `CODEX_CONTEXT.md`
- `docs/project-handoff.md`
- `docs/engineering/CURRENT_STATE.md`
- `docs/api-surface.md`
- `docs/persistence-boundaries.md`
- `docs/product/I18N_POLICY.md`

## Goal

State the single outcome this task must deliver.

## Non-Goals

List explicit scope boundaries. Include anything tempting from brainstorm docs
that must not be implemented in this slice.

## Files To Inspect First

List the smallest relevant files. Do not ask an agent to read the whole
codebase when targeted inspection is enough.

## Product/UX Requirements

Describe required behavior, user roles, success states, error states, and
guardrails. Keep DM authority and player intent boundaries explicit.

## i18n Requirements

State whether the slice adds or changes user-facing copy.

Required defaults:

- Preserve English/Persian support.
- Use the existing i18n direction for user-facing strings.
- Do not store localized labels as canonical IDs.
- Preserve LTR/RTL behavior.
- Do not auto-translate user-entered character data.

## Technical Boundaries

Call out protocol, runtime, persistence, auth, transaction, and SSE boundaries.
Be explicit about what must not be claimed.

Examples:

- Do not mutate Character Library entries with live session damage.
- Do not overclaim replay, cursor, catch-up, exactly-once delivery, or
  multi-process coordination.
- Keep DM-only actions role-gated server-side.

## Acceptance Criteria

List observable outcomes and edge cases. Include current limitations that must
remain honest.

## Validation Commands

Start with the practical set from `docs/codex-workflow.md`.

For many implementation tasks:

```bash
git diff --check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @dnd/server test
corepack pnpm --filter @dnd/web test
corepack pnpm --filter @dnd/web build
corepack pnpm --filter @dnd/web test:smoke
```

For docs-only cleanup, use at least:

```bash
git diff --check
corepack pnpm format:check
corepack pnpm lint
```

If validation is blocked, report the exact command, exact blocker, closest
equivalent run, and whether touched files were validated.

## Report Format

Use:

1. Commit-worthy status
2. Suggested commit message
3. Summary
4. Files changed
5. Behavior added
6. Tests added/updated
7. Docs updated
8. Validation results
9. Known limitations
10. Anything needed from the user
