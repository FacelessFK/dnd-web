# Character Library Builder / Export DB-Mode Triage

## Phase 8 Slice 1: Character Library Builder / Export DB-Mode Browser Playtest Triage

- Date: 2026-06-04
- Branch/build: local working tree after fresh product intake and Phase 7
  bridge-confidence closure
- Runtime code changed during triage: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Environment

- Server was started in `SERVER_PERSISTENCE_MODE=db` against the project-local
  PostgreSQL dev cluster on port `55432`.
- `corepack pnpm --filter @dnd/db check:readiness` passed before browser
  playtest.
- Web was started at `http://localhost:3000` with the runtime server at
  `http://localhost:2567`.
- Browser playtest used a newly registered DB-backed user through the real
  `/login` UI so the browser held the auth cookie.

## Browser Evidence Collected

Passed / reached:

- `/login` registration succeeded and redirected to `/characters`.
- `/characters` showed the authenticated user and an empty persisted library
  state.
- `/characters/new` opened the Builder in Persian.
- Race selection reached the Human detail panel, required one extra language,
  accepted `Elvish`, and enabled `Select Human`.
- Class selection reached Fighter, required two class skills, accepted
  `Athletics` and `Perception`, and enabled `Select Fighter`.
- Background selection reached Soldier and detected a skill overlap with
  Fighter's Athletics selection.
- The Builder required a replacement background skill; selecting `Insight`
  unblocked the next step.
- Ability score step showed Point Buy, racial bonuses, remaining points, totals,
  and modifiers.
- Details step exposed portrait upload affordance and documented PNG/JPEG/WebP
  validation copy, plus required character name validation.
- Review/sheet step showed the created character's identity, race, class,
  background, alignment, age, pronouns, ability totals/modifiers, AC, HP, speed,
  hit die, proficiency bonus, saves, skills, language/tool summaries, features,
  equipment, notes, and PDF buttons.

Blocked / not completed:

- `Save to Library` failed in DB mode before persisted draft/card/reload,
  finalize, PDF export from Review, and PDF export from the library card could
  be verified.
- Browser-driven portrait file upload was not completed in this pass because
  the available in-app browser automation did not expose a reliable file-picker
  upload action. The UI copy and upload affordance were visible.

## Exact Blocker

The server rejected the Character Library save with PostgreSQL error `22P05`:
the configured project-local DB was initialized with `WIN1252`
`server_encoding`, and the Persian Builder payload contained Unicode text that
cannot be represented in that encoding.

Confirmed DB encoding:

- `postgres`: `WIN1252`
- `dnd_web`: `WIN1252`
- `server_encoding`: `WIN1252`
- `client_encoding`: `WIN1252`

The failed save is classified as an environment/readiness gap, not a runtime
protocol or Character Library/runtime separation bug.

## Triage Findings

- The Builder UI path is usable enough to reach Review/sheet in Persian and it
  correctly exposes several prerequisite gates: required language selection,
  required class skills, and background skill-overlap replacement.
- The Review/sheet surface already renders the core derived data needed for a
  product-confidence pass.
- The current DB readiness check proves table existence but does not prove the
  DB can store Unicode product data.
- Because Persian UI and user-entered Unicode content are product constraints,
  DB-mode Character Library validation must require a UTF-8 database before
  claiming the persisted Builder/Export path works.
- Persisted list/card reload, finalize, and PDF export from Review/card remain
  unproven in this browser pass because save failed before persistence.

## Boundary Review

Verdict: pass with a blocker.

Critical findings:

- DB-mode Builder persistence is blocked in the current local project DB
  cluster because `WIN1252` cannot store Persian Character Library JSON.

Important findings:

- The readiness preflight should be expanded or the local DB should be
  reprovisioned so DB-mode validation requires UTF-8 before browser playtests
  proceed.

Minor findings:

- Browser upload automation for portrait file-picker coverage remains
  unavailable in this pass; the next pass should either add a narrow harness
  capability or document a manual upload check.

Uncertainties / missing evidence:

- A UTF-8 DB may allow save/finalize/PDF export to proceed; this pass did not
  verify those downstream steps.
- PDF download/open verification may require a browser-download harness or a
  local artifact inspection step.

## Recommended Next Slice

Phase 8 Slice 2: UTF-8 DB Readiness / Local DB Reprovisioning For Character Library.

Recommended effort: `high`.

Goal:

Make local DB-mode Character Library validation run against a UTF-8 PostgreSQL
database, then rerun Phase 8 Slice 1's Builder/Export browser playtest from
Save Draft through reload persistence, finalize, Review PDF export, and card
PDF export. Keep the work focused on local DB readiness and evidence; do not
change runtime protocol, DB schema, production auth/security posture,
production asset storage, Character Library/runtime separation, combat
automation, spell automation, inventory, or broader D&D systems.

## Phase 8 Slice 2: UTF-8 DB Readiness / Local DB Reprovisioning For Character Library

- Date: 2026-06-05
- Runtime code changed during run: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Implementation:

- Reprovisioned the project-local PostgreSQL dev cluster under the ignored
  `apps/server/data/` tree with UTF-8 encoding.
