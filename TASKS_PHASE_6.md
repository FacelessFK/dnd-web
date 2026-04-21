# Phase 6 — Combat Foundation

## Goal

Introduce narrow, server-authoritative combat actions without expanding into full
weapon, spell, condition, death-save, or persistence systems.

## Completed

### Slice 1 — Attack Action Foundation

- Added the `attack` encounter command.
- Added server-side attack roll resolution using `1d20 + attackModifier`.
- Used fixed hit damage of `1` for the temporary foundation.
- Applied target HP changes through the character repository boundary.
- Consumed the current turn action on successful attack resolution.
- Added `combat_event` SSE propagation after successful attack resolution.
- Preserved encounter realtime propagation with `encounter_state`.

### Slice 2 — Attack Legality Pass

- Ensured deterministic attack legality failures happen before consuming the d20
  roller.
- Rejected attacks when the actor is not the current turn owner.
- Rejected attacks when the current turn action is already spent.
- Rejected attacks against downed targets at `0` HP.
- Added a temporary melee-only 5-foot Manhattan reach baseline.
- Required attacker and target to be placed in the active scene.
- Preserved SSE semantics: successful attacks emit `encounter_state` first, then
  `combat_event`; failed attacks emit neither.

## Remaining Phase 6 Candidates

- Add a narrow combat read model if clients need current target HP snapshots
  outside `combat_event`.
- Add explicit combat log/history only when product requirements need it.
- Add weapon/ranged/spell attack slices later, each as separate narrow work.
- Add death/dying semantics later; current HP only clamps at `0`.
- Add persistence/transaction work in a later storage-focused phase.

## Constraints

- No spells yet.
- No ranged attacks yet.
- No weapon or inventory model yet.
- No damage dice expansion yet.
- No condition, death-save, or reaction systems yet.
- No database persistence in Phase 6 foundation slices.
