# 0002: DM-First Authority And Player Intent Model

## Status

Proposed

## Context

The product vision has now been clarified beyond the initial runtime work.
The platform should preserve full DM authority while still offering structured digital assistance.

## Decision

The system adopts the following product rule:

- the DM is omniscient within the runtime,
- the server is the source of truth,
- players submit structured intents rather than directly mutating authoritative state.

## Consequences

- DM-facing UX must expose full game state and fast override controls.
- Player-facing UX should focus on clarity and legal intent submission.
- Runtime/API design should continue treating client input as intent, not truth.
- Future visibility, movement, combat, and override systems should be designed around this model.
