---
name: dnd-research
description: Read-only exploration of the DND-web codebase before planning or implementing. Use when a task area is unfamiliar, when implementation risk depends on existing patterns, or before dnd-story/dnd-spec/dnd-build. Maps relevant files, patterns, read models, risks, and likely tests. Never edits files.
---

# DND-web Codebase Research

Read-only. Do not edit files, create files, or run destructive commands.

## Where To Look First

Match the task area to its files before searching broadly:

| Task area                | Start here                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Protocol / command shape | `packages/protocol/src/<area>.ts`                                                   |
| Server command handling  | `apps/server/src/session-server.ts` (dispatch), `game-runtime.ts` (logic)           |
| Encounters / combat      | `apps/server/src/encounter-runtime.ts`, `packages/rules/src/index.ts`               |
| Scenes / movement        | `apps/server/src/scene-runtime.ts`, `movement-runtime.ts`, `scene-store.ts`         |
| Character Library        | `apps/server/src/character-library-store.ts`, `apps/web/lib/character-library-*.ts` |
| Runtime cockpit UI       | `apps/web/app/runtime/runtime-cockpit.tsx` (view)                                   |
| Runtime cockpit logic    | `apps/web/lib/runtime-cockpit-helpers.ts` (**derivations live here**)               |
| Character Builder        | `apps/web/app/characters/**`, `apps/web/lib/character-builder-*.ts`                 |
| Copy / i18n              | `apps/web/lib/i18n.tsx`, `apps/web/app/characters/simple-builder/localization.ts`   |
| Persistence              | `packages/db/src/*.ts`, `packages/db/migrations/`, `apps/server/src/db-*.ts`        |
| Browser smoke harnesses  | `apps/web/scripts/*.mjs`                                                            |

Two files are very large — outline them with `grep -n` before reading:
`runtime-cockpit.tsx` (~9.2k lines) and `session-server.test.ts` (~10.2k lines).

## Method

1. Restate the task in one sentence and name the area(s) it touches.
2. Read the source-of-truth docs for that area: `docs/engineering/CURRENT_STATE.md`
   and `docs/api-surface.md` first, then `CODEX_CONTEXT.md` for what is closed
   or in progress.
3. Locate the code with targeted `rg`/`grep` searches. Read the smallest useful
   set of files, not whole directories.
4. Find the existing tests for that area — they encode the intended contract.
5. Check whether the protocol schema already supports the change, or whether it
   would need a new command/field.

## Report

Produce:

- **Relevant files** — path + one line each on why it matters.
- **Existing patterns to reuse** — how this repo already solves the shape of
  problem in question.
- **Authoritative read models involved** — which of `reconnect_session`,
  `get_scene`, `get_active_scene_state`, `get_encounter_state`, `get_character`
  the change interacts with.
- **Boundary risks** — server authority, DM role gates, Character
  Library/runtime separation, i18n/RTL, realtime/outbox claims, auth, scope
  creep. Flag any that apply.
- **Likely tests** — existing test files to extend, and any coverage gap.
- **Unknowns** — what you could not determine, stated plainly. Do not guess.
- **Recommended next step** — usually `dnd-story` (product intent unclear),
  `dnd-spec` (product intent clear, technical shape unclear), or `dnd-build`
  (both clear and narrow).
