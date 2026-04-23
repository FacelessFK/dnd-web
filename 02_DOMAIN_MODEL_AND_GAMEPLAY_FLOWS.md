# Domain Model And Gameplay Flows

## 1. Why This Document Exists

The product now needs cleaner separation between:

- reusable content,
- user-owned character identity,
- live session state,
- encounter overlays,
- tactical UI behavior.

This document defines the shared language for that separation.

## 2. Core Domain Objects

### User

A persistent account/person using the platform.

Owns:

- one or more characters,
- authored content where allowed,
- preferences/settings,
- participation history.

### Character Library Entry

A persistent player-owned character.

Contains:

- character identity,
- class/background/species/race,
- base stats,
- progression data,
- inventory/loadout foundation,
- portrait/token configuration,
- rules-profile compatibility metadata.

This is **not** the same as live encounter state.

### Character Session Overlay

A live session-specific overlay applied to a character.

Contains:

- current HP,
- temp HP,
- active conditions,
- concentration,
- position,
- current visibility,
- encounter turn usage state,
- temporary session-only effects.

This may be reset or discarded without destroying the character library entry.

### Adventure

A reusable content container.

Contains:

- one or more scenes,
- transitions between scenes,
- optional metadata such as recommended level, tags, notes.

A DM selects an adventure (or standalone map set) when preparing a session.

### Scene

A single tactical playable space.

Contains:

- grid definition,
- terrain tiles,
- placed props/objects,
- doors/portals/triggers,
- hidden information,
- authored layout data.

A scene is content, not live runtime truth by itself.

### Session

A live running game instance.

Contains:

- DM,
- participants,
- selected rules profile,
- selected adventure/content,
- active scene reference,
- participant ↔ character assignment,
- presence state,
- live runtime state.

### Encounter

A live combat mode inside a session.

Contains:

- participants in combat,
- turn order,
- current turn,
- round number,
- action/bonus/reaction/movement usage.

### Asset

A reusable visual/content asset.

Examples:

- terrain tile,
- wall tile,
- prop sprite,
- token portrait,
- icon,
- marker.

## 3. Recommended Content Hierarchy

Use this hierarchy:

- **Asset** → raw visual/content piece
- **Scene** → one tactical map space
- **Adventure** → a collection of connected scenes
- **Session** → a live play instance using selected content
- **Encounter** → a combat state within a session

This avoids overloading the word “map.”

## 4. Recommended Runtime Hierarchy

### Persistent / reusable

- users,
- character library entries,
- adventures,
- scenes,
- assets,
- authored content metadata.

### Live / runtime

- sessions,
- participant presence,
- active scene choice,
- character session overlays,
- encounter state,
- transient prompts/events.

## 5. Player And DM Runtime Flow

### Session setup flow

1. DM creates a session.
2. DM chooses a rules profile.
3. DM chooses an adventure or map set.
4. Players join.
5. Players choose from saved characters.
6. DM confirms/assigns characters.
7. DM activates the starting scene.
8. Characters are placed into the scene.
9. Exploration begins.

### Exploration flow

1. Player sees allowed information.
2. Player submits a move or interaction intent.
3. System validates deterministic constraints.
4. If clear and allowed, state updates.
5. If ambiguous, DM decides.
6. Updated authoritative state is broadcast.

### Encounter flow

1. DM starts an encounter.
2. Turn order becomes authoritative.
3. Current actor submits an action intent.
4. System validates deterministic legality.
5. DM may override or modify.
6. Outcome is applied to live state.
7. Encounter/character/movement events are broadcast.

## 6. Character Modeling Rule

Do not mix these two concerns:

### Character identity/build

Persistent and reusable.

### Character runtime overlay

Temporary and mutable during play.

This separation matters for:

- level up,
- inventory persistence,
- adventure reuse,
- reconnect behavior,
- persistence design,
- DM overrides.

## 7. Scene Transition Rule

A door, portal, stairway, trapdoor, or scripted trigger should move play from one scene to another, not mutate one giant scene endlessly.

Recommended model:

- a scene contains transition nodes,
- each transition points to another scene,
- DM chooses whether transition is automatic, gated, hidden, or manual.

## 8. Object And Footprint Model

Objects and props are not all 1x1.

Each placeable object should support:

- width in grid cells,
- height in grid cells,
- blocks movement,
- blocks vision,
- hidden state,
- interactable state,
- metadata.

Examples:

- crate = 1x1,
- large chest = 2x1,
- altar = 2x2,
- table = 2x3,
- pit = multi-cell terrain feature,
- wall = line or multi-cell structure.

## 9. Movement Authority Rule

Movement should be intent-based.

The player chooses a destination.
The client never becomes authoritative about reaching it.

The server decides movement legality using:

- active scene,
- current position,
- speed/movement allowance,
- cell size,
- blocking occupancy,
- special terrain rules if enabled,
- turn ownership when in encounter.

The DM can still override the result.

## 10. Visibility Rule

### DM

Sees:

- all entities,
- hidden layers,
- trap markers,
- transitions,
- secret notes/triggers,
- full runtime state.

### Player

Sees only what policy allows.

MVP recommendation:

- keep player visibility simple at first,
- do not block early progress on advanced LOS/fog complexity,
- but keep the model ready for hidden entities and future visibility rules.

## 11. Future-Safe Extensions

This domain model intentionally leaves space for later:

- campaign progression,
- monsters/NPC libraries,
- advanced inventory,
- spell registries,
- condition engines,
- outbox/event history,
- content publishing or marketplace.

Those should extend the model, not force a rewrite of the core distinctions above.
