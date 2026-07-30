---
name: dnd-playtest
description: Run and interpret DND-web browser smoke harnesses and manual playtests of the Training Room Skirmish flow. Use to verify a change works in the real app, to reproduce a reported product issue, or to gather reviewer evidence.
---

# DND-web Playtest And Smoke

The browser smokes are the main evidence that the product loop actually works.
They start real local server + web dev processes and drive headless Chrome.

## Harnesses

```bash
# One profile. Training Room Skirmish demo, recovery after reload, Player-mode
# guardrails, Local Reset stays browser-local, post-reset session recovery.
corepack pnpm --filter @dnd/web test:smoke

# Two profiles. DM and Player in separate browser contexts.
corepack pnpm --filter @dnd/web test:smoke:two-profile

# DB mode. See the dnd-db-mode skill for setup; run check:readiness first.
corepack pnpm --filter @dnd/web test:smoke:builder-export-db
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

Source lives in `apps/web/scripts/*.mjs`; shared assertions and diagnostics in
`runtime-smoke-diagnostics.mjs` (unit-tested by root `pnpm test`).

Environment:

- `RUNTIME_SMOKE_BROWSER=/path/to/chrome` when auto-discovery fails.
- `RUNTIME_SMOKE_TIMEOUT_MS` (default `120000`) on a slow machine.
- DB smokes additionally require `DATABASE_URL`.

## Reading A Failure

Wait failures print numbered steps plus the current URL, summarized cockpit
local state, visible enabled buttons, visible page text, and recent
child-process output. Read that block before re-running — it usually names the
missing button or the state the cockpit is actually in.

Common non-bugs:

- Missing Chrome → set `RUNTIME_SMOKE_BROWSER`.
- Port 3000 or 2567 already in use by a stray dev process.
- A DB smoke run without migrations applied or against a non-UTF8 database.
- `no_active_scene` / `no_active_encounter` — these are expected empty reads and
  recoverable local state, not recovery failures.

## Manual Playtest

```bash
corepack pnpm dev   # web :3000, server :2567
```

The Training Room Skirmish loop, end to end:

1. DM opens `/runtime`, creates a session, runs the named Training Room
   Skirmish demo setup.
2. Player opens `/runtime` in a second profile and joins with the session ID.
3. Player submits a character — a runtime draft, or a finalized saved Character
   Library entry via the bridge selector (DB mode + logged in).
4. DM reviews the pending assignment request and assigns the runtime copy.
5. DM activates the scene and places tokens.
6. DM starts the encounter.
7. Player moves, uses turn resources, and attacks a legal target.
8. Both refresh and confirm read-model recovery rebuilds the table.
9. Player uses Local Reset and confirms it clears browser state only — the
   backend session recovers with the same session ID.

## What To Verify Every Time

- **DM can act without reading protocol JSON.** If a step needs the debug panel,
  that is a product finding.
- **Player-mode guardrails hold.** A player cannot move another player's token,
  issue `dm_*` commands, or act out of turn.
- **Recovery is honest.** After refresh, state comes back through
  `reconnect_session`, `get_scene`, `get_active_scene_state`,
  `get_encounter_state`, and `get_character` — not from browser storage.
- **Local Reset is browser-local.** Backend runtime state survives it.
- **Both locales.** Switch to Persian and confirm RTL layout holds on the
  panels you touched.

## Reporting Evidence

State the exact command, whether it passed, and the session ID for a manual run.
When a smoke was not run, say so and why. Never describe a skipped harness as
passing.

Report the result in the pull request or to the user. Do not write a dated
evidence file — this repository does not keep those (see CLAUDE.md, "Source of
truth").
