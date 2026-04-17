# 🧠 D&D DM-Driven Platform – System Design Document

## 1. 🎯 Product Vision

### Goal

Build a browser-based, real-time, multiplayer platform for running Dungeons & Dragons sessions where:

- The Dungeon Master (DM) has final authority
- The server is the source of truth for game state
- Rules are enforced digitally where they are deterministic and safe to automate
- Players interact through structured intents rather than unrestricted control
- Maps, entities, turns, rolls, and combat state are visualized clearly

### Product Framing

This platform is **not** a video game simulation of D&D.It is a **rules-assisted tabletop runtime**:

- The **server** owns state correctness
- The **DM** owns adjudication
- The **client** presents UI, visualization, and player intent
- Automation supports play, but does not replace DM judgment

### Non-Goals

- Not a full D&D rulebook simulator in the first release
- Not a AAA 3D game
- Not focused on high-fidelity graphics early on
- Not replacing DM interpretation with hardcoded automation everywhere
- Not attempting full support for every class, spell, subsystem, and edge case in MVP

---

## 2. 👥 User Roles

### Dungeon Master (DM)

- Creates and manages sessions
- Controls scenes/maps
- Approves, rejects, or overrides actions
- Controls NPCs, monsters, and environmental triggers
- Requests rolls when needed
- Decides outcomes in ambiguous or improvised situations
- Edits state when necessary

### Player

- Controls a single character
- Submits action intents (move, attack, cast, interact, etc.)
- Sees only allowed information
- Participates in turn-based combat and scene exploration
- Uses a character sheet as the source of their playable options

### System

- Maintains authoritative room state
- Validates deterministic rules
- Computes legal movement, targeting, derived stats, and state transitions
- Records rolls, overrides, and major events
- Broadcasts state deltas to connected clients

---

## 3. 🧩 Core Concepts (Domain Model)

### Session

A live game instance.

- Has one DM
- Has one or more players
- Has an active rules profile
- Has one active runtime state
- May contain multiple scenes/maps

### Campaign

A longer-lived container for narrative progression.

- Owns reusable characters, notes, map collections, and long-term progression
- Can be linked to multiple sessions

### Scene / Map

A grid-based environment.

- Built from 5-foot cells
- Contains terrain, objects, triggers, and entities
- May be active, inactive, hidden, or prepared
- Multiple scenes may exist per session, but not all must be used

### Entity

Any object with spatial or gameplay meaning.
Examples:

- Player character
- Monster / NPC
- Interactable object
- Terrain feature
- Trap
- Light source
- Trigger zone

### Action

A player or DM intent.
Examples:

- Move
- Attack
- Cast spell
- Dash
- Hide
- Interact
- Ready
- Trigger event

### Roll

A structured dice event.
Examples:

- Attack roll
- Saving throw
- Ability check
- Damage roll
- Hidden DM roll

### Event

An append-only record of an important state transition.
Examples:

- Roll resolved
- Damage applied
- Condition added
- Scene switched
- DM override applied

### Encounter

A combat-focused runtime mode.

- Initiative order is active
- Turn economy matters
- Reactions and conditions are tracked explicitly

---

## 4. 🔄 Core Gameplay Flow

1. DM creates a session
2. Players join the session
3. Session declares a rules profile
4. DM selects, builds, or activates a scene
5. Exploration gameplay begins
6. Players submit structured intents
7. System validates deterministic parts of the request
8. If adjudication is needed, DM is prompted
9. State changes are recorded as events
10. State deltas are broadcast to all relevant clients
11. If combat begins:
    - Initiative is rolled
    - Turn order becomes active
    - Action economy is enforced
12. DM may at any time:
    - Switch scenes
    - Split party across scenes
    - Trigger events
    - Override system outcomes

### Core Principle

> Players propose → System validates → DM decides

---

## 5. ⚖️ Rules Configuration & Version Strategy

Each campaign/session must declare a **rules profile**.

### Why this matters

D&D 5e is not a single unchanging rule set.The platform must account for differences between:

- 5e 2014
- 5e 2024
- optional rules
- house rules
- legacy content mixing

### Rules Profile Includes

- Base ruleset (e.g. 5e 2014, 5e 2024)
- Enabled optional rules
- Allowed content sources
- House rules
- Automation strictness level
- Visibility policy
- Geometry policy
- Legacy content policy

### Recommendation

Every session must declare a `rulesProfileId`.
The engine should **never infer rules behavior from character data alone**.

### Strictness Levels

- `strict_raw` — hard-block illegal actions where rules are deterministic
- `assistive_raw` — warn and allow DM confirmation override
- `dm_led` — minimal blocking, more adjudication prompts
- `narrative` — lightweight logging + dice support, minimal enforcement

### House Rules

House rules should be represented as **structured configuration**, not free text in the engine core.

Examples:

- flanking on/off
- diagonal movement rule
- secret death saves on/off
- potion use timing
- critical hit damage style
- encumbrance enforcement
- public vs whispered checks

---

## 6. 🗺️ Map, Scene & Geometry System

### Grid

- Square grid
- Each cell = 5 feet
- Grid drives movement, footprint, range, and area calculations

