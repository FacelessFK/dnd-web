# Phase 6 — Slice 1: Attack Action (Foundation)

## Goal

Implement the **first real combat action: attack**

---

## Scope

Add a new encounter command:

```ts
attack;
```

---

## Behavior

When current turn player attacks:

1. validate turn ownership
2. validate target exists in encounter
3. roll attack (server-side)
4. determine hit/miss
5. apply damage if hit
6. update target HP
7. emit BOTH:
   - encounter_state (turn usage change)
   - NEW: combat_event

---

## New Concepts

### 1. combat_event (NEW SSE)

```ts
type: 'combat_event';
```

Payload includes:

- attackerId
- targetId
- roll
- hit/miss
- damage

---

## Rules (simple for now)

- d20 + attack modifier
- compare vs armorClass
- damage = fixed (no dice yet)

---

## Constraints

- only current turn owner can attack
- consumes ACTION
- cannot attack twice

---

## Files to modify

- protocol:
  - encounter.ts
  - NEW: combat.ts
- runtime:
  - encounter-runtime.ts
  - game-runtime.ts
- rules:
  - attack resolution helpers

---

## Acceptance Criteria

- attack works end-to-end
- state updated correctly
- SSE events emitted
- tests cover:
  - hit
  - miss
  - invalid turn
  - double attack

---

## Important

Keep it SIMPLE.

No spells
No conditions
No reactions
No advantage/disadvantage
