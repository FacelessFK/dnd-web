# CLAUDE.md

Working notes for AI-assisted development in this repository. Read
[README.md](README.md) for what the product is and how to run it,
[PRD.md](PRD.md) for what it is supposed to become, and [ROADMAP.md](ROADMAP.md)
for what to build next.

This file holds only what those three do not: conventions, invariants, and the
traps this codebase actually has.

## Source of truth

Code beats documentation. `packages/protocol` beats everything. If a Zod schema
and a sentence in a Markdown file disagree, the schema is right and the sentence
is a bug.

There are exactly four documentation files: README, PRD, ROADMAP, and this one.
Do not add a fifth. Do not create status reports, closure packets, phase plans,
handoff documents, evidence packets, or dated triage notes. The repository was
buried in those once. If something is worth recording, it belongs in one of the
four files, in a code comment, in a test, or in a commit message.

## Branching and release workflow

`main` is stable-only: milestones and releases land there and nothing else. No
direct commits, no ordinary feature work.

`development` is the long-lived integration branch. Every `feature/*`, `fix/*`,
and `chore/*` branch starts from `development`, and its pull request targets
`development`. Never branch ordinary work from `main`, and never merge a feature
branch straight into `main`.

`release/*` branches carry a functionally complete milestone from `development`
to `main`. They accept stabilization and defect fixes only - release notes go in
the four existing documents, not a new file.

`hotfix/*` is the one exception that starts from `main`, and only for a defect
already live there. A hotfix merges into `main` and must then be merged back
into `development`, or the fix silently disappears at the next release.

No direct feature commits to `main` or `development`. No force-pushing or
history rewriting on any shared branch. CI runs on pushes to `main` and
`development`, and on every pull request whatever its target.

## Non-negotiable boundaries

Product rules, not style preferences. Violating one is a bug even if it compiles
and the tests pass.

1. **The browser is never authoritative.** The client submits intent and renders
   what the server sends. It never decides identity, permissions, dice, HP,
   visibility, or state.
2. **Identity is a server-issued credential.** A client-supplied
   `participantId` proves nothing. Every session-scoped command and every stream
   subscription verifies a participant token. Never add a code path that trusts
   a claimed ID.
3. **GM-only actions are gated server-side.** A hidden control is not a gate.
   The gate lives in `apps/server`.
4. **If a client must not know something, the server must not send it.** Project
   reads and streams per role before the bytes leave. Never filter in the
   browser.
5. **Character Library entries are reusable records; runtime characters are live
   state.** Live HP, position, conditions, movement usage, encounter membership,
   and GM overrides must never write back into a `character_library_entries`
   row. The bridge command copies an entry into a separate runtime character and
   records `meta.sourceCharacterLibraryEntryId`.
6. **Preserve English/Persian and LTR/RTL.** Persian (`fa`) is the default
   locale. A hardcoded English string in a user-facing surface is a bug.
7. **Do not overclaim durability.** SSE is live delivery only. There is no
   replay, stream cursor, catch-up API, exactly-once delivery, cold-boot outbox
   redelivery, or multi-process coordination. Do not write code comments, UI
   copy, documentation, or commit messages implying otherwise.
8. **Rules are `dnd-5e-2014`.** Never mix 2014 and 2024 content in one profile.
   The existing 2024 builder content is a tracked defect, not a precedent.
9. **Never commit the rulebook PDF** or reproduce substantial book text. It
   lives in gitignored `local-reference/`.
10. **Do not broaden scope** into AI storytelling, monster AI, CRPG systems, or
    production infrastructure without an explicit decision. Growing the product
    is the roadmap's job.

## Effort calibration

- **Low/medium** — UI polish, small helpers, small tests, documentation.
- **High** — DB schema, migrations, transactions, idempotency, the outbox, auth,
  participant credentials, role projections, runtime data-model boundaries,
  normal multi-file work.
- **Highest** — one task combining several high-risk areas, e.g. schema plus
  transaction plus auth.

Anything touching boundary 2, 3, 4, or 5 is high effort by definition. Treat a
change there as a security change and test it as one.

## Code patterns to follow

**Pure logic in a tested helper; components stay presentational.**
`apps/web/app/runtime/runtime-cockpit.tsx` is the counter-example — ~8,800 lines
and the largest known defect in the repository (ROADMAP M2). Nearly all of its
derivations live in `apps/web/lib/runtime-cockpit-helpers.ts` with matching
`.test.ts` coverage. New runtime logic goes in a helper module with a test, never
inline in the component. Do not add to the cockpit's size; if a change would,
extract instead.

**Map rendering splits three ways.** `lib/tactical-map-render.ts` holds camera
maths, projections, palettes, and token/decor derivation (tested);
`lib/tactical-map-draw.ts` holds the canvas terrain art shared by `/runtime` and
`/maps`; the components own only pointers and React state. Keep the renderer
behind this seam — ROADMAP M4 may swap the drawing layer, and the server contract
must not notice.

**Map builder mutations live in `lib/map-builder-state.ts`**, including
undo/redo, so tool behaviour is unit-tested rather than driven through the DOM.

