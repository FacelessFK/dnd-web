# User Flows

User-facing flow copy must remain localization-aware. Future labels,
validation messages, success states, errors, empty states, and helper text
should preserve English/Persian support and LTR/RTL compatibility.

## Character Creation Flow

Current implementation:

1. User opens `/login` and registers or logs in in DB mode.
2. User opens `/characters`.
3. User creates a new Character Library entry.
4. Builder collects identity, portrait, rules profile, species/race, class,
   background, abilities, proficiencies, languages, tools, equipment, and
   spells from local MVP data.
5. User saves draft progress.
6. User reviews derived previews and finalizes the reusable entry.
7. User may export a local-template PDF or simple fallback PDF.

Important boundary:

- This creates a reusable Character Library entry.
- It does not create live runtime damage, position, conditions, or encounter
  state.

## Session Setup Flow

Current implementation:

1. DM opens `/runtime`.
2. DM creates or recovers a session.
3. Server returns authoritative session state and SSE stream path.
4. DM may create and activate scenes, place entities, create transition nodes,
   and prepare combatants through runtime controls.
5. Browser renders server responses and read-model recovery state.

Current limitation:

- Prepared adventure selection is not yet a full product surface.

## Player Join Flow

Current implementation:

1. Player opens `/runtime`.
2. Player joins or recovers an existing session.
3. Server records participant membership and returns session state.
4. Player subscribes to the session stream.
5. After refresh or reconnect, the browser rereads authoritative state through
   read models.

Current limitation:

- Player-specific visibility filtering is not complete.

## Character Assignment Flow

Current implementation:

1. Runtime character commands can create/update/finalize a session character.
2. Player can submit a finalized runtime character for assignment.
3. Session stores `pendingCharacterId` on the participant.
4. DM assigns that character to the participant.
5. Session state emits assignment updates.

Next milestone proposal:

- Let finalized reusable Character Library entries be selected/submitted for a
  live session.
- DM approves or assigns the selected library entry to a participant.
- Runtime session character/session overlay state is created or linked.
- Reusable library entries are not mutated by live session play.

## Exploration Flow

Current implementation:

1. DM activates a scene.
2. Characters are placed in the active scene.
3. Players can move only their own token.
4. Server validates placement, movement, occupancy, and active-scene state.
5. Browser renders authoritative movement updates.
6. DM can reposition characters when needed.

Current limitations:

- No full fog of war, line of sight, lighting, traps, locks, scripts, or
  automatic player-triggered transitions.

## Combat Flow

Current implementation:

1. DM starts an encounter in the active scene.
2. Encounter includes assigned player characters and active placed combatants.
3. Runtime tracks turn order and turn usage.
4. Players can use turn resources and make narrow legal melee attacks.
5. DM can create and command narrow monster/NPC combatants.
6. Server applies legality-before-RNG and authoritative HP changes.
7. Event feed reports readable combat results.
8. DM can override HP, turn actor, turn usage, conditions, positions, and end
   the active encounter.

Current limitations:

- No full spell system, full condition engine, opportunity attacks, ranged
  combat, weapon system, death saves, monster AI, or full monster stat blocks.

## DM Override Flow

Current implementation:

1. DM selects the relevant runtime target or control.
2. Browser submits a DM command.
3. Server role-gates and validates the command.
4. Server mutates authoritative state.
5. Stream/read model reflects the corrected state.

Rules:

- DM-only actions must remain role-gated server-side.
- DM overrides must not mutate reusable Character Library entries.

## Scene Transition Flow

Current implementation:

1. DM creates transition nodes on a scene.
2. DM links a transition to a target scene.
3. DM activates the transition.
4. Server validates source scene, transition node, and target scene.
5. Server updates the session active scene.

Current limitations:

- Transition activation does not teleport characters, start/end encounters,
  run scripts, implement locks/traps, or automate hidden reveals.
