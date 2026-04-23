# UX And View Policy

## 1. Product UX Philosophy

The UX should optimize for:

- clarity,
- fast DM operation,
- low player confusion,
- tactical readability,
- low visual ambiguity.

It should not optimize first for:

- cinematic presentation,
- animation-heavy combat,
- complex camera tricks,
- avatar-level 3D customization.

## 2. Visual Direction Recommendation

### Recommended MVP direction

**Top-down 2D tactical view**

Why:

- best match for grid truth,
- easiest to read with multiple entities,
- easiest to build incrementally,
- easiest to keep aligned with D&D movement/range logic,
- lower asset burden than isometric/3D approaches.

### Not recommended for early MVP

- 3D diorama view,
- highly animated action view,
- heavy isometric perspective if it hurts readability,
- visual systems that obscure which cells are actually occupied.

## 3. Character Visualization Recommendation

### MVP representation

Use lightweight tokens.

Recommended token stack:

- portrait or simple avatar image,
- team/player color ring,
- class or archetype icon,
- optional status indicators,
- compact nameplate on demand.

This gives enough identity without requiring a full avatar system.

## 4. DM View Policy

The DM view should be omniscient by product rule.

DM must be able to see:

- full scene,
- hidden objects,
- hidden entities,
- trap/trigger metadata,
- all character states,
- all encounter states,
- all transitions,
- secret content.

The DM should not need secondary admin tools outside the runtime to run a session.

## 5. Player View Policy

The player view should be intentionally limited.

Player should see:

- their own character sheet,
- active scene presentation,
- visible party state,
- reachable movement information,
- relevant current-turn info,
- allowed or selected targets when appropriate.

Player should not directly mutate authoritative state.

## 6. Intent-First Interaction Model

### Movement interaction

1. Player selects a legal-looking destination.
2. UI previews or highlights reachable tiles.
3. Player submits move intent.
4. Server validates movement.
5. Authoritative movement result is applied.
6. DM can override when needed.

### Action interaction

1. Player chooses an action.
2. UI presents allowed targets/options where possible.
3. Player submits intent.
4. Server validates deterministic legality.
5. DM adjudicates ambiguous edge cases.
6. Result is shown authoritatively.

## 7. Tactical UI Priorities

### DM priorities

- full-state awareness,
- quick override controls,
- turn control,
- scene switching,
- trigger execution,
- low-friction correction tools.

### Player priorities

- readability,
- clear current turn state,
- reachable tile highlights,
- structured action choices,
- fast feedback.

## 8. Recommended UI Surfaces

### DM surface

- omniscient map panel,
- selected entity/state inspector,
- encounter/turn control bar,
- action/intention queue or event feed,
- scene/transition controls,
- quick override panel.

### Player surface

- map view,
- character panel,
- turn/action bar,
- reachable tile overlay,
- event/result feed.

## 9. Movement UX Rules

For a square grid with 5-foot cells:

- movement budget should be shown visually,
- reachable tiles should be highlighted,
- blocked cells should be obviously blocked,
- out-of-range destinations should fail gracefully,
- the authoritative server result should always win over local preview.

## 10. UX Principle For Future Features

Whenever a new feature is added, ask:

1. Does this improve DM operability?
2. Does this improve player clarity?
3. Does this preserve authority boundaries?
4. Does this reduce ambiguity instead of adding spectacle-only complexity?

If the answer is mostly no, it probably does not belong in early product scope.
