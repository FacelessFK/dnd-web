# Training Room Skirmish Codex Browser Run

This records a Codex-driven in-app browser pass through the `/runtime` Training
Room Skirmish flow. It is useful product evidence, but it is not a substitute
for a two-human DM/Player table test.

## Run Details

- Date: 2026-05-29
- Branch/build: local working tree
- Commit: not recorded
- Persistence mode: in-memory
- Scenario path tested: default Training Room demo
- Session ID: `8PK2RV`
- Checklist result: pass with cautions

## Environment

- DM browser/profile: Codex in-app browser
- Player browser/profile: same browser switched to Player mode
- Viewports: default in-app browser viewport
- Language(s): Persian and English
- Direction(s): RTL and LTR

## Scope Notes

- Runtime code changed during run: no
- New protocol, combat automation, replay/catch-up, production auth, or broader
  D&D automation tested or claimed: no
- DB-backed saved Character Library submission was not tested in this pass.

## Observed Passes

- DM mode could run **Training Room Skirmish** in the default in-memory path.
- The active scene loaded as **Training Room** with an `8x8` grid.
- **Aria** and **Borin** appeared as sample characters.
- **Training Room Setup** showed prepared state, manual encounter start,
  scenario flow, and DM/server authority copy.
- **Table flow**, **Player roster**, **Table Setup**, and **Recovery status**
  reflected current read models and setup readiness.
- Starting the encounter loaded the encounter read model and showed round/turn
  progress with **Player One** as current actor.
- Player mode hid **Run Training Room Skirmish**, **Scene Builder**, and
  **Monsters & NPCs**.
- Player mode showed the assigned character, tactical grid, current turn,
  movement preview, readiness, and blocked/ready action state.
- `Local Reset` plus recovering the same session ID restored backend runtime
  state through read models.
- Switching to English preserved the Training Room setup, table flow, recovery,
  and roster meaning.

## Cautions

- Persian mode still mixes English and Persian in several high-traffic runtime
  surfaces, including headings such as **Scene loaded**, **DM READINESS**,
  **Table Setup**, **Assignment**, and secondary demo controls such as **Join
  Players**, **Create PCs**, **Assign PCs**, and **Start Encounter**.
- The Training Room demo controls remain useful for local playtest setup, but
  in Persian they still feel partly like developer controls because the action
  labels and some status headings are English.
- Long runtime IDs inside roster and recovery rows are visible and useful, but
  they can dominate compact RTL scanability.
- This pass used one browser profile switched between DM and Player modes. A
  two-profile human pass is still needed before treating table handoff clarity
  as validated.

## Bugs

| Severity  | Surface                     | Mode      | Locale  | Viewport | Steps                                                 | Expected                                                                           | Actual                                                              | Boundary risk          |
| --------- | --------------------------- | --------- | ------- | -------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| Important | Runtime copy/status wording | DM/Player | Persian | Default  | Run Training Room, inspect setup/status/roster panels | Persian mode should preserve equivalent meaning without unnecessary English labels | Several high-traffic labels remain English or mixed English/Persian | i18n / RTL scanability |

## Polish Opportunities

1. Localize the Training Room demo setup secondary controls and nearby status
   labels that remain English in Persian mode.
2. Tighten RTL scanability for status rows that combine Persian labels with
   canonical IDs, coordinates, and runtime copy IDs.
3. Run a true two-profile human DM/Player pass after the i18n polish to confirm
   session handoff and pending/assigned clarity.

## Triage Recommendation

Next narrow implementation slice:

> Polish Persian/RTL scanability for the Training Room runtime status and setup
> panels by localizing remaining high-traffic demo/status labels and making
> mixed Persian plus canonical ID rows easier to scan, without changing runtime
> protocol, command semantics, combat automation, auth, DB requirements, or
> read-model recovery behavior.

Recommended effort: `high`, because this touches runtime UI and i18n surfaces
across several panels, even though it should remain frontend-only.

## Follow-up Codex Browser QA After Persian / RTL Polish

- Date: 2026-05-29
- Branch/build: local working tree after Persian / RTL runtime polish
- Persistence mode: in-memory
- Browser/profile shape: Codex in-app browser, same profile; not a true
  two-human or two-profile pass
- Runtime code changed during run: yes, frontend-only runtime copy/i18n polish
- Protocol, server commands, DB/auth behavior, replay/catch-up, combat
  automation, and Character Library persistence changed or claimed: no

Observed after implementation:

- Persian DM mode could run **Training Room Skirmish** and start the encounter
  with the existing demo path.
- DM mode still showed **Training Room**, **Aria**, **Borin**, table flow,
  recovery status, and turn/target surfaces.
- Recovery status no longer exposed English helper details such as recovery
  read-model sentences in the checked Persian surfaces.
- The outbox badge/check action, Table flow read-model label, Turn & Target
  panel, action economy title, board empty-token text, and DM override controls
  used Persian-facing copy where checked.