**Server authorization has one shape.** Resolve the session snapshot, require the
participant, assert the role, then act. Reuse the existing `assertActorIsDm`-style
helpers; do not invent a second pattern.

**Protocol changes start in `packages/protocol`** as Zod schemas. Server handlers
and the browser API helpers follow.

**Rules helpers stay pure and injectable.** `packages/rules` has no network,
database, or UI. Randomness enters through an injected roller (`withRollers()` on
`InMemoryGameRuntime`), never `Math.random` at a call site.

**Every command is idempotent.** Successful mutating responses are cached by
category + type + command ID + actor + session. A conflicting fingerprint returns
`command_id_conflict`. Failed and read commands are not cached.

**Explicit transaction boundaries.** In DB mode a command's writes and its
idempotency record commit together through
`packages/db/src/dnd-database-unit-of-work.ts`. Events go to the outbox inside
that transaction and dispatch after commit.

**A repository result is a promise in DB mode and a value in memory.** The
`RuntimeRepositoryResult` pattern lets `game-runtime.ts` declare `Encounter`
where DB mode actually returns `Promise<Encounter>`, so TypeScript will not
catch you reading a field off it. Two shipped bugs came from exactly that: a
combat event built with `encounter.id` from an unresolved promise wrote
`encounterId: undefined` into the outbox, and projecting an unresolved promise
read `participants` off a `Promise`. Neither reproduces in memory, and the DM
path masked both. Always pass a repository result through
`resolveRepositoryResult` before touching its fields - never through a bare
`const`.

**Participant credentials never become durable.** They are per-process bearer
tokens and a restart must invalidate them. The durable fact is the _seat
binding_ in `session_seat_ownership`, and `reconnect_session` accepts it in
place of a credential only when `isOwnedBy` matches - never `isAvailableTo`,
which is true for any unbound seat and would hand an anonymous table's GM chair
to anyone with the session code.

**No unbounded query.** Anything that can grow gets a `LIMIT` or a database-side
aggregate. Never `SELECT *` a whole table to count it in JavaScript.

## i18n

Strings go through `useI18n()` from `apps/web/lib/i18n.tsx`. `messages` is a flat
`Record<string, string>` keyed by dotted paths, with `en` and `fa` maps and
`{placeholder}` interpolation.

`type Messages = typeof messages.en` means **every key added to `en` must also
exist in `fa`** or `pnpm typecheck` fails. That typecheck is the only thing
enforcing parity — tests run through `tsx`, which strips types without checking
them.

**Character Builder SRD content uses a different, untyped mechanism.** The phrase
book in `app/characters/simple-builder/localization.ts` is keyed on the English
source string and falls back to it on a miss, so untranslated content renders
English inside the RTL Persian page without failing typecheck.
`apps/web/lib/simple-builder-phrase-coverage.test.ts` is what catches it: new
content in `simple-builder/data/` needs a Persian entry or that test fails with
the exact field path.

**Never store a localized label as a canonical ID.** `rulesProfileId`, class /
species / background / spell IDs, ability keys, command types, and database IDs
stay stable and untranslated. Never auto-translate user-entered character data.

## Tests

`node --test` with `tsx`. Not Jest, not Vitest.

- `packages/rules/src/*.test.ts` — pure rules.
- `apps/server/src/*.test.ts` — runtime, HTTP, transactions, projections.
- `apps/web/lib/*.test.ts` — helpers, renderers, mappers.
- `scripts/smoke.test.mjs` — repository shape and smoke diagnostics.
- `apps/web/scripts/*.mjs` — browser harnesses driving headless Chrome.

A visibility or authorization property gets its own test that tries to break it.
"The UI does not show it" is not a test.

## Validation

Run in this order. The commands are in README; the notes below are what the order
is for.

```bash
git diff --check
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @dnd/web build
```

`format:check` runs early because a CRLF-contaminated file produces a whole-file
diff that masks every real failure below it. `typecheck` covers the server and
every package — `next build` only type-checks `apps/web` — and it is the sole
enforcement of i18n parity. The build catches what typecheck cannot, such as
invalid server/client component boundaries.

Browser and DB-mode smokes are in README and in `.claude/skills/`.

When validation is blocked, report the exact command, the exact blocker, the
closest equivalent that did run, and whether the touched files were covered.
Never describe a skipped harness as passing.

## Skills

Two, both operational:

- `.claude/skills/dnd-db-mode` — DB-mode setup, migrations, readiness, DB smokes.
- `.claude/skills/dnd-playtest` — browser harnesses and manual playtest routes.

Do not add process skills. Story-writing, spec-writing, review-checklist, and
task-intake skills were removed on purpose; they generated documentation instead
of software.

## Working rules

- Inspect before editing. Prefer small, repo-native diffs over rewrites.
- Never print `.env` contents, `DATABASE_URL`, credentials, cookies, tokens, or
  secrets.
- Report honestly: which tests ran, which did not, and why. If something is
  half-done, say so.
- Report to the user in **English**. Code, identifiers, commands, and commit
  messages stay English regardless. The product's own bilingual UI requirement is
  separate and unaffected.
