# Character Library Runtime Bridge DB-Mode Triage

## Phase 7 Slice 1: Character Library -> Runtime Bridge DB-Mode Playtest Triage

- Date: 2026-06-04
- Branch/build: local working tree after post-Phase-6 runtime polish
- Persistence mode requested: DB mode
- Persistence mode available in this shell: not fully available; `DATABASE_URL`
  was unset
- Runtime code changed during triage: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB/auth behavior, replay/catch-up, SSE behavior, combat automation, and
  read-model recovery behavior changed or claimed: no

## Evidence Reviewed

- `docs/engineering/CURRENT_STATE.md` describes the implemented server-side
  bridge command, Player saved-character selector, DM pending-assignment
  preview, separate runtime copies, and DB transaction/outbox coverage on the
  covered path.
- `docs/persistence-boundaries.md` states that, in DB mode,
  `submit_character_library_entry_for_assignment` reads the reusable library
  entry, creates a runtime character copy, records `pendingCharacterId`, writes
  durable idempotency success, and creates one `session_state` outbox row in
  the same unit of work.
- `docs/product/USER_FLOWS.md` keeps the intended flow narrow: Player submits a
  finalized Character Library entry, the server creates a separate runtime
  copy, and the DM assigns that runtime copy.
- `docs/manual-validation.md` already documents the manual DB-mode bridge pass:
  login, finalized saved character, Player `/runtime` submit, DM assignment
  request preview, `Assign Pending Character`, and runtime-copy provenance
  after assignment.

## Automated Validation Evidence

- `corepack pnpm --filter @dnd/server test` passed 270 tests.
- `corepack pnpm --filter @dnd/web test` passed 110 tests.
- `corepack pnpm --filter @dnd/web typecheck` passed.

Relevant covered behavior:

- Authenticated Character Library entries are owned by auth user ID and isolated
  between users.
- DB-backed Character Library repository reads entries after service restart.
- Server command route submits finalized library entries into runtime
  assignment state.
- Draft library entry submission is rejected before runtime state is created.
- Library-entry owner mismatch is rejected before runtime state is created.
- DB-backed session transaction boundary writes one runtime copy and one outbox
  row for `submit_character_library_entry_for_assignment` duplicate retries.
- Duplicate retries return cached success without creating another runtime
  character copy.
- The reusable library entry remains finalized and keeps its original HP.
- The session participant receives `pendingCharacterId` while `characterId`
  remains unset until DM assignment.
- Web helper tests cover pending assignment requests, runtime-copy/source
  library provenance summaries, saved-character filtering, and localizable
  blockers.

## DB-Mode Browser Playtest Blocker

This triage could not honestly complete a real browser DB-mode playtest because
the current shell did not provide `DATABASE_URL`. Per `docs/codex-workflow.md`,
DB-mode verification requires:

- `SERVER_PERSISTENCE_MODE=db`
- `DATABASE_URL`
- applied `packages/db/migrations/`, including:
  - `0008_character_library_entries.sql`
  - `0009_auth_users_and_sessions.sql`
  - `0010_auth_user_owned_character_library.sql`

No secret values were printed.

## Triage Findings

- The core bridge behavior is already covered by focused server and web tests.
- The main remaining gap is not a new runtime capability. It is repeatable
  browser-level DB-mode evidence for the full logged-in UI path.
- The current manual validation docs describe the desired pass, but there is no
  dedicated seeded or scripted DB-mode browser playtest for this bridge.
- Adding protocol, schema, combat automation, replay/catch-up, or production
  auth would be out of scope for the next slice.

## Boundary Review

Verdict: pass with cautions.

Critical findings: none.

Important findings: none in the implemented code evidence reviewed.

Minor findings:

- The DB-mode browser path remains manual and environment-dependent, so future
  claims should distinguish automated test coverage from actual browser DB-mode
  playtest evidence.

Uncertainties / missing evidence:

- A real browser DB-mode run with a live `DATABASE_URL` was not available in
  this shell.
- The current triage did not prove the full `/login` -> `/characters` ->
  `/runtime` bridge path in a browser session with HttpOnly cookies.

## Recommended Next Slice

Phase 7 Slice 2: Character Library -> Runtime Bridge DB-Mode Browser Playtest
Harness.