### Entity Placement

- Entities occupy 1×1, 2×2, 3×3, etc.
- Snap-to-grid placement
- Occupancy is authoritative and rules-aware

### Layers

- Terrain
- Walls
- Objects
- Entities
- Hidden layer (DM-only)
- Trigger layer
- Optional lighting / visibility metadata

### Scene Behavior

- Scenes are prepared ahead of time
- DM decides which scenes become active
- Not all scenes must be used
- Scene transitions are narrative-driven, not forced by the system

### Geometry Subsystem

Geometry is not cosmetic. It affects:

- movement legality
- line of sight
- cover
- targeting
- area-of-effect inclusion
- hiding and visibility

### Visibility Model

“Fog of war” is treated as:

- line of sight
- cover
- light/obscurity
- hidden information
- special senses

---

## 7. 🎭 Rules & Authority Model

### System Responsibilities

- Movement cost calculation
- Path legality
- Turn enforcement
- Range / target validation
- Dice rolling (optional or configured)
- Initiative sequencing
- Condition application where deterministic
- Spell timing validation where deterministic
- Derived stat computation

### DM Responsibilities

- Final decision authority
- Requesting rolls in ambiguous situations
- Overriding system outcomes
- Triggering world events
- Controlling NPCs and monsters
- Ruling on improvised actions
- Deciding ambiguous cover, movement challenges, and narrative consequences

### Automation Boundary

The system should automate:

- movement budgets
- action economy
- attacks and saves
- initiative
- common conditions
- basic spell legality
- deterministic reaction triggers

The system should defer to DM for:

- improvised actions
- social outcomes
- ambiguous terrain or cover
- edge-case movement
- unusual object interactions
- custom rulings

### Design Principle

> The engine proposes; the DM disposes.

---

## 8. 🧾 Character System

Each player has a **character sheet** that acts as the source of truth for:

- stats
- actions
- movement
- combat calculations
- resources
- spellcasting data
- proficiencies
- senses

### Requirements

The character sheet must be:

- Structured (not just free text)
- Ruleset-aware
- Editable by DM
- Used by the rules engine for validation
- Split into persistent vs encounter-specific data

### Canonical Character Document

Persistent identity/build data:

- name
- class / subclass / level
- species / background / feats
- ability scores
- proficiencies
- inventory
- attacks
- spellcasting setup
- max HP
- base speeds
- senses
- equipment

### Encounter Overlay

Session/encounter-specific runtime data:

- current HP
- temp HP
- position
- initiative slot
- concentration
- conditions
- reaction usage
- action / bonus / movement spent
- visibility state

### Important Rule

Derived numbers should not all be stored as canonical truth.The server should recompute where practical:

- AC
- initiative modifier
- spell save DC
- spell attack bonus
- attack entries
- current movement budget

---

## 9. 🎲 Dice, Audit & Override Model

### Dice System Requirements

Dice must be:

- auditable
- authoritative
- visibility-aware
- replayable
- overrideable by DM

### Visibility Scopes

- Public
- Private to roller + DM
- DM-only / system-private

### Roll Event Must Capture

- roll ID
- actor ID
- rules profile
- expression
- raw dice
- modifiers
- visibility
- final result
- proposed state mutation
- timestamp
- override chain

### DM Override Model

DM overrides must be recorded as events, not silent state mutations.

Examples:

- force success
- force failure
- replace target set
- cancel state mutation
- add/remove effect
- alter total result

### Design Principle

Every important roll and override should be reconstructible from the event log.

---

## 10. 💾 State Model

### Ephemeral State (Hot Runtime)

- active room state
- current scene
- encounter status
- current turn
- movement budget spent
- reaction windows
- temporary effects
- visibility cache
- occupancy cache
- pending DM prompts

### Persistent State (Durable)

- users
- campaigns
- sessions metadata
- maps/scenes
- characters
- inventory/build data
- event log
- snapshots
- session history
- notes

### Separation Rule

Keep **durable state** separate from **runtime caches**.

Examples:

- durable: map definitions, character builds, event history
- runtime: LOS cache, highlighted paths, temporary turn flags

---

## 11. 🏗️ High-Level Architecture

### Client (Browser)

Responsibilities:

- UI rendering
- map visualization
- local selection and interaction
- intent submission
- rendering of deltas and state changes

### Session Server (Authoritative Room Process)

Responsibilities:

- room/session ownership
- state validation
- rules execution
- turn sequencing
- event generation
- broadcasting

### Rules Engine

Responsibilities:

- movement rules
- action legality
- combat validation
- dice logic
- condition/effect processing
- rules profile branching

### Persistence Layer

Responsibilities:

- durable storage for maps, characters, session metadata, event log, snapshots

### Asset Layer

Responsibilities:

- delivery of tiles, tokens, models, icons, sounds, and other static assets
- CDN-friendly distribution

### Event Log + Snapshot Layer

Responsibilities:

- append-only history
- fast reconnect
- replay and audit
- crash recovery

---

## 12. 🔌 Real-Time Runtime Model

### Command Flow

