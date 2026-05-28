# Codex Factory Progress

## Current Status

DND-web now uses a repo-local Codex-native software-factory workflow.

- `AGENTS.md` is the durable Codex instruction file for this repository.
- Repo-local Codex skills live under `.agents/skills/<skill-name>/SKILL.md`.
- Current skills:
  - `dnd-codebase-researcher`
  - `dnd-story-writer`
  - `dnd-spec-writer`
  - `dnd-task-intake`
  - `dnd-build-with-tests`
  - `dnd-test-verifier`
  - `dnd-implementation-validator`
  - `dnd-runtime-boundary-review`
  - `dnd-pr-reviewer`
  - `dnd-feature-factory`

The factory is now starting to add agent-layer role skills, beginning with
read-only codebase research before planning or implementation.
The agent-layer sequence now supports read-only research, product story
shaping, technical brief writing, guarded implementation, test verification,
implementation validation, and PR review.

The first deterministic repository guard is available as
`guard:sensitive-files`. It blocks staged likely-secret paths by default and
also supports an all-changed mode through
`node scripts/guards/check-sensitive-files.mjs --all-changed`. It is not yet
installed as a git hook or CI step.

`guard:docs-only` also exists to verify docs-only and skill-only tasks did not
touch runtime or source paths. It is manually runnable and is not yet installed
as a git hook or CI step.

## Validated Workflow

The working factory loop is:

1. optional read-only research;
2. product story shaping and human story approval when needed;
3. technical brief and human spec approval when needed;
4. pre-implementation boundary review when risky;
5. guarded implementation with tests;
6. test verification when acceptance coverage is non-trivial;
7. implementation validation;
8. post-implementation boundary review when needed;
9. PR review;
10. human merge decision.

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
