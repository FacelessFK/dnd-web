# 0006: AI-Assisted Delivery Workflow

## Status

Proposed

## Context

DND-web is expected to continue through AI/Codex-assisted implementation. The
project has raw brainstorm material, current handoff docs, implementation
history, ADRs, and active operational docs.

AI agents are useful for this project only if they work in small scoped tasks
against current source-of-truth docs and implementation reality.

## Decision

Future delivery should use small AI-assisted implementation slices with clear
context, boundaries, validation, and reports.

Each task should:

- inspect relevant files before editing;
- trust current implementation and source-of-truth docs over raw brainstorm
  context;
- avoid broad rewrites;
- preserve product boundaries and ADRs;
- preserve English/Persian i18n support;
- keep DM-only actions role-gated server-side;
- avoid implementation scope creep from brainstorm docs;
- run practical validation;
- report changes, limitations, and blockers clearly.

## Source-Of-Truth Docs

Recommended starting points:

- `CODEX_CONTEXT.md`
- `docs/project-handoff.md`
- `docs/engineering/CURRENT_STATE.md`
- `docs/api-surface.md`
- `docs/persistence-boundaries.md`
- `docs/product/PRODUCT_BRIEF.md`
- `docs/domain/DOMAIN_MODEL.md`
- `docs/product/I18N_POLICY.md`
- `docs/delivery/TASK_TEMPLATE.md`

Raw context under `docs/context/` is archive/input material only.

## Consequences

- Future prompts should include context, goal, non-goals, files to inspect
  first, product/UX requirements, i18n requirements, technical boundaries,
  acceptance criteria, validation commands, and report format.
- Major multi-file tasks should be decomposed into independently reviewable
  slices.
- Validation failures must be reported with exact commands and exact blockers.
- AI-generated implementation must not claim features that are not implemented.
