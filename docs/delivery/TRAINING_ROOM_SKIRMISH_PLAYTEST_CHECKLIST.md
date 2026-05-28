# Training Room Skirmish Playtest Checklist

Use this checklist for a human DM and a human Player playtest of the current
`/runtime` Training Room Skirmish / Phase 6 flow. The goal is to learn whether
the product feels understandable, tactical, and DM-first with the behavior that
exists today.

This is a docs-only playtest guide. It is not a request to change runtime code,
protocol, server authority, persistence, auth, outbox behavior, or combat rules.

For recording one actual run, use
`docs/delivery/TRAINING_ROOM_SKIRMISH_PLAYTEST_RUN_TEMPLATE.md` alongside this
checklist.

## Playtest Setup

- [ ] Record branch/commit, date, persistence mode, browser(s), viewport(s), and
      locale.
- [ ] Start the local web and server apps.
- [ ] Use two browser profiles or windows: one DM, one Player.
- [ ] For the saved Character Library path, run the server in DB mode with the
      auth and Character Library migrations applied, then log the Player in at
      `/login`.
- [ ] Ensure the Player has at least one finalized saved Character Library
      entry before testing saved-character submission. If not, create and
      finalize one through `/characters`.
- [ ] Open `/runtime` as DM and Player.
- [ ] Keep `docs/delivery/RUNTIME_VISUAL_QA_CHECKLIST.md` open for the visual
      pass after the flow pass.

If DB mode or a finalized saved entry is unavailable, mark saved-character
steps as blocked. Do not treat the default in-memory Training Room demo path as
evidence that the logged-in saved-character path was tested.

## Pass Scale

- `Pass`: the tester can understand and complete the step without source-code or
  protocol knowledge.
- `Caution`: the step works, but copy, hierarchy, or state naming is likely to
  confuse a real table.
- `Blocked`: the tester cannot complete the step.
- `N/A`: the step was intentionally skipped for the recorded environment.

For every `Caution` or `Blocked` result, capture the mode, locale, viewport,
what the tester expected, what happened, and whether the issue risks DM
authority, server authority, Character Library/runtime separation, i18n, or
realtime honesty.

## Checklist

### 1. Login And Session Start

- [ ] Player can register or log in at `/login` without mistaking the auth MVP
      for production account security.
- [ ] DM can create or recover a runtime session from `/runtime`.
- [ ] DM can run **Training Room Skirmish** and identify the session ID to share.
- [ ] Player can join or recover the same session.
- [ ] Both browsers show state from the server response or read models, not from
      browser-local assumptions.
- [ ] `Local Reset` reads as browser-local cleanup, not backend session deletion.

Capture likely UX gaps:

- Is the difference between logging in, joining a runtime session, recovering a
  session, and clearing local browser state obvious?
- Does the first visible action tell the DM and Player who should act next?

### 2. Player Saved-Character Selection And Submission

- [ ] Player mode shows the saved-character panel only as a way to submit a
      reusable saved entry into the live session.
- [ ] Loading, signed-out, empty, missing-selection, already-submitted, and
      already-assigned states are understandable.
- [ ] A finalized saved entry can be selected.
- [ ] Submission copy says or clearly implies that the server creates a separate
      runtime copy for this session.
- [ ] The reusable Character Library entry does not read as the live HP,
      movement, condition, scene, or encounter record.
- [ ] The submit button is blocked with useful copy when the Player is not
      joined, not signed in, has no finalized entry, already has a pending copy,
      or already has an assigned runtime character.

Capture likely UX gaps:

- Is the DB/login prerequisite too hidden for a first playtest?
- Are the saved entry, runtime copy, pending character, and assigned character
  names distinct enough for a non-developer?

### 3. Pending Assignment

- [ ] After submission, Player mode clearly shows **pending DM assignment**.
- [ ] The Player cannot make the pending copy become active without the DM.
- [ ] Pending assignment does not look like a completed token placement or
      active encounter character.
- [ ] Pending state remains understandable after Player refresh and recovery.

Capture likely UX gaps:

- Does the Player know whether to wait, ping the DM, or take another action?
- Is pending assignment visible in enough places without becoming noisy?

### 4. DM Assignment

- [ ] DM mode shows the pending request in **Assignment Requests**.
- [ ] The request preview includes useful character details such as name, build,
      HP, AC, speed, runtime copy ID, and source Character Library entry ID when
      current data supports them.
- [ ] Assigning the pending runtime copy is clearly a DM action.
- [ ] After assignment, the pending request clears and the assigned card keeps
      runtime copy/source provenance visible where supported.
- [ ] Nothing suggests that the browser, Player, or saved library entry bypassed
      DM authority.

Capture likely UX gaps:

- Can the DM identify the correct player and character quickly?
- Is source provenance useful, or is it currently too technical for the table?

### 5. Scene And Placement

- [ ] The active scene reads as **Training Room** after the demo setup.
- [ ] DM can identify the tactical grid, sample tokens, scene entities, and
      placement controls without reading protocol JSON.
- [ ] Player can identify their own assigned token.
- [ ] Player movement controls do not imply permission to move another
      participant's token.
- [ ] Missing placement and placed-at coordinates are easy to distinguish in
      the setup/status surfaces.

Capture likely UX gaps:

- Does the board make the tactical situation clear before combat starts?
- Are placement, active scene, and encounter membership too easy to confuse?

### 6. Readiness And Status Overview

- [ ] DM **Table Setup** shows done, next, and wait states for session,
      assignment, scene, placement, and encounter readiness.
- [ ] **Table flow** summarizes readiness, turn, read-model recovery, and next
      visible action without requiring internal implementation context.