- Player mode notice copy for the pre-join state was localized and no longer
  showed the English **Join the table** helper text in the checked Persian
  surface.
- Player-mode guardrail checks in same-profile browser use remain limited by
  shared local storage; true two-profile DM/Player validation is still needed.

Remaining cautions:

- This was not a replacement for a real human DM plus human Player pass in
  separate browser profiles.
- Some canonical product/runtime nouns intentionally remain visible as stable
  IDs or terms, such as `Session ID`, `runtime`, and server URLs.
- DB-backed saved Character Library submission was still not tested in this
  pass.

## True Two-Profile Smoke QA

- Date: 2026-05-29
- Branch/build: local working tree after true two-profile handoff smoke
- Persistence mode: in-memory
- Automation: `node scripts/runtime-two-profile-smoke.mjs`
- Browser/profile shape: two separate headless Chrome processes with distinct
  `user-data-dir` values and separate DevTools ports
- Session ID: `GH546C`
- Runtime code changed during run: yes, frontend/i18n plus smoke coverage only
- Protocol, server commands, DB/auth behavior, replay/catch-up, combat
  automation, and Character Library persistence changed or claimed: no

Observed pass:

- DM profile loaded `/runtime`, stayed in DM mode, ran **Training Room
  Skirmish**, loaded **Training Room**, **Aria**, **Borin**, and the tactical
  grid, then started the encounter.
- Player profile loaded `/runtime` in a separate Chrome profile, switched to
  Player mode, pasted the DM session ID, joined the table, recovered read
  models, and saw **Aria**, the tactical grid, and readiness state.
- Player profile did not expose **Run Training Room Skirmish**, **Scene
  Builder**, or **Monsters & NPCs** while DM profile still exposed DM combatant
  controls.
- Player **Local Reset** cleared only the player browser's local session state;
  the DM profile still showed the same Training Room session and character.
- Re-pasting the same session ID in the Player profile after Local Reset
  recovered **Aria** again from server-owned read models.

Fixes applied from this pass:

- Added a repeatable two-profile smoke script for the Training Room handoff.
- Made session input assignment diagnostics work with both English and Persian
  Session ID placeholders.
- Kept the existing one-profile runtime smoke stable by forcing in-memory
  server startup, pinning its test profile to English locale, and narrowing its
  Local Reset stale-content assertion to actual recovered character names.
- Localized high-traffic Persian session controls for handoff and recovery.
- Localized the Player-side next-step panel title and description, matching the
  already-localized Player notice.
- Re-ran closure validation on 2026-06-04 with
  `corepack pnpm --filter @dnd/web test:smoke` and
  `corepack pnpm --filter @dnd/web test:smoke:two-profile`; the two-profile
  run passed with session `HF4GNL`.
- Made the smoke runners discover Chrome/Edge on Windows without requiring
  `RUNTIME_SMOKE_BROWSER`, and made temporary Chrome profile cleanup tolerate
  short-lived Windows file locks.

Remaining cautions:

- This validates separate browser profiles against in-memory server state, not
  DB-backed saved Character Library submission.
- It does not add or claim replay/catch-up, multi-process SSE semantics,
  production auth, monster AI, or broader combat automation.
- A live two-human table pass is still useful for subjective clarity, but the
  browser-local reset and session handoff mechanics now have repeatable
  automated coverage.

## Post-Slice-5 Triage

- Date: 2026-06-04
- Branch/build: commit `663435a` plus triage-only working tree
- Persistence mode: in-memory
- Automation:
  - `corepack pnpm --filter @dnd/web test:smoke`
  - `corepack pnpm --filter @dnd/web test:smoke:two-profile`
- Two-profile rerun session ID: `E7ZPYN`
- Runtime code changed during triage: no
- Protocol, server commands, DB/auth behavior, replay/catch-up, combat
  automation, and Character Library persistence changed or claimed: no

Observed pass:

- The one-profile runtime smoke passed after the Slice 5 closure commit.
- The two-profile DM/Player handoff smoke passed when run by itself.
- The two-profile smoke still validates Player mode guardrails: Player profile
  does not expose **Run Training Room Skirmish**, **Scene Builder**, or
  **Monsters & NPCs** while the DM profile keeps DM combatant controls.
- Player **Local Reset** remains browser-local in the two-profile run; the DM
  profile keeps the server-owned Training Room session, and the Player profile
  can recover the same backend session again.

Validation caution:

- Running the one-profile and two-profile smoke scripts concurrently can make
  separate Next dev processes contend over `.next/` and fail before `/runtime`
  is ready. Run the smoke scripts sequentially when using them as delivery
  evidence.

Remaining product cautions:

- Persian scanability improved for session handoff and Player next-step copy,
  but high-traffic readiness/roster strings still mix Persian with English
  product nouns such as `setup`, `Session`, `Roster`, `board`, and `scene`.
- Examples observed by source inspection include `setup بازیکن آماده است.`,
  `Session بارگذاری شد`, `setup بازیکن مسدود است`, `انتخاب session`,
  `Roster آمادگی`, `{ready}/{total} آماده روی board`, `آماده روی board`, and
  `در انتظار scene`.