- Preserved the previous `WIN1252` cluster as a timestamped local backup under
  `apps/server/data/`.
- Recreated the configured local DB and applied `packages/db/migrations/0001`
  through `0010`.
- Expanded `corepack pnpm --filter @dnd/db check:readiness` so DB-mode
  validation now requires UTF8 server/client encoding and a Persian Unicode
  round-trip probe, in addition to required table checks.
- Added `corepack pnpm --filter @dnd/web test:smoke:builder-export-db`.

Validation evidence:

- `corepack pnpm --filter @dnd/db check:readiness` passes against the
  reprovisioned UTF-8 local DB.
- `corepack pnpm --filter @dnd/web test:smoke:builder-export-db` passes all 8
  steps: UTF-8 DB readiness, DB-backed server startup, Next `/characters`
  startup, authenticated Persian draft creation, persisted browser reload,
  edit/review sheet access, Review PDF affordance, authenticated finalize,
  library-card PDF affordance, and finalized-state reread.

Boundary review:

- Pass. This slice changes local readiness/harness behavior only. It does not
  change runtime protocol, server authority, DM gates, Character
  Library/runtime separation, DB schema, production auth posture, replay,
  cursor/catch-up, outbox semantics, combat automation, or broader D&D systems.
- The Builder/Export smoke proves the local single-process DB-mode browser
  evidence path. It does not prove production auth/security, production asset
  storage, durable replay, stream cursors, catch-up, exactly-once delivery, or
  multi-process SSE semantics.

Remaining limitations:

- Browser-driven portrait file-picker upload remains outside automated smoke
  coverage.
- The new smoke exercises PDF affordances in browser, but does not inspect a
  downloaded PDF artifact byte-for-byte.

Recommended next slice:

Choose a narrow Phase 8 Builder/Export product-confidence polish slice from
fresh evidence, rather than extending DB readiness automatically.

## Phase 8 Slice 3: Character Library Finalize UI & Builder/Export Flow Closure

- Date: 2026-06-05
- Runtime code changed during run: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Implementation:

- Added a draft-only `Finalize Character` action to persisted `/characters`
  cards.
- Wired the card action to the existing authenticated
  `finalize_character_library_entry` command through the web API helper.
- Updated the local card state from the returned entry so finalized PDF
  affordances become available without a page reload.
- Added English/Persian finalize labels and success/failure notices.
- Updated `corepack pnpm --filter @dnd/web test:smoke:builder-export-db` so
  the browser finalizes from the library card UI instead of shortcutting through
  the command route.

Validation evidence:

- `git diff --check`
- `.\node_modules\.bin\prettier.CMD --check .`
- `.\node_modules\.bin\eslint.CMD . --ext .js,.mjs,.cjs,.ts,.tsx`
- `..\..\node_modules\.bin\tsc.CMD --noEmit` from `apps/web`
- `corepack.cmd pnpm --filter @dnd/web test`
- `node scripts\check-db-readiness.mjs` from `packages/db`
- `node apps\web\scripts\character-builder-export-db-smoke.mjs`
- `.\node_modules\.bin\next.CMD build` from `apps/web`
- `node scripts\guards\check-sensitive-files.mjs --all-changed`

Boundary review:

- Pass. This slice reuses the existing Character Library finalize command and
  web API helper. It does not alter runtime protocol, server authority, DM
  gates, DB schema, auth/session semantics, Character Library/runtime
  separation, replay/cursor/catch-up claims, outbox semantics, combat
  automation, or broader D&D systems.
- Finalizing a reusable Character Library entry remains separate from live
  runtime HP, placement, conditions, movement usage, active encounter
  membership, and DM overrides.

Remaining limitations:

- Browser-driven portrait file-picker upload remains outside automated smoke
  coverage.
- PDF artifact verification was still open after this slice and was addressed
  by Phase 8 Slice 4.

Recommended next slice:

Choose one narrow Phase 8 closure slice: PDF artifact verification or manual
portrait-upload closure. Recommended effort: `medium`.

## Phase 8 Slice 4: Builder/Export PDF Artifact Verification

- Date: 2026-06-05
- Runtime code changed during run: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Implementation:

- Added a browser-only smoke capture hook to `downloadCharacterSheetPdf`.
  The hook is inert unless the smoke explicitly sets
  `window.__DND_ENABLE_PDF_SMOKE_ARTIFACTS`.
- Updated the DB-mode Builder/Export smoke so Review and card PDF clicks verify
  the generated PDF header, byte length, and `.pdf` file name in addition to
  the UI notice.
- Fixed explicit template export failure behavior: if a requested official
  template cannot be parsed or filled, export now falls back to the simple
  local PDF instead of hard-failing the browser flow.
- Added web unit coverage for explicit-template fallback.

Validation evidence:

- `node --check apps\web\scripts\character-builder-export-db-smoke.mjs`
- `..\..\node_modules\.bin\tsc.CMD --noEmit` from `apps/web`
- `corepack.cmd pnpm --filter @dnd/web test`
- `node apps\web\scripts\character-builder-export-db-smoke.mjs`

Boundary review:

