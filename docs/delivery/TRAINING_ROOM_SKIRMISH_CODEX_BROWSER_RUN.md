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