- These are copy/scanability issues only. They do not change server authority,
  DM role gates, read-model recovery, Character Library/runtime separation, or
  combat semantics.

Triage recommendation:

Next narrow implementation slice:

> Polish remaining Persian readiness/roster microcopy in the Training Room
> flow by replacing mixed English/Persian high-traffic labels with
> localization-aware Persian equivalents while preserving canonical IDs,
> `runtime`, `Session ID`, and server URLs where they are intentionally stable.
> Keep this frontend/i18n-only and do not change runtime protocol, command
> semantics, combat automation, auth, DB requirements, or read-model recovery
> behavior.

Recommended effort: `medium`, because the next slice should be a small i18n
copy pass with existing validation and no data-model, protocol, or server
changes.

## Persian Readiness / Roster Microcopy Polish

- Date: 2026-06-04
- Branch/build: local working tree after Slice 7 microcopy polish
- Persistence mode: not applicable to copy-only source inspection
- Runtime code changed during run: frontend/i18n copy only
- Protocol, server commands, DB/auth behavior, replay/catch-up, combat
  automation, and Character Library persistence changed or claimed: no

Implemented polish:

- Replaced mixed Persian/English Player readiness phrases such as
  `setup بازیکن آماده است.`, `Session بارگذاری شد`, `انتخاب session`,
  `board را نگاه کنید`, and `setup بازیکن مسدود است` with Persian-facing
  equivalents while preserving canonical `Session ID`, `runtime`, `DM`, and
  participant terminology.
- Replaced mixed roster phrases such as `Roster آمادگی`,
  `{ready}/{total} آماده روی board`, `آماده روی board`, `در انتظار scene`,
  `Roster بازیکن‌ها`, and `read/eventهای سرور` with Persian-facing readiness
  and roster copy.
- Kept this as UI copy only; no command, server, read-model, DB/auth,
  Character Library/runtime, or combat behavior changed.

Remaining product cautions:

- Adjacent Persian **Table Setup** and disabled-reason helper copy still mixes
  words such as `session`, `join`, `recover`, and `paste` in several
  high-traffic setup blockers.
- These remaining strings are outside the readiness/roster slice and should be
  handled as the next small i18n pass rather than broadening this change.

Triage recommendation:

Next narrow implementation slice:

> Polish remaining Persian Table Setup and disabled-reason helper copy in the
> Training Room flow by replacing mixed English/Persian setup blockers with
> localization-aware Persian equivalents while preserving canonical IDs,
> `runtime`, `Session ID`, server URLs, and protocol/debug labels where they
> are intentionally stable. Keep this frontend/i18n-only and do not change
> runtime protocol, command semantics, combat automation, auth, DB requirements,
> or read-model recovery behavior.

Recommended effort: `medium`.

## Persian Table Setup / Disabled Helper Microcopy Polish

- Date: 2026-06-04
- Branch/build: local working tree after Slice 8 microcopy polish
- Persistence mode: not applicable to copy-only source inspection
- Runtime code changed during run: frontend/i18n copy only
- Protocol, server commands, DB/auth behavior, replay/catch-up, combat
  automation, and Character Library persistence changed or claimed: no

Implemented polish:

- Replaced mixed Persian/English Table Setup phrases such as `ساخت session`,
  `session بارگذاری شد`, `Setup میز`, `join شوند`, `join کنید`,
  `recover کنید`, and `initiative` with Persian-facing setup and readiness
  copy.
- Replaced mixed disabled-helper blockers such as `recover کنید`,
  `paste کنید`, `join شدن`, `assign کنید`, and `combat` with Persian-facing
  helper copy while preserving canonical `DM`, `participant`, and
  `monster/NPC` terms where they are intentionally stable.
- Kept this as UI copy only; no command, server, read-model, DB/auth,
  Character Library/runtime, or combat behavior changed.

Remaining product cautions:

- Adjacent Persian Assignment Request and Character Library bridge copy still
  mixes words such as `pending`, `preview`, `submit`, `recover`, and `session`
  in high-traffic helper text.
- These remaining strings are outside the Table Setup / disabled-helper slice
  and should be handled as the next small i18n pass rather than broadening this
  change.

Triage recommendation:

Next narrow implementation slice:

> Polish remaining Persian Assignment Request and Character Library bridge copy
> in the Training Room flow by replacing mixed English/Persian helper terms
> such as `pending`, `preview`, `submit`, `recover`, and `session` with
> localization-aware Persian equivalents while preserving canonical IDs,
> `runtime`, `Session ID`, source-library identifiers, server URLs, and
> protocol/debug labels where they are intentionally stable. Keep this
> frontend/i18n-only and do not change runtime protocol, command semantics,
> Character Library/runtime separation, combat automation, auth, DB
> requirements, or read-model recovery behavior.

Recommended effort: `medium`.
