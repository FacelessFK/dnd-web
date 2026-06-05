# Saved Character To Training Room Product-Flow Triage

## Slice 1: Saved Character To Training Room Product-Flow Triage

- Date: 2026-06-05
- Branch/build: local working tree after Character Sheet PDF Preview browser
  verification/closure
- Runtime code changed during triage: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Goal

Run an evidence-first triage pass for the current cross-surface product loop:
Character Library saved entry, Player-mode runtime submission, DM assignment of
the separate runtime copy, Training Room runtime flow, first turn feedback,
local reset/recovery, and English/Persian scanability. Choose any follow-up
only from observed evidence.

## Evidence Collected

Validation / browser harness:

- `corepack pnpm --filter @dnd/db check:readiness` passed:
  the local `dnd_web` database connection is OK, UTF8 encoding is verified, and
  the required tables are present.
- `corepack pnpm --filter @dnd/web test:smoke:builder-export-db` passed all 9
  steps: DB-mode configuration, UTF-8 readiness, DB-backed authoritative server
  startup, Next `/characters` startup, authenticated Persian draft creation,
  persisted browser reload, portrait upload persistence, Review PDF artifact
  capture, card-level finalization, card PDF artifact capture, and
  finalized-state reread.
- `corepack pnpm --filter @dnd/web test:smoke:bridge-db` passed all 9 steps:
  DB-mode configuration, DB readiness, DB-backed authoritative server startup,
  Next `/runtime` startup, authenticated finalized saved-character seeding,
  runtime session creation, Player saved-character submission, DM runtime-copy
  assignment, and authoritative runtime-copy/source-library separation
  validation.
- `corepack pnpm --filter @dnd/web test:smoke:two-profile` passed all 8 steps:
  authoritative server startup, Next runtime UI startup, separate DM and Player
  browser profiles, Training Room build, encounter start, Player join/recover,
  Player guardrails, and Player Local Reset isolation from the DM profile.

Source / flow inspection:

- `docs/manual-validation.md` already describes both major manual paths:
  Training Room DM/Player playtesting and Character Library -> runtime bridge
  validation.
- `apps/web/scripts/runtime-bridge-db-smoke.mjs` proves saved-character
  submission, DM assignment, runtime-copy provenance, and reusable
  library-entry separation.
- `apps/web/scripts/runtime-two-profile-smoke.mjs` proves Training Room setup,
  encounter start, Player guardrails, promoted `Turn & Target` hierarchy, and
  Player Local Reset isolation.
- `apps/web/scripts/character-builder-export-db-smoke.mjs` proves the
  persisted Character Library Builder/Export path, portrait persistence,
  finalized card state, preview-before-download, and PDF artifact capture.

## Triage Findings

Passed / healthy:

- DB readiness is healthy for the current local DB-mode evidence path.
- Character Library persistence, portrait upload, finalized card state, PDF
  preview/artifact capture, and finalized-state reread are healthy.
- Saved-character submission into runtime, DM assignment, runtime-copy
  provenance, and reusable library-entry separation are healthy.
- Training Room setup, encounter start, Player guardrails, role-focused action
  hierarchy, and Local Reset isolation are healthy in the current smoke paths.
- No fresh evidence suggests extending PDF, portrait, DB readiness, runtime
  polish, or bridge confidence automatically.

Observed product-confidence gap:

- The current evidence is split across three browser smoke harnesses. There is
  no single saved-character-to-Training-Room run that follows one authenticated
  saved Character Library entry through Player submission, DM assignment,
  runtime-copy placement in the Training Room, encounter start, first turn
  feedback, recovery, and local reset in one product-flow record.
- This is an evidence/comprehension gap, not a mechanics blocker. The separate
  harnesses already prove the major underlying mechanics.

No current blocker:

- No DB readiness blocker.
- No Character Library persistence/auth blocker.
- No portrait persistence blocker.
- No PDF preview/artifact blocker.
- No Character Library/runtime separation blocker.
- No Training Room runtime smoke blocker.
- No replay/catch-up, production auth, or broader automation claim was added.

## Recommended Next Slice

Saved Character To Training Room Combined Browser Evidence Harness.

Recommended effort: `high`.

Goal:

Create a single repeatable DB-mode browser smoke or playtest harness that
proves the full current product loop in one run: seed or create an authenticated
finalized saved Character Library entry, open `/runtime` in separate Player and
DM profiles, submit the saved entry from Player mode, assign the separate
runtime copy from DM mode, build or activate the Training Room, place the
runtime copy, start the encounter, verify first-turn/ready/action feedback,
verify runtime-copy/source-library provenance, and confirm Local Reset remains
browser-local.

