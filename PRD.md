# Product Requirements Document

## Product Definition

A DM-first, top-down, rules-assisted tactical D&D platform where players submit
structured intents, the server keeps authoritative state, and the Dungeon Master
retains full control over what actually happens.

The product is not a D&D video game or a fully automated CRPG. It is a visual
tabletop runtime that makes map play, turn flow, character state, and DM
bookkeeping easier without replacing tabletop adjudication.

## Product Principles

- **DM authority first:** the DM can see the full game state, inspect hidden
  information, override state, and decide ambiguous outcomes.
- **Player intent, not player truth:** players choose destinations, actions, and
  targets through structured UI, but the server and DM decide what changes.
- **Top-down tactical clarity:** the MVP should prefer readable 2D grid play
  over cinematic or heavy 3D presentation.
- **Reusable content plus reusable characters:** adventures, maps/scenes, assets,
  and player-owned characters should be reusable across sessions.
- **Automation stops at ambiguity:** deterministic validation is useful;
  edge-case rulings remain DM-led.

## Primary Users

### Dungeon Master

The DM operates the runtime. The DM needs:

- an omniscient tactical view,
- fast scene, encounter, and character controls,
- hidden information visibility,
- reliable override tools,
- low bookkeeping friction,
- confidence that the system will not fight their rulings.

### Player

The player participates through a limited, clear view. The player needs:

- a readable map,
- a reliable character sheet,
- clear movement and action affordances,
- confirmation that submitted intents reached the runtime,
- authoritative feedback after the server and/or DM resolves the intent.

## Target Play Loop

1. A player creates or selects a saved character from their character library.
2. A DM creates a session, chooses a rules profile, and selects prepared content.
3. Players join and are assigned characters.
4. The DM activates a starting scene and places the party.
5. Players submit movement, interaction, or combat intents.
6. The server validates deterministic constraints.
7. The DM can approve, reject, modify, or override when needed.
8. Authoritative state updates are broadcast to connected clients.
9. A narrow encounter can be played through with turn tracking, attack
   resolution, downed-state handling, and DM corrections.

## Domain Shape

The product should keep these concepts distinct:

- **Campaign:** a longer-lived organizational container for sessions, notes,
  reusable content, and progression.
- **Adventure:** reusable prepared content containing one or more connected
  scenes.
- **Scene:** one tactical playable space with grid, terrain, objects, hidden
  information, and transition points.
- **Session:** a live runtime instance with participants, assignments, active
  scene, presence, and current state.
- **Encounter:** a combat mode inside a session with turn order and turn usage.
- **Character library entry:** persistent player-owned character identity/build.
- **Character runtime overlay:** mutable session state such as HP, conditions,
  position, visibility, and concentration.
- **Asset:** reusable visual/content pieces such as tiles, props, tokens, icons,
  and markers.

Doors, portals, stairs, trapdoors, and similar links should transition play
between scenes rather than forcing one giant mutable map.

## MVP Scope

The first useful product should include:

- session creation, joining, reconnect, and participant assignment,
- rules-profile selection,
- player character builder and character library foundations,
- prepared adventure/map selection,
- top-down 2D scene presentation,
- active scene placement and movement,
- turn order and turn usage,
- narrow attack/combat loop,
- DM overrides for common corrections,
- read-model recovery after reconnect,
- persistence for important reusable state.

## Current Implementation Reality

The backend currently implements a strong authoritative runtime foundation:

- sessions, participants, reconnect, and SSE updates,
- character create/update/finalize/assign/read flows,
- scene create/read/activate/entity placement,
- active-scene character placement and movement,
- encounter start/read/advance turn,
- action, bonus action, reaction, and movement usage,
- narrow attack resolution with legality-before-RNG,
- HP-derived downed actor gating,
- backend DM commands for HP, condition tags, repositioning, turn usage, current
  turn actor, and encounter ending,
- in-memory command idempotency,
- reconnect recovery through read models,
- Drizzle/Postgres character persistence groundwork.

The frontend remains a minimal shell. The product is not yet MVP-ready because
the character builder/library UI, top-down battle UX, map/content authoring,
durable runtime storage, auth, and broader rules coverage are not complete.

## Explicit Non-Goals For Near-Term MVP

- Full automation of all D&D rules.
- Full spell system.
- Full condition engine and condition effects.
- Opportunity attacks and out-of-turn reaction windows.
- Complete weapons, inventory, ranged combat, or monster AI.
- Advanced line of sight, fog, cover, and lighting as a blocker for early play.
- 3D character/avatar creation or graphics-heavy tactical presentation.
- Voice/video, marketplace, or production-scale multi-process infrastructure.
- Replacing DM judgment with hardcoded automation.

## Success Criteria

The product is moving in the right direction when:

- a player can create and reuse a character without a live session hack,
- a DM can start a session, pick content, and place the party without direct
  admin access,
- players clearly understand where they can move and what they can submit,
- the DM can see and correct the full game state quickly,
- a simple encounter can be completed without out-of-band bookkeeping,
- reconnect and persistence behavior are trustworthy enough for repeated play.
