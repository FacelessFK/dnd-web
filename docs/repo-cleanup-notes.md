# Repository Cleanup Notes

## Removed

- Root planning packs and phase task files: obsolete historical planning docs
  that duplicated current `README.md`, `docs/project-handoff.md`, and
  `docs/persistence-boundaries.md`.
- `docs/dnd-claude/`: archived standalone Vite/mockup app duplicated by the
  current integrated Character Builder source under `apps/web`.
- `docs/dnd5eng.pdf`: large reference PDF not used by current code.
- Raw `docs/design/` and `docs/concept/` drops: not referenced by current docs
  or UI after cleanup.

## Kept

- ADRs in `docs/decisions/` because they still explain durable project
  decisions.
- Current operational docs: API surface, manual validation, persistence
  boundaries, project handoff, Codex workflow, and Character Builder asset,
  rules, and PDF notes.
- DB migrations and all `apps/` / `packages/` source code.

## Brought From Old Working Copy

- Referenced Character Builder public assets under
  `apps/web/public/assets/character-builder/`.
- Local Character Sheet PDF templates under
  `apps/web/public/assets/character-sheets/`.

Skipped old `.env`, logs, caches, build output, duplicate PNG exports,
race-portrait zip/raw folders, and unrelated dirty source/config changes.