Why `high`:

- The follow-up is still test/harness-focused, but it crosses DB-mode auth,
  Character Library persistence, runtime session setup, DM/Player browser
  profiles, scene/encounter state, recovery/local state, i18n-sensitive UI
  text, and existing smoke infrastructure.

Scope:

- Prefer reusing existing smoke helpers and assertions from
  `runtime-bridge-db-smoke.mjs`, `runtime-two-profile-smoke.mjs`, and
  `character-builder-export-db-smoke.mjs`.
- Keep production code unchanged unless the combined harness reveals a fresh
  blocker that cannot be represented by existing commands and UI affordances.
- Record any product issue as evidence before proposing implementation.

Non-goals:

- No runtime protocol changes.
- No DB schema, migration, transaction, idempotency, outbox, or auth changes.
- No production auth/security claims.
- No production asset storage or PDF compliance claims.
- No new Character Library -> Runtime bridge behavior.
- No combat automation, spell automation, inventory expansion, CRPG systems,
  fog of war, replay/catch-up semantics, or broader D&D systems.

Suggested validation for the follow-up:

- `git diff --check`
- `corepack pnpm --filter @dnd/db check:readiness`
- `corepack pnpm --filter @dnd/web test`
- `corepack pnpm --filter @dnd/web typecheck`
- the new combined smoke command, once added
- keep `corepack pnpm --filter @dnd/web test:smoke:builder-export-db`,
  `corepack pnpm --filter @dnd/web test:smoke:bridge-db`, and
  `corepack pnpm --filter @dnd/web test:smoke:two-profile` as fallback
  comparison evidence if the combined smoke fails.

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings: none.

Minor findings:

- The next slice should remain harness/evidence-first. The observed gap is that
  product-flow evidence is split, not that server/runtime mechanics are
  currently broken.

Uncertainties / missing evidence:

- No single browser run currently proves the saved runtime copy participates in
  the Training Room flow after DM assignment.
- It is not yet known whether the combined run will reveal UX copy friction
  around Player submission, DM assignment preview, placement, first-turn
  feedback, recovery/local reset wording, or bilingual scanability.

Recommended next action:

Implement the combined saved-character-to-Training-Room browser evidence
harness as a narrow test/harness slice before changing `/characters`,
`/runtime`, Builder, PDF, portrait, auth, DB, bridge behavior, or runtime
commands.

## Slice 2: Combined Browser Evidence Harness

- Date: 2026-06-05
- Runtime/product code changed: no
- Harness/package/docs changed: yes
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

### Implementation

`apps/web/scripts/runtime-bridge-db-smoke.mjs` now runs as a 12-step combined
DB-mode browser evidence harness. After the existing saved-character bridge
path validates Player submission, DM assignment, runtime-copy provenance, and
reusable library-entry separation, the same run creates an authoritative
`Training Room` scene through existing scene commands, activates it, places the
assigned runtime copy through the movement command, starts an encounter, and
verifies the active-scene and encounter read models.

The browser side then recovers both DM and Player profiles and verifies the
visible Training Room, assigned saved character, encounter/current-turn
feedback, Player readiness, placed-token state, `Turn & Target`, action
feedback, and Player Local Reset recovery. A final read-model check confirms
that Player Local Reset did not delete or mutate the server-owned active scene
or encounter.

`apps/web/package.json` adds:

```bash
corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db
```

`corepack pnpm --filter @dnd/web test:smoke:bridge-db` remains an alias for the
same harness.

### Validation

- `node --check apps/web/scripts/runtime-bridge-db-smoke.mjs` passed.
- `corepack pnpm --filter @dnd/web test:smoke:saved-character-training-room-db`
  passed all 12 steps: DB-mode configuration, DB readiness, DB-backed server,
  Next `/runtime`, authenticated finalized saved-character seeding, runtime
  session creation, Player saved-character submission, DM runtime-copy
  assignment, runtime-copy/source-library separation, Training Room placement,
  DM/Player browser recovery evidence, and Player Local Reset recovery.

### Outcome

The previously observed product-confidence gap is closed for the current local
single-process DB-mode browser evidence path. The current recommended next
action is fresh product-confidence intake or review of the combined evidence,
not automatic expansion into runtime protocol, Character Library bridge
behavior, DB/auth, replay/catch-up, PDF/portrait, or broader D&D automation.
