---
name: dnd-spec
description: Turn an approved DND-web user story into a short technical brief before implementation - scope, files, patterns to reuse, protocol/read-model impact, tests, risks, and validation plan. Use after dnd-story and before dnd-build. Does not edit files.
---

# DND-web Spec Writer

Produce a brief. Do not edit files, implement code, or start the build.

## Inputs

The approved user story and acceptance criteria, plus `dnd-research` findings if
available. If the story is not approved yet, stop and say so.

## Decide The Layer First

Classify the change before writing anything else:

- **Copy-only** — `apps/web/lib/i18n.tsx` (+ the component using the key). No
  protocol, no server.
- **Derivation-only** — new logic in `apps/web/lib/runtime-cockpit-helpers.ts`
  with a test, consumed by `runtime-cockpit.tsx`. No protocol, no server.
- **Server behavior** — `apps/server/src/*-runtime.ts` and/or
  `session-server.ts`. Existing protocol shapes.
- **Protocol change** — new/changed Zod schema in `packages/protocol/src/`, then
  server handler, then browser API helper, then UI.
- **Persistence** — `packages/db/src/`, a new numbered migration, and a DB-mode
  smoke run. High effort; expect a boundary review.

Prefer the shallowest layer that satisfies the story. Most Training Room polish
work is copy-only or derivation-only.

## Brief Contents

1. **Scope** — one paragraph, plus an explicit non-goals list.
2. **Files to change** — exact paths, with what changes in each.
3. **Patterns to reuse** — name the existing function/component/test this change
   should look like. Do not invent a new pattern where one exists.
4. **Protocol impact** — new commands/fields, or "none". If a new command is
   needed, say whether the story really requires it or whether existing commands
   suffice.
5. **Read-model impact** — how state survives refresh. Which of
   `reconnect_session`, `get_scene`, `get_active_scene_state`,
   `get_encounter_state`, `get_character` are involved.
6. **Role gating** — if any behavior is DM-only, name the server-side check that
   enforces it. A disabled button is not a gate.
7. **i18n plan** — the new message keys, in `en` and `fa`. Note that
   `type Messages = typeof messages.en` makes a missing `fa` key a typecheck
   failure.
8. **Tests** — which existing test file gains cases, and the specific
   assertions. Prefer extending `runtime-cockpit-helpers.test.ts`,
   `game-runtime.test.ts`, or `session-server.test.ts` over new files.
9. **Risks** — what could break, and what would be hard to reverse.
10. **Validation plan** — the exact commands to run, from the list in
    `CLAUDE.md`. Include a browser smoke only if the change is visible in
    `/runtime` or `/characters`.
11. **Open questions**.
12. **Recommended next skill** — `dnd-boundary-review` if the spec touches
    server authority, DM gates, Character Library/runtime separation, i18n,
    realtime/outbox claims, auth, or product scope; otherwise `dnd-build`.

## Stop Here

The brief needs human approval before implementation.