- [ ] Player readiness summarizes joined, character, assignment, scene,
      placement, movement, attack, and action-option readiness.
- [ ] Status copy describes current state, not promised automation.

Capture likely UX gaps:

- Which panel gives the clearest "what now" answer?
- Do multiple status panels disagree, duplicate each other, or compete?

### 7. Player Roster

- [ ] **Player roster** shows seated players and their connection state.
- [ ] Assignment states distinguish needs character, pending assignment, and
      assigned runtime character.
- [ ] Placement states distinguish waiting scene, needs placement, and placed.
- [ ] Encounter states distinguish no encounter, not in turn order, waiting
      turn, and current turn.
- [ ] The DM can compare player readiness at a glance.

Capture likely UX gaps:

- Is the roster dense but scannable?
- Does it help the DM run the table, or does it feel like debug output?

### 8. Turn Clarity

- [ ] DM can start the encounter after the scene and placement state are ready.
- [ ] Current-turn rail shows the active actor, remaining movement, and used
      action/bonus/reaction resources.
- [ ] **Encounter status** shows active/ended state, round/turn progress,
      current actor, next actor, latest encounter update, and latest combat
      result where current data supports them.
- [ ] Player mode makes it clear whether it is the Player's turn and which
      movement, target, attack, and action controls are available or blocked.
- [ ] DM override controls still read as explicit DM controls, not monster AI or
      full combat automation.

Capture likely UX gaps:

- Can the Player answer "is it my turn, what can I do, and why is this blocked?"
- Can the DM correct or override state without the UI feeling automated?

### 9. Recovery And Read-Model Honesty

- [ ] Refresh DM, recover the session, and confirm current session, scene,
      active-scene placement, characters, and encounter state return.
- [ ] Refresh Player, recover the same session, and confirm the assigned or
      pending character state returns.
- [ ] Recovery status reads as current read-model recovery, not event replay.
- [ ] No copy implies durable replay, stream cursors, catch-up delivery,
      exactly-once delivery, startup auto-redelivery, or multi-process SSE
      coordination.
- [ ] Local Reset clears browser-local runtime state only; pasting the same
      session ID and recovering can still restore backend runtime truth.

Capture likely UX gaps:

- Does "Recovery status" sound too technical?
- Could testers mistake event feed history for durable replay?

### 10. English/Persian And LTR/RTL Sanity

- [ ] Repeat the main flow in English and Persian, or at minimum switch locales
      after each major state change and recheck the current screen.
- [ ] RTL layout preserves button order, panel hierarchy, status badges, long
      IDs, coordinates, and numeric values.
- [ ] Canonical IDs remain stable and are not localized labels.
- [ ] User-entered character names remain exactly as entered.
- [ ] English and Persian copy carry the same product meaning for DM authority,
      pending assignment, runtime copy separation, and recovery limits.

Capture likely UX gaps:

- Which Persian labels are too long or too technical?
- Do mixed English IDs inside RTL rows hurt scanability?

### 11. Visual Hierarchy And Manual QA

- [ ] The board and current-turn information are the first things testers notice
      during play.
- [ ] Setup, roster, recovery, and event feed panels are secondary but still
      scannable.
- [ ] Raw IDs and operator/debug surfaces do not dominate the play flow.
- [ ] Desktop and compact viewports avoid overlapping text, badges, buttons,
      and panels.
- [ ] The visual direction feels tactical tabletop with restrained dark-fantasy
      polish, not a CRPG automation surface.
- [ ] Complete `docs/delivery/RUNTIME_VISUAL_QA_CHECKLIST.md` for detailed
      visual, responsive, authority, and scope guardrails.

Capture likely UX gaps:

- What panel would a DM ignore during real play because it is visually buried?
- What panel would a Player stare at because the next action is unclear?

## Likely Next UX Gaps To Triage

Use playtest evidence before turning any item into implementation work. Do not
fix these during the playtest; convert confirmed issues into a narrow,
human-approved follow-up slice.

- **Saved-character setup friction:** the full saved-entry path requires DB mode,
  login, and a finalized library entry, while the default Training Room demo can
  run in memory. Testers may need clearer setup copy or docs before runtime copy
  changes.
- **Session handoff clarity:** a human Player may not know whether to join,
  recover, paste a session ID, log in, or use Local Reset.
- **Pending versus assigned clarity:** the same concept appears in Player mode,
  Assignment Requests, roster rows, and assigned character cards. The flow may
  need tighter hierarchy if testers miss the DM approval step.
- **Placement versus encounter readiness:** placed tokens, encounter membership,
  current turn, and roster readiness are related but not the same. Manual notes
  should capture where testers conflate them.
- **Turn/action blockers:** blocked movement, target, attack, and action economy
  states may be technically correct but too dense for first-time players.
- **Recovery wording:** current read-model recovery must stay honest and may
  still sound like replay/catch-up to non-developers.
- **RTL scanability:** Persian rows with canonical IDs, coordinates, and status
  badges may need layout-only polish if they are hard to scan.
- **Panel hierarchy:** tactical play may still compete with setup, roster,
  recovery, event feed, and debug/operator information.

## Gap Log Template

| Severity | Surface | Mode | Locale | Viewport | Observation | Why it matters | Suggested next slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Blocking / Important / Minor | Panel or flow step | DM / Player | English / Persian | Desktop / compact | What happened | Table impact and boundary risk | Docs / copy / UI polish / test-only |

Keep proposed follow-ups small. Do not broaden into new runtime protocol,
combat automation, monster AI, full spell systems, fog of war, production auth,
replay/cursor/catch-up semantics, or Character Library records mutating live
runtime state.
