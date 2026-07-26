---
name: dnd-build
description: Implement an approved, narrow DND-web slice with tests and validation. Use only after scope is approved via dnd-story/dnd-spec or an explicit human instruction. Follows repo patterns, keeps diffs small, and runs the right validation subset.
---

# DND-web Build With Tests

Use only for approved, narrow work. If the request is broad, ambiguous, or
unapproved, stop and use `dnd-story` / `dnd-spec` first.

## Before Editing

1. Restate the approved scope in one or two sentences, including non-goals.
2. Read every file you intend to change. Do not edit blind.
3. Confirm the change belongs in the shallowest layer that works (see
   `dnd-spec`). Most polish work needs no protocol or server change.

## Implementation Order

Work outward from truth:

1. `packages/protocol` — Zod schema, if the shape changes.
2. `packages/shared` / `packages/rules` — domain primitives and pure helpers.
3. `apps/server/src` — command handling and authoritative state.
4. `apps/web/lib` — API helpers and **derivations**.
5. `apps/web/app` — presentation.
6. `apps/web/lib/i18n.tsx` — copy, in `en` **and** `fa`.

## Repo Patterns To Match

- **Put logic in a tested helper, not in the component.** New `/runtime`
  derivations go in `apps/web/lib/runtime-cockpit-helpers.ts` with cases added
  to `runtime-cockpit-helpers.test.ts`. `runtime-cockpit.tsx` stays
  presentational.
- **Tests are `node --test` + `tsx`.** No Jest, no Vitest. Server:
  `apps/server/src/*.test.ts`. Web: `apps/web/lib/*.test.ts`. Extend the
  existing file for the area rather than adding a new one.
- **Every new `en` message key needs an `fa` counterpart.**
  `type Messages = typeof messages.en` turns a missing `fa` key into a typecheck
  error — which is the point, not an obstacle to route around.
- **Server owns legality.** Validate before RNG, and before mutation. The
  existing `attack` path is the reference: legality → roll → apply → respond.
- **Keep DM-only commands role-gated server-side**, in addition to any UI
  affordance.
- Prettier style: single quotes, semicolons, trailing commas.

## Do Not

- Broaden scope beyond the approved task.
- Rewrite, move, or reformat files outside the task.
- Change runtime code during a docs-only task.
- Add a new protocol command when existing commands suffice.
- Print `.env` contents, credentials, cookies, tokens, or secrets.
- Claim replay, stream cursors, catch-up, exactly-once delivery, or production
  auth in code, copy, docs, or commit messages.

## Validate

Run the smallest honest set for what you touched, always including:

```bash
git diff --check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
```

Then, by area:

- Server logic → `corepack pnpm --filter @dnd/server test`
- Web helpers → `corepack pnpm --filter @dnd/web test`
- Anything user-visible → `corepack pnpm --filter @dnd/web build`
- `/runtime` behavior → `corepack pnpm --filter @dnd/web test:smoke`
- Persistence / auth / library → see the `dnd-db-mode` skill

If a command is blocked, report the exact command, the exact blocker, the
closest equivalent you did run, and whether the touched files were validated.
Never report a skipped check as passing.

## Final Report

1. **Summary** — what changed, in product terms.
2. **Files changed** — path + one line each.
3. **Validation run** — exact commands and results, including anything skipped
   and why.
4. **Risks / follow-ups**.
5. **Docs drift noticed** — anything in `docs/` now inaccurate.