- Pass. This slice changes Character Library Builder/Export PDF generation and
  smoke evidence only. It does not alter runtime protocol, server authority, DM
  gates, DB schema, auth/session semantics, Character Library/runtime
  separation, replay/cursor/catch-up claims, outbox semantics, combat
  automation, or broader D&D systems.
- The smoke hook is browser-local and opt-in for the smoke run; it does not make
  browser state authoritative.

Remaining limitations:

- Browser-driven portrait upload was still open after this slice and was
  addressed by Phase 8 Slice 5.
- The smoke verifies browser-generated PDF bytes through an in-page capture
  hook. It does not rely on headless Chrome writing blob-anchor downloads to the
  filesystem, because that behavior was not reliable in this environment.

Recommended next slice:

Run a narrow manual portrait-upload closure slice. Recommended effort:
`medium`.

## Phase 8 Slice 5: Manual Portrait-Upload Closure

- Date: 2026-06-05
- Runtime code changed during run: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Implementation:

- Updated `corepack pnpm --filter @dnd/web test:smoke:builder-export-db` to
  create a temporary PNG, upload it through the edit-page portrait file input
  with Chrome DevTools `DOM.setFileInputFiles`, verify the preview, save the
  draft, reread the entry through the Character Library command route, reload
  `/characters`, and verify the library card renders the stored portrait.
- Fixed web rendering for server-stored uploaded portraits. Relative
  `/api/character-library/portraits/...` URLs now resolve against
  `NEXT_PUBLIC_SERVER_URL`.
- Rendered uploaded portrait sources with a plain `<img>` in library cards so
  remote server portrait URLs do not hit Next image host restrictions. Local
  builder asset images continue using `next/image`.
- Updated mapper unit coverage for server-stored portrait URL resolution.

Validation evidence:

- `node --check apps\web\scripts\character-builder-export-db-smoke.mjs`
- `..\..\node_modules\.bin\tsc.CMD --noEmit` from `apps/web`
- `corepack.cmd pnpm --filter @dnd/web test`
- `node apps\web\scripts\character-builder-export-db-smoke.mjs`

Boundary review:

- Pass. This slice changes Character Library Builder/Export portrait rendering
  and smoke evidence only. It does not alter runtime protocol, server
  authority, DM gates, DB schema, auth/session semantics, Character
  Library/runtime separation, replay/cursor/catch-up claims, outbox semantics,
  combat automation, or broader D&D systems.
- Uploaded portraits remain MVP Character Library data/storage, not production
  asset storage.

Remaining limitations:

- The smoke covers one small PNG upload path. It does not exhaustively test
  JPEG/WebP file-picker variants in browser, though lower-level validation and
  mapper tests cover supported MIME/data URL behavior.

Recommended next slice:

Run a narrow Phase 8 Builder/Export closure/readout or choose a fresh
product-confidence target. Recommended effort: `medium`.

## Phase 8 Slice 6: Builder/Export Closure Readout

- Date: 2026-06-05
- Runtime code changed during run: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Readout:

- Phase 8 Builder/Export confidence is closed for the current local
  single-process DB-mode browser path.
- The DB readiness preflight now verifies required tables, UTF8 server/client
  encoding, and a Persian Unicode round-trip before Character Library
  DB-mode browser validation proceeds.
- The Builder/Export smoke now covers authenticated Persian draft persistence,
  browser reload, edit/review sheet access, PNG portrait upload through the
  edit-page file input, persisted portrait reread and card rendering, Review
  PDF artifact capture, card-level finalization, card PDF artifact capture,
  and finalized-state reread.
- The closure evidence is intentionally product-confidence evidence for the
  MVP Character Library surface. It is not a production auth, production asset
  storage, production PDF compliance, replay/catch-up, or multi-process
  delivery claim.

Closure decision:

- Close the current Phase 8 Builder/Export confidence sequence for the
  triaged evidence.
- Do not extend DB readiness, PDF artifact verification, or portrait-upload
  coverage automatically unless a new failure or playtest blocker appears.
- Choose the next task from a fresh human-approved product-confidence target
  or playtest brief.

Recommended next target:

Fresh Product Confidence Target Intake. Recommended effort: `medium`.

Candidate inputs:

- a fresh `/characters` usability playtest brief;
- a fresh Training Room Skirmish DM-player playtest brief;
- a narrow Character Library -> Runtime bridge follow-up only if new bridge
  evidence shows a blocker;
- another evidence-driven UX pass approved by a human.

Boundary review:

- Pass. This closure/readout is docs-only and summarizes existing evidence. It
  does not alter runtime protocol, server authority, DM gates, DB schema,
  auth/session semantics, Character Library/runtime separation,
  replay/cursor/catch-up claims, outbox semantics, combat automation, or
  broader D&D systems.

Remaining limitations:

- The smoke covers one small PNG upload path and does not exhaustively test
  JPEG/WebP browser upload variants.
- Portrait uploads remain MVP data/storage, not production asset storage.
- Character Library auth remains an MVP using opaque HttpOnly-cookie sessions,
  not full production account security.
- PDF validation proves browser-generated PDF artifacts in the local harness;
  it does not claim full production PDF compliance.