Recommended effort: `high`.

Goal:

Create or document a repeatable DB-mode browser playtest harness for the saved
Character Library -> Runtime bridge path. It should make the existing manual
validation path easy to rerun with a known DB-mode setup, without adding new
runtime protocol, DB schema, production auth claims, replay/catch-up semantics,
combat automation, or broad product scope.

Acceptance target:

- A human or Codex can run the bridge playtest with a configured DB and confirm
  login, finalized saved character availability, Player runtime submission, DM
  pending-assignment preview, DM assignment, and runtime-copy/source-library
  provenance after assignment.
- If the slice automates the browser path, it must preserve HttpOnly-cookie
  auth behavior and avoid printing secrets.

## Phase 7 Slice 2: Character Library -> Runtime Bridge DB-Mode Browser Playtest Harness

- Date: 2026-06-04
- Branch/build: local working tree after Phase 7 Slice 2 implementation
- Runtime code changed during run: browser smoke harness only
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth behavior, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Implemented harness:

- Added `apps/web/scripts/runtime-bridge-db-smoke.mjs`.
- Added the `@dnd/web` script `test:smoke:bridge-db`.
- The harness requires `DATABASE_URL` and starts the server with
  `SERVER_PERSISTENCE_MODE=db`; it does not create a database or run
  migrations implicitly.
- The harness seeds a unique authenticated user and finalized saved Character
  Library entry through the real auth and Character Library HTTP routes.
- The Player browser profile logs in through the real auth route so the
  HttpOnly cookie is held by the browser, then submits the saved character from
  `/runtime`.
- The DM browser profile recovers the same runtime session, verifies the
  pending assignment preview, clicks `Assign Runtime Copy`, and verifies the
  pending request clears.
- After browser interaction, the harness rereads authoritative server state to
  confirm the Player has an assigned runtime character, `pendingCharacterId` is
  cleared, the runtime copy preserves `sourceLibraryEntryId`, and the reusable
  library entry remains finalized with unchanged HP.

Validation evidence:

- Running the new harness without `DATABASE_URL` fails early with a clear setup
  message and does not print any secret values.
- `corepack pnpm --filter @dnd/web test:smoke:bridge-db` reached the same
  expected setup blocker in this shell because `DATABASE_URL` was unset.
- `corepack pnpm --filter @dnd/server test` passed after the harness was added.
- `corepack pnpm --filter @dnd/web test` passed after the harness was added.
- `corepack pnpm --filter @dnd/web typecheck` passed after the harness was
  added.
- `corepack pnpm lint` and `corepack pnpm --filter @dnd/web build` passed.
- Full DB-mode browser execution remains environment-dependent and should be
  run when a migrated database is available.

Closure decision:

- Phase 7 Slice 2 is implemented as a repeatable DB-mode browser playtest
  harness.
- The next bridge-confidence task should be a real DB-mode run of this harness
  against a migrated database, or a narrow fix if that run exposes a blocker.

## Phase 7 Slice 3: Run DB-Mode Bridge Harness & Failure Triage

- Date: 2026-06-04
- Branch/build: local working tree after Phase 7 Slice 3 triage
- Runtime code changed during run: browser smoke harness setup behavior only
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth behavior, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Implementation / triage result:

- Updated `apps/web/scripts/runtime-bridge-db-smoke.mjs` to load repo-local
  `.env` values before checking `DATABASE_URL`, matching the server startup
  behavior.
- Added output redaction for loaded sensitive values in harness errors and
  captured process logs.
- Reran `corepack pnpm --filter @dnd/web test:smoke:bridge-db`.
- The harness advanced past local configuration and attempted DB-backed server
  startup.
- DB-backed server startup failed before the browser phase with PostgreSQL
  authentication failure for user `dnd_web`.
- No browser Player/DM bridge assertions ran because the authoritative server
  did not start.

Failure classification:

- Category: environment/setup blocker.
- Exact blocker: PostgreSQL password authentication failed for the configured
  DB user.
- Closest validated behavior: the harness now correctly loads `.env`, starts
  DB-mode startup, and fails at real DB authentication without printing the
  database URL.

Boundary review:

- No runtime authority, command semantics, DB schema, auth semantics, or
  Character Library/runtime separation behavior changed.
- The failure is not evidence of a bridge product bug yet; the bridge browser
  path remains unproven until DB credentials and migrations are valid.

Recommended next slice:

Phase 7 Slice 4: DB-Mode Local Environment Readiness Check.

Recommended effort: `high`.

Goal:

Add or document a non-secret DB readiness check that verifies the configured
DB connection and required migration tables exist before running the browser
bridge harness. It should not print `DATABASE_URL`, passwords, cookies, or raw
connection strings, and it should not create/drop databases implicitly.

## Phase 7 Slice 4: DB-Mode Local Environment Readiness Check

- Date: 2026-06-04
- Branch/build: local working tree after Phase 7 Slice 4 implementation
- Runtime code changed during run: DB readiness tooling and browser smoke
  harness preflight behavior only
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth behavior, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Implemented readiness check:

- Added `corepack pnpm --filter @dnd/db check:readiness`.
- The readiness check loads repo-local `.env` values, verifies
  `DATABASE_URL` is configured, opens a PostgreSQL connection, and confirms
  the required current DB tables exist:
  - `auth_users`
  - `auth_sessions`
  - `character_records`
  - `character_library_entries`
  - `completed_command_idempotency_records`
  - `command_idempotency_claim_records`
  - `session_snapshots`
  - `scene_records`
  - `active_encounter_records`
  - `command_event_outbox_records`
- The readiness check does not create databases, run migrations, seed data,
  drop objects, or mutate runtime/Character Library records.
- The readiness check redacts the configured `DATABASE_URL` and URL passwords
  from formatted output.
- `corepack pnpm --filter @dnd/web test:smoke:bridge-db` now runs the same
  readiness check before starting the DB-backed server or browser profiles.

Validation result:

- In the current local environment, the readiness check fails early with the
  same setup blocker found in Slice 3: PostgreSQL password authentication for
  user `dnd_web`.
- Because the preflight fails first, the bridge browser harness now stops
  before server/browser startup when local DB credentials or migration state
  are not ready.

Boundary review:

- No runtime authority, command semantics, DB schema, auth semantics, or
  Character Library/runtime separation behavior changed.
- This slice improves environment diagnosis only; it does not prove the browser
  bridge path until DB credentials and migrations are valid.

Recommended next slice:

Phase 7 Slice 5: Fix/Provision Local DB Credentials & Migration State.

Recommended effort: `high`.

Goal:

Make the local DB environment pass `corepack pnpm --filter @dnd/db
check:readiness`, then rerun `corepack pnpm --filter @dnd/web
test:smoke:bridge-db` to collect real browser bridge evidence. Keep this as
environment/setup plus validation work; do not change runtime protocol,
Character Library/runtime separation, combat automation, replay/catch-up
semantics, or production auth scope.

## Phase 7 Slice 5: Fix/Provision Local DB Credentials & Migration State

- Date: 2026-06-04
- Branch/build: local working tree after Phase 7 Slice 5 implementation
- Runtime code changed during run: DB bridge browser smoke harness assertion
  and cleanup robustness only
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Environment result:

- PostgreSQL was already installed locally.
- The existing system PostgreSQL service on port `5432` was running, but the
  configured `dnd_web` credentials were not usable and local auth requires
  password authentication.
- Docker Desktop was not available in this shell, so the repo's
  `docker-compose.yml` DB service could not be used.
- Provisioned a project-local PostgreSQL dev cluster under the ignored
  `apps/server/data/` tree on port `55432`, leaving the system PostgreSQL
  service untouched.
- Updated the local ignored `.env` DB endpoint to use that project-local dev
  cluster without printing the connection string or previous secret values.
- Created the `dnd_web` database in the project-local cluster and applied
  `packages/db/migrations/0001` through `0010`.

Harness fixes discovered after DB readiness passed:

- Corrected the bridge smoke final provenance assertion to check the
  server-canonical runtime copy metadata key
  `sourceCharacterLibraryEntryId`.
- Made browser profile cleanup tolerant of temporary Windows Chrome file locks
  so cleanup does not mask a completed bridge assertion pass.

Validation evidence:

- `corepack pnpm --filter @dnd/db check:readiness` passed:
  DB connection OK and all 10 required tables present.
- `corepack pnpm --filter @dnd/web test:smoke:bridge-db` passed all 9 steps:
  DB readiness, DB-backed server startup, Next runtime UI startup,
  authenticated saved-character seeding, runtime session creation, Player
  saved-character submission, DM runtime-copy assignment, and authoritative
  runtime-copy/source-library separation validation.

Boundary review:

- The project-local DB provisioning is local development setup only, not a
  production deployment or production auth/security change.
- The bridge smoke pass proves the current single-process local DB-mode browser
  flow, not replay, stream cursor, catch-up, exactly-once delivery, or
  multi-process SSE semantics.
- Reusable Character Library entries remain separate from live runtime copies;
  the smoke rereads authoritative server state and verifies the reusable entry
  remains finalized with unchanged HP.

Recommended next slice:

Phase 7 Slice 6: Bridge DB-Mode Evidence Closure & Next Confidence Triage.

Recommended effort: `medium`.

Goal:

Use the now-passing DB-mode browser harness evidence to decide whether Phase 7
bridge confidence can close or needs one narrow follow-up. Keep this
evidence/triage-only unless a failure appears in current code. Do not add
runtime protocol, DB schema, production auth, replay/catch-up semantics, combat
automation, or broader D&D systems.

## Phase 7 Slice 6: Bridge DB-Mode Evidence Closure & Next Confidence Triage

- Date: 2026-06-04
- Branch/build: local working tree after Phase 7 Slice 6 triage
- Runtime code changed during run: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

Evidence reviewed:

- `corepack pnpm --filter @dnd/db check:readiness` passes against the
  project-local PostgreSQL dev cluster: connection OK and all 10 required
  tables present.
- `corepack pnpm --filter @dnd/web test:smoke:bridge-db` passes all 9 steps:
  DB readiness, DB-backed server startup, Next runtime UI startup,
  authenticated saved-character seeding, runtime session creation, Player
  saved-character submission, DM runtime-copy assignment, and authoritative
  runtime-copy/source-library separation validation.
- The passed harness preserves the intended HttpOnly-cookie browser path: the
  Player browser logs in through auth before submitting the saved Character
  Library entry from `/runtime`.
- The final authoritative reread confirms the assigned runtime copy keeps the
  server-canonical `sourceCharacterLibraryEntryId`, the reusable Character
  Library entry remains finalized, and reusable HP is unchanged.
- Focused server/web tests from earlier Phase 7 slices cover ownership
  isolation, draft rejection, owner mismatch rejection, duplicate retry
  idempotency, runtime-copy creation, pending assignment, and reusable
  library-entry separation.

Closure decision:

- Phase 7 bridge confidence can close for the current local DB-mode,
  single-process browser path.
- No additional bridge implementation slice is justified from the current
  evidence.
- Future bridge work should be driven by fresh product/playtest evidence or a
  newly observed failure, not by automatically extending this confidence
  sequence.

Remaining limitations:

- The passing smoke proves the local single-process DB-mode browser path, not
  production deployment, production auth hardening, multi-process SSE behavior,
  durable replay, stream cursors, catch-up, or exactly-once delivery.
- The project-local PostgreSQL dev cluster is local setup. If it is stopped
  after reboot, rerun the documented `pg_ctl` command before DB-mode
  validation.
- The bridge remains intentionally DM-first: Player submission creates or uses
  a pending runtime copy; final assignment remains a DM-controlled server-side
  action.

Boundary review:

- Pass. No server authority, DM role gate, Character Library/runtime
  separation, DB schema, auth/security, i18n, realtime/outbox, or product scope
  boundary issue was found in this evidence closure.

Recommended next milestone:

Fresh product playtest / next-goal intake.

Recommended effort: `medium`.

Goal:

Run or define the next human-approved product playtest goal before starting
another implementation sequence. Good candidates are a fresh Training Room
Skirmish DM-player playtest, Character Library builder/export polish triage, or
another narrow evidence-driven UX pass. Keep any next task scoped by observed
evidence and avoid adding runtime protocol, combat automation, production auth,
replay/catch-up semantics, or broader D&D systems by default.
