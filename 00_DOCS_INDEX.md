# D&D DM Platform — Documentation Pack Index

This pack is intended to become the new product-alignment baseline for the repo.

## Included Files

1. `01_PRODUCT_BLUEPRINT.md`
   - Source-of-truth product framing after the latest vision clarification.
   - Defines what the product is, what it is not, and how players/DM interact.

2. `02_DOMAIN_MODEL_AND_GAMEPLAY_FLOWS.md`
   - Shared language for core entities and runtime flows.
   - Separates persistent content from live session state.

3. `03_UX_AND_VIEW_POLICY.md`
   - Defines DM view, player view, movement interaction, and tactical UX rules.
   - Helps prevent UI work from drifting away from the authority model.

4. `04_CHARACTER_AND_CONTENT_STRATEGY.md`
   - Clarifies character builder/library strategy, map/adventure authoring, and asset scope.
   - Resolves “in-product vs microservice” and “2D asset vs 3D model” direction.

5. `05_REVISED_PRODUCT_ROADMAP.md`
   - Product-first roadmap that complements the existing technical/runtime roadmap.
   - Reorders priorities toward character-first onboarding and DM-operable play.

6. `06_DOC_REFRESH_PLAN.md`
   - Explains exactly how existing repo docs should be updated.
   - Calls out where current docs are correct, stale, or need reframing.

## Recommended Adoption Order

1. Add `01_PRODUCT_BLUEPRINT.md` and `02_DOMAIN_MODEL_AND_GAMEPLAY_FLOWS.md`.
2. Use `06_DOC_REFRESH_PLAN.md` to update `PRD.md`, `SYSTEM_DESIGN.md`, `ROADMAP.md`, and `README.md`.
3. Keep the current runtime task files, but treat the new product docs as the source of truth for product scope and UX direction.
4. Add the ADR files from `07_decisions/` to lock the new decisions.

## Why This Pack Exists

The current repository documentation is strong on backend/runtime direction, but the latest clarified product vision changes what should be treated as “MVP product surface”:

- DM remains omniscient and authoritative.
- Players submit intents rather than directly controlling authoritative state.
- Top-down 2D tactical play is preferred over heavier visual approaches.
- Character creation/library should move much earlier in product priority.
- Map content should be reusable content, while sessions remain live runtime instances.

This pack turns those clarifications into repo-usable docs.
