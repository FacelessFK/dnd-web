# DND-web Codex Instructions

This is the durable Codex-native instruction file for this repository. Do not
create `CLAUDE.md`.

## Communication

- Report to the user in Persian.
- Keep code, file names, command names, commit messages, and implementation
  prompts in English.
- Inspect relevant files before editing. For multi-file or code work, read
  `docs/codex-workflow.md`.
- Do not ask for the whole codebase; request the smallest specific files only
  when local inspection is not enough.

## Project Identity

DND-web is a browser-based D&D tabletop runtime and character product. It should
be visually rich, tactical, and eventually presentation-inspired by
Diablo/Hades, while staying DM-first and tabletop-oriented.

The server owns runtime truth. Players submit structured intent. The DM remains
the final authority through explicit server-side controls.

This is not a CRPG, monster AI system, full D&D automation engine, or production
auth/deployment project unless a human explicitly changes that scope.

## Non-Negotiable Boundaries

- Browser state is never authoritative.
- The server owns runtime/session state and validates commands.
- DM-only actions must remain role-gated server-side.
- Character Library entries are reusable records and must stay separate from
  live runtime/session overlays.
- Runtime HP, position, conditions, movement usage, active encounter
  membership, scene placement, and DM overrides must never mutate reusable
  Character Library entries.
- Preserve English/Persian i18n and LTR/RTL behavior.
- Do not claim durable replay, stream cursors, catch-up, exactly-once delivery,
  or multi-process SSE semantics unless they are implemented.
- Do not broaden scope into full spell automation, monster AI, CRPG systems, fog
  of war, broad inventory/ranged/death-save systems, or production auth.
- Keep the current priority focused on polishing the playable Training Room
  Skirmish / Phase 6-style DM-player product flow unless a human explicitly
  changes the milestone.

## Stack And Surfaces

- TypeScript pnpm monorepo.
- `apps/web`: Next.js / React / Tailwind surfaces for `/runtime`,
  `/characters`, and `/login`.
- `apps/server`: Node/TypeScript authoritative HTTP/SSE runtime.
- `packages/protocol`: Zod protocol schemas.
- `packages/shared`: shared domain models.
- `packages/rules`: deterministic rules helpers.
- `packages/db`: Drizzle/Postgres schema, adapters, migrations, and unit of
  work boundaries.

## Source Of Truth Order

Trust current implementation and current-state docs over older planning docs.
When docs conflict with code, code and protocol schemas are final truth.

1. `CODEX_CONTEXT.md`
2. `docs/engineering/CURRENT_STATE.md`
3. `docs/project-handoff.md`
4. `docs/api-surface.md`
5. `docs/persistence-boundaries.md`
6. `docs/product/PRODUCT_BRIEF.md`
7. `docs/product/USER_FLOWS.md`
8. `docs/product/I18N_POLICY.md`
9. `docs/domain/DOMAIN_MODEL.md`
10. `docs/delivery/PLAYABLE_MVP_PHASES.md`
11. `docs/delivery/TASK_TEMPLATE.md`
12. `docs/decisions/*`
13. Code, tests, and `packages/protocol` schemas as final truth when docs drift.

Treat these as stale, drift-prone, historical, or lower-priority unless a human
explicitly asks to update them:

- `PRD.md`
- `ROADMAP.md`
- `README.md` references to `docs/delivery/NEXT_MILESTONE.md`
- `docs/delivery/NEXT_MILESTONE.md`
- `docs/context/*`
- broad brainstorm material

Do not use stale docs as stronger truth than current state docs or code.

## Codex Working Rules

- Make small, safe, repo-native diffs.
- Avoid broad rewrites, file moves, or documentation cleanups outside the
  requested scope.
- Do not change runtime code during docs-only tasks.
- Do not create Codex skills, orchestrators, or subagents unless explicitly
  requested.
- Preserve server-side role gates for all DM-only behavior.
- Keep Character Library/runtime separation intact.
- Preserve i18n patterns, English/Persian copy expectations, and RTL/LTR
  behavior.
- Never print `.env` contents, credentials, cookies, tokens, or secrets.
- Use `corepack pnpm guard:sensitive-files` before committing when staged
  changes may include env or credential-like paths. Use
  `node scripts/guards/check-sensitive-files.mjs --all-changed` when checking
  all changed files. This deterministic guard is part of the repo safety gates,
  but it is not a substitute for never printing secrets.
- For DB mode, use `SERVER_PERSISTENCE_MODE=db` and `DATABASE_URL`, and apply
  `packages/db/migrations/` before DB-mode verification.
- Character Library auth is an MVP using opaque HttpOnly-cookie sessions and
  user-owned DB rows. Do not describe it as full production account security.
- Portrait uploads are MVP data URLs. Do not claim production asset storage.
- PDF export uses local project assets/templates and a simple fallback.

## Repo-Local Codex Skills

- Repo-local Codex skills live under `.agents/skills/<skill-name>/SKILL.md`
  unless a future repo convention replaces this location.
- Use `dnd-codebase-researcher` for read-only exploration before planning or
  implementation, especially when a task area is unfamiliar or implementation
  risk depends on existing patterns. It must not edit files, implement fixes,
  or run destructive commands. It maps relevant files, existing patterns,
  authoritative read models, risks, likely tests, unknowns, and the recommended
  next skill before `dnd-task-intake` or `dnd-build-with-tests`.
