# Revised Product Roadmap (Product-First)

## 1. Why This Exists

The existing repo roadmap is strong as a **technical/runtime roadmap**.
This revised roadmap is a **product roadmap** layered on top of it.

It reflects the newer clarified vision:

- DM-first operation,
- player intent model,
- top-down tactical presentation,
- character creation/library earlier in priority,
- reusable content plus live runtime separation.

## 2. Product-First Milestones

### Milestone P1 — Character Onboarding

Goal:
A player can create and save a usable character without entering a live session.

Includes:

- guided character builder,
- character library,
- derived stat preview,
- token/portrait assignment.

### Milestone P2 — Session Setup

Goal:
A DM can create a session, pick rules, pick content, and prepare the party.

Includes:

- session creation,
- rules profile selection,
- adventure/map selection,
- player join,
- character assignment,
- starting scene setup.

### Milestone P3 — Tactical Exploration

Goal:
Players can enter a scene and move through it clearly with DM oversight.

Includes:

- top-down scene view,
- party placement,
- reachable tile highlighting,
- intent-based movement,
- DM reposition/control.

### Milestone P4 — Basic Combat Play

Goal:
A simple encounter can be played end-to-end.

Includes:

- initiative/turn order,
- action/bonus/reaction/movement tracking,
- basic attack flow,
- downed baseline,
- DM turn overrides.

### Milestone P5 — DM Operability

Goal:
The DM can comfortably run a session from inside the product.

Includes:

- DM omniscient view,
- quick override tools,
- HP/condition/position/turn editing,
- scene transitions,
- event/trigger operations.

### Milestone P6 — Durable Runtime Foundation

Goal:
The system can survive restart/reconnect better and move toward true repeated use.

Includes:

- persistent boundaries,
- durable idempotency,
- reconnect hardening,
- later outbox/replay groundwork.

## 3. Recommended Build Order

### Track A — Product Surface

1. Character builder MVP
2. Character library MVP
3. Session setup flow
4. Top-down map/session UI
5. DM control surface UI

### Track B — Runtime / Backend

1. Keep existing runtime slices
2. Complete durability foundations
3. Expand rules only after operability and persistence improve

## 4. Strong Recommendations

### Move earlier than before

- character builder,
- character library,
- session setup UX,
- adventure/map selection UX,
- DM omniscient control UX.

### Keep later than before

- full spellcasting,
- advanced condition engine,
- heavy asset system,
- advanced LOS/cover automation,
- high-complexity graphics.

## 5. Success Criteria For The Product Roadmap

The product is on the right path when:

- a new player can create a character without confusion,
- a DM can start a session without hacks,
- players understand where they can move,
- the map is readable,
- the DM can see and fix everything needed,
- a narrow encounter can be completed smoothly.

## 6. Relationship To Existing Repo Roadmap

This roadmap does **not** replace the technical phase/task files.
It complements them.

Use the existing roadmap and task files for:

- backend/runtime sequence,
- persistence hardening,
- implementation discipline.

Use this revised roadmap for:

- product priority,
- UX sequencing,
- onboarding priority,
- documentation alignment.
