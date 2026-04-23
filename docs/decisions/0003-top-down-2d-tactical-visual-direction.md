# 0003: Top-Down 2D Tactical Visual Direction

## Status

Proposed

## Context

The project needs a visual direction that supports tactical readability, low implementation overhead, and clear grid truth.

## Decision

The preferred early product visual direction is top-down 2D tactical presentation.

## Why

- It preserves grid clarity.
- It is easier to implement incrementally.
- It reduces asset burden.
- It supports multi-entity readability better than heavier early visual styles.

## Consequences

- MVP character representation should use lightweight tokens/portraits.
- Map authoring should prioritize tile/object readability over spectacle.
- 3D or heavier isometric approaches remain deferred unless later product evidence justifies them.
