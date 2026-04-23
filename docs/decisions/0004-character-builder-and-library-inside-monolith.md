# 0004: Character Builder And Library Stay Inside The Main Product

## Status

Proposed

## Context

Character creation and persistent character ownership are now near-term product priorities.
The codebase already favors a modular monolith over early microservices.

## Decision

Character builder and character library should remain inside the main product/monorepo rather than being split into a separate service.

## Why

- Shared contracts are central to character logic.
- Runtime validation and builder validation should stay aligned.
- Early service decomposition would add complexity before product value is proven.
- Existing stack decisions already discourage premature microservices.

## Consequences

- Character builder, character library, runtime overlays, and rules-profile compatibility should evolve as internal modules.
- Future extraction is possible only if proven by scale or operational need.