- Use `dnd-story-writer` before technical planning when product behavior or
  acceptance criteria are unclear. It turns rough DND-web feature ideas or
  `dnd-codebase-researcher` findings into a user story, acceptance criteria,
  edge cases, out-of-scope items, and open questions. It is product/story-only:
  do not use it to implement code, write technical design, or create file-level
  implementation plans. If business or product intent is unclear, it should
  produce open questions instead of inventing rules.
- Use `dnd-spec-writer` to turn an approved user story and optional
  `dnd-codebase-researcher` findings into a short technical brief before
  implementation. It must not edit files, implement code, or create broad
  architecture rewrites. It defines scope, existing patterns to reuse,
  data/read-model assumptions, UI/API/runtime implications, tests, risks,
  validation plan, open questions, and the recommended next skill. It requires
  human approval before implementation begins, and should recommend
  `dnd-runtime-boundary-review` first when the spec touches runtime authority,
  DM gates, Character Library/runtime separation, i18n, realtime/outbox claims,
  auth/security, or product scope boundaries.
- Use `dnd-task-intake` before implementation when a user request is rough,
  broad, ambiguous, risky, or needs to become a safe Codex implementation
  prompt.
- When `dnd-task-intake` is invoked, do not implement immediately. Produce a
  structured prompt and wait for human approval before changing files.
- Use `dnd-runtime-boundary-review` before implementation for risky plans and
  after implementation for risky diffs or PR summaries that may touch server
  authority, DM role gates, Character Library/runtime separation,
  realtime/outbox claims, auth/security claims, English/Persian i18n, LTR/RTL
  behavior, or scope creep toward CRPG/full automation/monster AI/full spell
  systems/fog of war/production auth.
- `dnd-runtime-boundary-review` is review-only. Do not use it to directly fix
  code unless a human explicitly approves a follow-up implementation task.
- Use `dnd-build-with-tests` only after a task has been scoped and approved.
  It is for narrow DND-web implementation work with inspect-before-edit, small
  repo-native diffs, existing patterns, relevant tests, relevant validation,
  and a clear final report.
- Do not use `dnd-build-with-tests` to broaden scope beyond the approved task.
  If the request is rough, broad, ambiguous, or risky, use `dnd-task-intake`
  first; if the plan or diff touches server authority, DM role gates,
  Character Library/runtime separation, realtime/outbox claims, auth/security,
  i18n, or product scope boundaries, use `dnd-runtime-boundary-review` before
  and/or after implementation.
- Use `dnd-test-verifier` after implementation to verify that approved user
  story acceptance criteria are covered by tests and validation. It must not
  edit production code or silently fix implementation. It maps each criterion
  to existing, new, missing, or unclear test coverage, and may recommend
  missing tests or a follow-up test-only prompt. Use it before
  `dnd-pr-reviewer` when acceptance-criteria coverage is non-trivial.
- Use `dnd-implementation-validator` after implementation to compare the
  completed change against the approved user story, acceptance criteria, and
  technical brief. It must not edit files or fix code directly. It reports
  missing behavior, wrong behavior, out-of-scope behavior, missing tests,
  boundary risks, docs drift, and validation evidence grouped by severity. Use
  it after `dnd-test-verifier` when a story/spec exists, and before
  `dnd-pr-reviewer`.
- Use `dnd-pr-reviewer` before merge to review DND-web diffs, PR summaries, or
  implementation reports against the broader project checklist: scope and scope
  creep, product north star and DM-first tabletop direction, server authority
  and DM role gates, Character Library/runtime separation, realtime/outbox/auth
  claims, English/Persian i18n, RTL/LTR, accessibility, tests and validation
  honesty, and docs drift. This skill is review-only and must not directly edit
  code. It complements `dnd-runtime-boundary-review`: boundary review focuses
  on non-negotiable runtime/product guardrails, while PR review is the broader
  pre-merge review.
- Use `dnd-feature-factory` to orchestrate a small Training Room Skirmish /
  Phase 6-style polish slice, or a similarly narrow approved task, through
  `dnd-task-intake`, human approval, optional pre-build
  `dnd-runtime-boundary-review`, `dnd-build-with-tests`, optional post-diff
  boundary review, `dnd-pr-reviewer`, and a human merge decision. This skill is
  workflow-only: it must not skip human approval checkpoints, broaden scope
  into CRPG/full automation/monster AI/full spell systems/fog of
  war/production auth, or bypass DM/server-authoritative boundaries.
- Future skills should stay small, focused, and instruction-only unless a human
  explicitly asks for scripts, assets, or references.

## Model Effort Guidance

- `medium`: docs-only tasks, UI polish, small helper changes, small tests.
- `high`: DB schema, migrations, transactions, idempotency, outbox,
  auth/security, runtime data-model boundaries, and normal multi-file
  frontend/backend work.
- `extra high`: only when one task combines several high-risk areas such as DB
  schema plus transactions plus auth/security or data-model changes.

## Validation

For docs-only changes, run:

- `git diff --check`

For code changes, use the practical validation list from `CODEX_CONTEXT.md` and
`docs/codex-workflow.md`, including as much as is relevant:

- `git diff --check`
- `corepack pnpm format:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm --filter @dnd/server test`
- `corepack pnpm --filter @dnd/web test`
- `corepack pnpm --filter @dnd/web build`
- `corepack pnpm --filter @dnd/web test:smoke`

If validation is blocked, report the exact command, exact blocker, closest
equivalent run, and whether touched files were validated.

## Response Format

For task completion, report:

1. Summary
2. Files changed
3. Validation run
4. Risks / follow-ups
5. Any docs drift noticed

Also mention when runtime tests were not run because the task was docs-only.
