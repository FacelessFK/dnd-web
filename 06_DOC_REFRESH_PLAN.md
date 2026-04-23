# Documentation Refresh Plan

## 1. Goal

Update the repository documentation so the clarified product vision becomes explicit and stable.

This plan assumes the repo already has strong runtime-oriented docs and task files.
The goal is to reduce drift between:

- current backend/runtime reality,
- original product aspirations,
- newly clarified product direction.

## 2. New Files To Add

Recommended additions:

- `docs/PRODUCT_BLUEPRINT.md`
- `docs/DOMAIN_MODEL_AND_GAMEPLAY_FLOWS.md`
- `docs/UX_AND_VIEW_POLICY.md`
- `docs/CHARACTER_AND_CONTENT_STRATEGY.md`
- `docs/REVISED_PRODUCT_ROADMAP.md`

Recommended ADR additions:

- `docs/decisions/0002-dm-first-authority-and-intent-model.md`
- `docs/decisions/0003-top-down-2d-tactical-visual-direction.md`
- `docs/decisions/0004-character-builder-and-library-inside-monolith.md`

## 3. Existing Files To Update

### `PRD.md`

Keep:

- DM-first framing,
- player intent loop,
- rules-assisted tabletop framing.

Update:

- make DM omniscient view explicit,
- explicitly state top-down tactical direction for MVP,
- move character builder/library from “future” closer to product MVP,
- clarify adventure/scene/content reuse model,
- reduce emphasis on “full encounter without manual gaps” if product priority is onboarding + operability first,
- add session setup flow: choose rules, choose content, assign characters, activate scene.

### `SYSTEM_DESIGN.md`

Keep:

- server authoritative model,
- intent-based play,
- separation of client/server/DM roles,
- session/scene/encounter vocabulary.

Update:

- split reusable content (adventures/scenes/assets) more explicitly from live runtime state,
- make DM omniscience a product rule,
- clarify player visibility as policy-limited,
- simplify MVP scope away from heavy early spell/condition/visibility breadth,
- add top-down 2D tactical recommendation.

### `ROADMAP.md`

Keep:

- vertical slice principle,
- state correctness first,
- backend/runtime sequence.

Update:

- distinguish technical roadmap from product roadmap,
- move character tools much earlier in product importance,
- reduce confusion from character tools being buried late,
- add session setup and content selection as real product milestones,
- make DM usability/UI and top-down tactical presentation more explicit.

### `README.md`

Keep:

- current runtime status summary,
- API/runtime notes,
- script/setup details.

Update:

- add a concise product definition paragraph matching the new blueprint,
- mention that the long-term product is DM-first and top-down tactical,
- link the new docs under “Main Docs,”
- clarify that current backend maturity is ahead of current frontend/product surface.

### `TASKS_PHASE_9.md`

Keep:

- documentation cleanup role,
- API/manual-validation maintenance scope.

Update:

- note that a second documentation alignment pass may be needed because product vision was clarified after the runtime/API refresh work.

## 4. Files That Mostly Stay As-Is

These are still broadly correct:

- runtime task files for phases 3–10,
- persistence planning docs,
- DM controls task file,
- stack decision file’s anti-microservice direction.

They may need minor references, but not wholesale rewrite.

## 5. Recommended ADR Text Themes

### ADR 0002

Decision:
DM omniscience + player intent submission is a core product rule.

### ADR 0003

Decision:
Top-down 2D tactical presentation is the preferred early product direction.

### ADR 0004

Decision:
Character builder/library stays inside the modular monolith, not a separate service.

## 6. Suggested Merge Order

1. Add the new docs first.
2. Add the ADRs second.
3. Update `README.md`.
4. Update `PRD.md`.
5. Update `SYSTEM_DESIGN.md`.
6. Update `ROADMAP.md`.
7. Update any task/handoff docs that still mention the old priority order.

## 7. Definition Of “Docs Aligned”

The docs are aligned when someone reading the repo can quickly understand:

- this is a DM-first platform, not a video game,
- the DM sees everything,
- players submit intents rather than owning state,
- top-down tactical clarity is the chosen visual direction,
- character builder/library is a major near-term product priority,
- map/adventure content is reusable content, not just runtime state,
- backend/runtime work and product/UX work are distinct but coordinated tracks.