Client → Session Server → Rules Engine → DM adjudication (if needed) → Event Log → State Reduction → Delta Broadcast

### Key Properties

- Strong consistency per room
- Room affinity / sticky execution
- Delta-based updates
- Idempotent commands
- Replayable history

### Why Room Affinity Matters

A single room should not be spread across multiple authoritative workers.A D&D session is a small shared state machine; keeping it together simplifies:

- initiative timing
- reaction windows
- state correctness
- movement legality
- DM override flow

---

## 13. ⚡ Non-Functional Requirements

### Performance

- Low latency per session
- Efficient state updates
- Delta-based sync preferred
- Geometry calculations optimized

### Scalability

- Support ~1000 concurrent users
- Many small sessions, not one massive room
- Scale by rooms, not by global shared state

### Reliability

- Session state correctness
- Fast reconnect support
- Crash recovery through snapshots + event log
- Idempotent command processing

### Security

- Session isolation
- Role/permission separation
- DM-only hidden information
- Protection against client-side trust assumptions

### Observability

- Room metrics
- event throughput
- rule-validation failures
- reconnect frequency
- DM override frequency
- latency per command

---

## 14. 🚨 Key Risks & Bottlenecks

- Real-time state synchronization
- Rule engine complexity
- Geometry / LOS / cover calculations
- Large map or asset transfer
- Reconnection consistency
- DM-heavy event bursts
- Mixed ruleset support
- Multi-scene and split-party complexity
- Over-automation causing friction with DM judgment

---

## 15. 🧱 MVP Scope (Strict)

### Included

- Session creation and joining
- DM + 2–5 players
- Rules profile selection
- Single active scene
- Grid-based movement
- Turn system
- Basic dice service
- DM approval / override system
- Simple map editor
- Character sheet essentials
- Basic conditions
- Opportunity attacks
- Basic visibility / cover handling
- Narrow spell/action support

### Excluded

- Full spell system
- Full class automation
- Advanced AI
- Complex lighting
- Campaign progression depth
- Multiclass + mixed legacy support
- Mounts, crafting, vehicles, underwater rules
- Fancy animations
- Full replay UI

---

## 16. 🚀 Development Phases

### Phase 0 – Problem Framing

- Define product vision
- Define roles
- Define scope
- Define non-goals

### Phase 1 – Requirements

- Functional requirements
- Non-functional requirements
- operational constraints
- success criteria

### Phase 2 – Rules Strategy

- Define supported base ruleset
- Define rules profile schema
- Define strictness levels
- Define house rule model

### Phase 3 – Domain Modeling

- Define entities
- Define relationships
- Define character vs encounter state
- Define event model

### Phase 4 – Architecture Design

- Define client/server boundary
- Define room ownership model
- Define storage boundaries
- Define event + snapshot strategy

### Phase 5 – Core Runtime MVP

- Session system
- Character system
- Dice system
- Movement + validation
- Turn system
- DM controls
- Basic event log

### Phase 6 – Combat & Rules Expansion

- Conditions
- Opportunity attacks
- cover/visibility
- spell validation
- reaction flows

### Phase 7 – Performance & Reliability

- Snapshot tuning
- reconnect logic
- delta optimization
- geometry optimization
- observability

### Phase 8 – Iteration

- Improve rules coverage
- Add features
- expand content support
- optimize UX

---

## 17. 🧭 Guiding Principles

- DM is always in control
- System supports, not replaces, DM
- Build a trustworthy referee, not a brittle rules tyrant
- Start narrow and correct, then expand
- Prefer clarity over premature completeness
- Optimize for room correctness first, scale second
- Treat rules as versioned data, not hardcoded assumptions
- Record important state changes as events
- Never let client UI become the source of truth

---

## 18. ✅ MVP Checklist

- [ ] Freeze source baseline
- [ ] Define `rulesProfile` schema
- [ ] Define `Character` + `EncounterOverlay`
- [ ] Implement server-side dice service
- [ ] Implement initiative and turn sequencing
- [ ] Implement grid movement and terrain costs
- [ ] Implement cover / LOS basics
- [ ] Implement reaction + opportunity attack flow
- [ ] Implement core conditions
- [ ] Implement DM approval / override controls
- [ ] Implement event log + snapshots
- [ ] Implement reconnect from snapshot + missed events
- [ ] Write golden-path tests for rules-critical flows
- [ ] Launch with narrow, reliable rules support

---

## 19. ❓ Open Questions

- Which base ruleset should MVP officially support first?
- How strict should automation be by default?
- Which house rules deserve first-class toggles?
- Should movement be visually smooth while remaining grid-true underneath?
- How should split-party sessions behave in the first release?
- How much spell support is enough for MVP?
- How much of visibility should be fully automated vs DM-assisted?
- How should legacy 2014 content be handled in 2024 sessions?

---

## 20. 📌 Final Design Thesis

This platform should succeed as a **DM-authoritative, rules-assisted tabletop runtime**.

That means:

- the **server** protects correctness
- the **DM** protects interpretation
- the **rules engine** automates only what is deterministic enough to trust
- the **client** makes all of that playable, clear, and fast
