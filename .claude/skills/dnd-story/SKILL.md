---
name: dnd-story
description: Turn a rough DND-web feature idea, polish request, or research finding into a user story with acceptance criteria, edge cases, and out-of-scope items. Use before technical planning when product behavior is unclear. Product language only - no code, no technical design.
---

# DND-web Story Writer

Produce product language only. Do not implement code, write technical design, or
create file-level plans. If product intent is unclear, write an open question
rather than inventing a rule.

## Frame The Story Around The Right Actor

DND-web has three actors with different needs:

- **DM** — omniscient. Needs fast setup, correction tools, and confidence the
  system will not fight a table ruling.
- **Player** — submits structured intent. Needs a readable map, clear
  affordances, and authoritative feedback after resolution.
- **Reviewer/playtester** — needs to run the named Training Room Skirmish
  scenario without reading protocol JSON.

Write the story for one of them. "As a user" is too vague for this product.

## Output

**Story** — one sentence: As a `<DM | player | reviewer>`, I want `<capability>`
so that `<outcome>`.

**Acceptance criteria** — numbered, observable, testable. Each one must be
checkable from the UI or from a command response, not from internal state.
Include:

- what the server must validate or own;
- what the browser must render;
- what must survive a refresh (via read-model recovery);
- what the DM can still override.

**i18n criteria** — always present. New user-facing copy must exist in both
`en` and `fa`, and the layout must hold in RTL. Say which surfaces gain copy.

**Edge cases** — empty state, unassigned character, no active scene, no active
encounter, disconnected participant, defeated combatant, refresh mid-turn,
Player-mode guardrails (a player must not be able to act as another player or
as the DM).

**Out of scope** — be explicit. Default exclusions unless a human says
otherwise: new protocol commands, combat automation, full spell/condition
systems, monster AI, fog of war / line of sight / lighting, ranged / inventory /
death saves, replay / stream cursors / catch-up, production auth, mutating
reusable Character Library entries with live state.

**Open questions** — anything you would otherwise have to invent.

## Stop Here

Do not proceed to implementation. A story needs human approval before
`dnd-spec` or `dnd-build`.
