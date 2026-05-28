# Runtime Visual QA Checklist

Use this before merging Training Room Skirmish / Phase 6 runtime cockpit polish
slices. This is a human browser review checklist, not a request to change
runtime behavior.

## Setup

- [ ] Open `/runtime` in a local browser.
- [ ] Run or recover the named Training Room Skirmish flow with current sample
      data.
- [ ] Check both DM mode and Player mode.
- [ ] Check English and Persian, including LTR/RTL layout direction.
- [ ] Keep notes on viewport, mode, locale, and any confusing panel.

## DM Mode Flow

- [ ] `Demo Setup` makes the next Training Room Skirmish action clear.
- [ ] `Table Setup` shows done/next/wait states without requiring protocol JSON.
- [ ] `Tactical Grid` keeps tokens, current turn, selected cell, and movement
      target easy to scan.
- [ ] DM-only controls still read as explicit DM controls, not automated game AI.
- [ ] DM assignment requests are visually distinct from assigned characters.

## Player Mode Flow

- [ ] Player next-step notice clearly says what the player can do now.
- [ ] `Player Character` distinguishes ready to submit, pending DM assignment,
      and active runtime character.
- [ ] Pending assignment does not look complete before the DM assigns the
      runtime copy.
- [ ] Player action controls do not imply the browser can bypass server or DM
      authority.

## Status And Roster

- [ ] `Table flow` clearly summarizes readiness, turn, read-model recovery, and
      next visible action.
- [ ] `Player roster` makes ready players, pending assignment, missing
      placement, active encounter membership, and current turn easy to compare.
- [ ] `Recovery status` describes loaded/current read models without implying
      replay, cursor, catch-up, or event history.
- [ ] `Combat & Event Feed` reads as live summaries only, not durable replay.

## Assignment Clarity

- [ ] Saved Character Library entries read as reusable records.
- [ ] Submission copy says or implies a separate server-owned runtime copy.
- [ ] Runtime HP, position, conditions, movement, encounter membership, scene
      placement, and DM overrides do not appear to mutate the reusable library
      entry.
- [ ] Source library provenance is visible where current data supports it.

## Panel Hierarchy And Scanability

- [ ] Primary play surface and current-turn information stand out first.
- [ ] Secondary status panels are readable without competing with the board.
- [ ] Debug/raw protocol areas feel secondary to the product flow.
- [ ] Panel headers, badges, and dense rows remain legible in dark UI.
- [ ] No panel feels like a new product surface or broad redesign.

## Responsive And Direction Sanity

- [ ] Desktop/wide layout has no overlapping panels, badges, buttons, or text.
- [ ] Compact viewport remains usable for core DM/Player review.
- [ ] Long IDs wrap without breaking panel layout.
- [ ] Persian RTL does not invert canonical IDs or corrupt numeric/status data.
- [ ] English/Persian copy changes, if any, are equivalent in meaning.

## Authority And Scope Guardrails

- [ ] Browser UI presents state as rendered from server responses/read models,
      not as authoritative truth.
- [ ] Recovery wording does not imply replay, catch-up, stream cursors,
      exactly-once delivery, or multi-process SSE coordination.
- [ ] Player intent does not appear to bypass DM assignment or approval.
- [ ] The visual direction feels tactical tabletop with restrained dark-fantasy
      polish.
- [ ] Nothing implies CRPG automation, monster AI, full spell automation, fog of
      war, production auth, or broader D&D automation.

## Result

- [ ] Pass: no blocking visual, copy, authority, i18n, or responsive concerns.
- [ ] Pass with cautions: note follow-up polish items before merge.
- [ ] Request changes: list the exact panel, locale, viewport, and concern.
