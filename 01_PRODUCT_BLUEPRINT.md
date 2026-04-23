# Product Blueprint — DM-First Tactical D&D Platform

## 1. Product Thesis

Build a browser-based, DM-first tactical D&D platform where:

- the **server** owns authoritative state,
- the **DM** has final authority over all outcomes,
- the **player** submits structured intent rather than directly mutating game state,
- the **UI** improves clarity, speed, and immersion without replacing tabletop adjudication.

The product is **not** a D&D video game.
It is a **visual, rules-assisted tabletop runtime**.

## 2. Core Product Positioning

### What the product is

- A digital environment for running D&D sessions with map-based play.
- A rules-assisted runtime for movement, turn flow, basic combat state, and bookkeeping.
- A DM-operated system with strong override controls.
- A reusable content platform for adventures/maps plus user-owned characters.

### What the product is not

- Not a full automation engine for all of D&D.
- Not a fully deterministic CRPG.
- Not a replacement for DM judgment.
- Not a graphics-heavy 3D game in the near term.
- Not a microservice-heavy platform at MVP stage.

## 3. Product Pillars

### Pillar A — DM authority without friction

The DM must be able to:

- see the full game state,
- inspect hidden information,
- approve/reject/modify actions,
- override HP, position, turn flow, conditions, and scene progression,
- control pacing without leaving the game surface.

### Pillar B — Player clarity without player authority

Players should:

- clearly understand where they can move,
- understand what actions are currently available,
- submit intentions in a structured way,
- receive immediate authoritative feedback,
- never become the source of truth for runtime state.

### Pillar C — Tactical clarity over visual spectacle

The product should prefer:

- readable top-down play,
- grid truth,
- fast comprehension,
- lightweight token/portrait representation,
- low visual ambiguity.

### Pillar D — Reusable content plus reusable characters

The platform should support:

- maps/adventures prepared ahead of time,
- linked multi-scene adventures,
- user-owned character libraries,
- later reuse of both content and characters across sessions.

## 4. Recommended MVP Product Shape

The first truly usable product should let a group do this:

1. A player creates a character through a guided builder.
2. The character is stored in that player’s character library.
3. A DM creates a live session.
4. The DM selects a rules profile.
5. The DM selects a prepared adventure or map set.
6. Players join the session.
7. The DM or system assigns saved characters to participants.
8. The DM activates a scene and places the party.
9. Players submit move/action intents.
10. The system validates deterministic parts.
11. The DM can intervene at any point.
12. A simple encounter can be played end-to-end.

## 5. Primary User Roles

### Dungeon Master

The DM is the operator of the runtime.

Primary needs:

- omniscient tactical view,
- fast controls,
- low bookkeeping burden,
- narrative control,
- rule override capability,
- confidence that the system will not fight them.

### Player

The player is an intent-submitting participant.

Primary needs:

- clear understanding of available movement and actions,
- low confusion about state,
- a readable map,
- a reliable character sheet,
- confidence that their intent reached the DM/system.

## 6. Product Boundaries

### MVP should include

- session creation/joining,
- rules-profile selection,
- character builder foundation,
- character library foundation,
- prepared map/adventure selection,
- active scene runtime,
- grid movement,
- turn order,
- simple combat loop,
- DM overrides,
- basic tactical visualization.

### MVP should not depend on

- full spell coverage,
- advanced condition engine,
- 3D character creators,
- high-end animation,
- voice/video,
- marketplace,
- deep campaign management,
- complex multi-process infra.

## 7. Design Principles

1. **DM-first, always.**
2. **Client sends intent, not truth.**
3. **Readable beats flashy.**
4. **Top-down 2D beats heavy isometric for MVP.**
5. **Persistent character identity must be separate from live session overlay.**
6. **Prepared content and live runtime state must be separate concepts.**
7. **Automation must stop where ambiguity starts.**
8. **The UI should accelerate tabletop play, not replace it.**

## 8. Immediate Strategic Reframe

The current repo is already strong on runtime/backend groundwork.
The product now needs a stronger front-facing definition.

The most important shift is:

- **Character Builder / Character Library** should move much earlier in product importance.
- **Top-down tactical UI** should become the target visual direction.
- **Map/adventure authoring** should be framed as reusable content authoring, not just runtime scene storage.
- **DM omniscience and player intent submission** should become explicit first-class product rules.

## 9. One-Sentence Product Definition

A DM-first, top-down, rules-assisted tactical D&D platform where players submit intents, the server keeps authoritative state, and the DM retains full control over what actually happens.
