# Codex Factory Progress

## Current Status

DND-web now uses a repo-local Codex-native software-factory workflow.

- `AGENTS.md` is the durable Codex instruction file for this repository.
- Repo-local Codex skills live under `.agents/skills/<skill-name>/SKILL.md`.
- Current skills:
  - `dnd-task-intake`
  - `dnd-build-with-tests`
  - `dnd-runtime-boundary-review`
  - `dnd-pr-reviewer`
  - `dnd-feature-factory`

## Validated Workflow

The working factory loop is:

1. intake;
2. human approval;
3. pre-implementation boundary review when risky;
4. build with tests;
5. post-implementation boundary review when needed;
6. PR review;
7. human merge decision.

This workflow has been used on real Training Room Skirmish / Phase 6 polish
slices.

## Successful Factory Slices

- Assignment-flow clarity polish.
- Runtime status / table-flow overview.
- Per-player readiness roster clarity.

## Current Product Direction

Continue polishing the Training Room Skirmish / Phase 6 DM-player product flow.
DND-web should remain a browser-based, tactical, visually richer tabletop
runtime over time, with presentation inspiration from Diablo/Hades, while
staying DM-first, server-authoritative, and tabletop-oriented.

## Guardrails

- Do not expand into CRPG systems, full automation, monster AI, full spell
  systems, fog of war, or production auth.
- Do not change protocol, server behavior, persistence, auth, outbox/replay
  semantics, or runtime architecture unless explicitly scoped.
- Preserve Character Library/runtime separation.
- Preserve English/Persian i18n and RTL/LTR behavior.

## Recommended Next Slices

- More focused visual polish for runtime cockpit panels.
- DM/player table-flow layout tightening.
- Training Room Skirmish playtest script/checklist.
- Later, after more product-flow slices: broader visual identity pass.
