# Phase 7 — Basic Combat State Completion

## Phase Goal

Move from a narrow attack foundation toward more playable basic combat state
without becoming a full combat engine.

Phase 7 should make combat state clearer when characters reach 0 HP, keep turn
and attack flows consistent with that state, and prepare for future condition,
death-save, and reaction work without implementing those systems fully.

## Phase Scope

- Represent or derive a basic downed/unconscious combat state for characters at
  0 HP.
- Make HP-at-0 behavior explicit in runtime and protocol boundaries where
  needed.
- Prevent obviously invalid turn-bound actions from downed characters.
- Keep attack, encounter, and turn usage systems consistent when a participant's
  selected character is downed.
- Prefer minimal derived/runtime state over broad canonical character expansion.
- Preserve server-authoritative combat decisions.
- Add focused tests for each implementation slice.

## Explicit Non-Goals

- No full death-save system.
- No full condition engine.
- No reactions beyond a future usage foundation slice.
- No opportunity attack resolution in early Phase 7.
- No spells or spell attacks.
- No weapon, inventory, or equipment system.
- No ranged attacks.
- No monster or NPC AI.
- No database persistence or Drizzle schema work.
- No frontend UI work.
- No full combat log/history persistence.
- No advanced rules automation.

## Suggested Slice Breakdown

### Slice 1 — Downed / Unconscious State Baseline

- Status: completed.
- Define how a character at 0 HP participates in encounter state.
- Prevent downed current-turn actors from attacking.
- Decide the narrow turn behavior for downed actors, such as DM-controlled turn
  advancement or explicit no-op/skip semantics.
- Keep downed state derived from HP where practical.
- Avoid death saves, recovery rules, and full condition modeling.

### Slice 2 — Basic Condition Model Foundation

- Introduce a minimal condition representation only if Slice 1 exposes a clear
  need.
- Keep condition effects narrow and explicit.
- Avoid full rules automation for conditions.
- Preserve separation between canonical character data and encounter/runtime
  state.

### Slice 3 — Reaction Usage Foundation

- Add only the usage/state foundation for reactions.
- Keep reaction state server-owned and encounter-scoped.
- Do not implement opportunity attack resolution yet.
- Do not add reaction triggers or broad event automation.

### Slice 4 — Opportunity Attack Foundation

- Add only after reaction usage exists.
- Keep opportunity attack validation narrow and movement-triggered.
- Avoid broad reaction systems, weapon rules, or tactical automation.

## Slice 1 Detailed Task List

- Downed/unconscious state is derived from `character.hp.current === 0`.
- No canonical `downed` or `unconscious` character field was added.
- No condition engine or death-save state was added.
- Downed current-turn actors cannot use `attack`.
- Downed current-turn actors cannot use `use_action`, `use_bonus_action`, or
  `record_movement_usage`.
- Downed current-turn actors cannot move during an active encounter.
- DM-controlled `advance_turn` remains allowed when the current turn actor is
  downed.
- Target-at-0 rejection from Phase 6 remains intact.
- Existing `encounter_state`, `movement_state`, and `combat_event` payload
  shapes remain unchanged.
- The explicit `turn_actor_downed` runtime error represents this state.

## Acceptance Criteria

- The project has a clear, documented baseline for characters at 0 HP.
- Downed characters cannot perform newly restricted turn-bound actions.
- Attack behavior remains deterministic and validates legality before RNG.
- Existing attack success behavior remains unchanged for valid, conscious
  attackers and targets.
- Failed downed-state actions emit no combat or encounter SSE updates unless a
  later slice explicitly defines a state-change event.
- Runtime, protocol, and rules boundaries remain clean.
- Tests cover the intended downed-state behavior.

## Tests To Add Later

- Death-save behavior once death saves become an explicit future slice.
- Condition read-model behavior if a minimal condition model is introduced.
- Recovery or stabilization behavior if a future phase defines it.
- Protocol schemas for any future downed-state read model if one is added.

## Phase Exit Checklist

- Slice 1 downed/unconscious baseline is implemented and tested.
- Any condition model introduced in Phase 7 remains minimal and explicit.
- Reaction usage exists only as state/usage foundation if implemented.
- Opportunity attack work is isolated to a dedicated later slice.
- No full death saves, weapon system, spells, ranged attacks, combat log
  persistence, or frontend work has slipped into Phase 7.
- All implementation slices pass `pnpm lint`, `pnpm test`, `pnpm typecheck`,
  and `pnpm format:check`.

## Future Work Notes

- Death saves should be a dedicated future slice or phase after the downed
  baseline is stable.
- A full condition engine should wait until concrete gameplay flows require it.
- Weapons, ranged attacks, and spells should each be introduced through narrow
  dedicated slices.
- Combat history/log persistence should wait for a storage-focused phase.
- Monster/NPC combatants and AI should remain separate from participant
  character combat foundations.
