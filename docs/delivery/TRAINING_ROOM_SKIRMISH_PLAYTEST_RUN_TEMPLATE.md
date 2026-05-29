# Training Room Skirmish Playtest Run Template

Use this template to record one human DM/Player run of the
`/runtime` Training Room Skirmish flow. Run it alongside
`docs/delivery/TRAINING_ROOM_SKIRMISH_PLAYTEST_CHECKLIST.md`.

## Run Details

- Date:
- Branch/build:
- Commit:
- Persistence mode: in-memory / DB
- Scenario path tested: default Training Room demo / saved Character Library
  submission / both
- Session ID:
- Checklist result: pass / pass with cautions / fail

## Testers

- DM tester:
- Player tester:
- Observer/note taker:

## Environment

- DM browser/profile:
- Player browser/profile:
- Viewports:
- Language(s): English / Persian / both
- Direction(s): LTR / RTL / both

## Scope Notes

- Runtime code changed during run: yes / no
- New protocol, combat automation, replay/catch-up, production auth, or broader
  D&D automation tested or claimed: yes / no
- If yes, explain why this was intentionally in scope:

## DM Flow Observations

- Session start and Training Room setup:
- Training Room Setup clarity:
- Assignment request review:
- Scene, placement, and roster management:
- Encounter start, turn control, and overrides:

## Player Flow Observations

- Login and session join/recover:
- Saved-character selection and submission:
- Pending assignment feedback:
- Assigned character, token, movement, and action feedback:

## Clarity Checks

- Assignment clarity:
- Placement clarity:
- Turn clarity:
- Read-model/recovery honesty:
- Local Reset versus backend recovery:
- English/Persian and LTR/RTL sanity:

## Confusing Moments

For each item, include mode, locale, viewport, what the tester expected, what
happened, and whether the issue risks DM authority, server authority,
Character Library/runtime separation, recovery honesty, or i18n.

1.
2.
3.

## Bugs

| Severity                     | Surface | Mode | Locale | Viewport | Steps | Expected | Actual | Boundary risk |
| ---------------------------- | ------- | ---- | ------ | -------- | ----- | -------- | ------ | ------------- |
| Blocking / Important / Minor |         |      |        |          |       |          |        |               |

## Polish Opportunities

1.
2.
3.

## Pass/Fail Summary

- Overall result:
- What worked:
- What blocked or slowed the table:
- What should stay explicitly out of scope:
- Boundary risks noticed: DM authority / server authority / runtime copy
  separation / recovery claims / i18n / none

## Top 3 Next Fixes

1.
2.
3.

Convert each next fix into a narrow follow-up slice before implementation. Do
not use this template to approve runtime protocol, combat automation, monster
AI, full spell systems, fog of war, production auth, replay/cursor/catch-up
semantics, or live runtime state mutating reusable Character Library entries.
