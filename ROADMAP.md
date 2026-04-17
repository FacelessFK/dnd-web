# 🛣️ D&D DM-Driven Platform – Product Roadmap

## 1. Purpose

This roadmap defines the implementation path for the D&D DM-Driven Platform.

It translates the product direction from `PRD.md` and the architecture from `SYSTEM_DESIGN.md` into a practical build sequence.

This roadmap is optimized for:

- solo development
- AI-assisted implementation
- iterative validation
- early playable milestones
- controlled technical complexity

---

## 2. Roadmap Principles

- Build the smallest correct core first
- Prioritize state correctness over feature breadth
- Keep the DM workflow usable at every milestone
- Defer broad rules coverage until the runtime is stable
- Avoid implementing systems that cannot yet be validated end-to-end
- Every phase should produce something testable

---

## 3. Success Definition for the Roadmap

The roadmap is successful if it leads to an MVP where:

- a DM can create and run a session
- players can join and interact
- map state is authoritative
- movement and turns are validated
- dice rolls are tracked
- DM overrides are supported
- a basic combat encounter can be completed end-to-end

---

## 4. Build Strategy

This project should be built in **vertical slices**, not as isolated technical layers.

That means each major phase should produce a usable gameplay loop, even if narrow.

Recommended order:

1. Session runtime
2. Character runtime basics
3. Map + movement
4. Turn system
5. Dice + action resolution
6. DM controls
7. Basic combat
8. Reliability + performance
9. Rules expansion

---

## 5. Phase Roadmap

## Phase 0 – Foundation & Repo Setup

### Goal

Create a stable project foundation before feature work begins.

### Outcomes

- repository structure is defined
- docs are placed in root
- naming conventions are established
- development workflow is repeatable
- local environment can run end-to-end

### Deliverables

- repository initialized
- `SYSTEM_DESIGN.md`
- `PRD.md`
- `ROADMAP.md`
- initial folder structure
- README with local setup instructions
- linting/formatting/test baseline
- decision log or notes folder

### Exit Criteria

- project runs locally
- basic CI checks pass
- documentation is committed and discoverable

---

## Phase 1 – Session Runtime Skeleton

### Goal

Create the smallest authoritative room/session model.

### Outcomes

- DM can create a session
- players can join a session
- session state exists on the server
- clients receive synchronized room state

### Scope

- session creation
- join flow
- role assignment
- room isolation
- basic real-time connectivity
- authoritative in-memory room state

### Deliverables

- session service
- room state model
- player presence model
- DM role model
- basic WebSocket or equivalent real-time connection
- session lifecycle events

### Exit Criteria

- one DM and multiple players can connect to the same room
- state changes are broadcast correctly
- no client is treated as source of truth

### Notes

This is the first real foundation of the product.
Do not add combat or maps yet beyond what is necessary to prove room sync.

---

## Phase 2 – Rules Profile & Character Foundations

### Goal

Make sessions rules-aware and characters structurally valid.

### Outcomes

- each session declares a rules profile
- each player has a structured character sheet
- the system can read character data for runtime decisions

### Scope

- rules profile schema
- strictness levels
- canonical character document
- encounter overlay model
- minimal editable character sheet

### Deliverables

- rules profile model
- character schema
- encounter overlay schema
- server-side derived stat computation
- DM-editable character state fields
- character ownership model

### Exit Criteria

- a session cannot exist without a rules profile
- players have usable structured characters
- server can derive basic runtime fields from character data

### Notes

Do not attempt full class/spell support here.
Only implement fields required for movement, turns, HP, AC, and basic attacks.

---

## Phase 3 – Map Runtime & Scene Model

### Goal

Introduce authoritative map state and scene activation.

### Outcomes

- DM can load a scene
- entities exist on a grid
- scene state is synchronized
- multiple prepared scenes are possible

### Scope

- grid system
- scene model
- entity placement basics
- active scene switching
- occupancy representation

### Deliverables

- scene definition format
- runtime scene state
- entity footprint model
- occupancy model
- scene activation flow
- initial hidden-layer support

### Exit Criteria

- a scene can be loaded into a session
- players see the active scene
- entities occupy authoritative map positions
- DM can switch active scene

### Notes

Keep the editor minimal at first.
This phase is about runtime truth, not rich tooling.

---

## Phase 4 – Movement Validation Loop

### Goal

Implement the first meaningful gameplay interaction: movement.

### Outcomes

- player selects a destination
- system validates legal movement
- DM can approve or override
- new position becomes authoritative state

### Scope

- movement budget
- terrain cost
- path validation
- occupied space rules
- reachable tile calculation
- movement intent flow

### Deliverables

- movement validator
- path cost logic
- reachable area visualization contract
- movement command format
- movement state transitions
- DM review/override flow for movement

### Exit Criteria

- player can submit move intent
- server can accept/reject/adjust movement
- resulting position syncs across all clients

### Notes

This is the first real “D&D-feeling” interaction.
Do it carefully.

---

## Phase 5 – Turn System & Combat State Skeleton

### Goal

Introduce formal encounter structure.

### Outcomes

- encounter can start
- initiative order exists
- turns advance correctly
- movement and action usage reset correctly

### Scope

- encounter mode
- initiative handling
- turn order
- turn transitions
- action/bonus/reaction flags
- encounter end flow

### Deliverables

- encounter state model
- initiative data flow
- turn controller
- start/end encounter events
- per-turn usage tracking

### Exit Criteria

- DM can start combat
- initiative is established
- turns progress deterministically
- per-turn state resets correctly

### Notes

At this phase, the system does not need full combat resolution yet.
It needs reliable turn ownership and sequencing.

---

## Phase 6 – Dice Service & Action Resolution

### Goal

Add auditable, authoritative dice and narrow action execution.

### Outcomes

- attack rolls can happen
- damage rolls can happen
- saving throws can happen
- all rolls are logged
- visibility scopes are supported

### Scope

- roll service
- roll visibility
- roll event log
- attack resolution basics
- save resolution basics
- DM override event flow

### Deliverables

- dice engine
- roll event schema
- visibility modes
- attack resolution pipeline
- damage application flow
- override event support

### Exit Criteria

- players can perform a basic attack flow
- rolls are visible according to policy
- DM can override a roll/result without corrupting state

### Notes

Keep spell support out unless absolutely necessary for validating the dice/action model.

---

## Phase 7 – Core Conditions, Reactions & Basic Combat Completion

### Goal

Reach the first full playable combat loop.

### Outcomes

- basic conditions work
- opportunity attacks work
- reactions are consumed properly
- combat encounters are playable end-to-end

### Scope

- core condition subset
- reaction usage model
- opportunity attacks
- prone / grappled / restrained / unconscious basics
- condition-driven validation impacts

### Deliverables

- structured condition engine
- reaction tracker
- opportunity attack resolver
- condition application/removal flow
- combat end state handling

### Exit Criteria

- a DM can run a full simple encounter from start to finish
- state remains correct across the encounter
- core combat loop no longer depends on manual out-of-band tracking

### Notes

This is the **true MVP-combat milestone**.

---

## Phase 8 – DM Control Surface & Usability Layer

### Goal

Make the runtime practical for real DM use.

### Outcomes

- DM can manage the session without hacks
- DM can intervene quickly
- hidden information is manageable
- common manual adjustments are easy

### Scope

- action approval/rejection UI
- HP editing
- position editing
- condition editing
- hidden rolls
- scene controls
- manual event triggers

### Deliverables

- DM control panel
- hidden information controls
- manual mutation tools
- event trigger panel
- audit-friendly override actions

### Exit Criteria

- DM can comfortably operate a live session
- DM does not need direct database/admin access to run a game
- common overrides feel first-class

### Notes

A technically correct system is not enough.
This phase is about practical operability.

---

## Phase 9 – Geometry, Visibility & Cover

### Goal

Add the first advanced tactical subsystem.

### Outcomes

- line of sight is modeled
- cover can affect targeting
- visibility constraints exist
- hidden information becomes more rules-aware

### Scope

- LOS calculation
- cover tiers
- direct target legality
- visibility model
- hidden state rules
- special senses baseline hooks

### Deliverables

- geometry subsystem
- visibility subsystem
- cover evaluator
- line-based targeting checks
- hidden entity visibility states

### Exit Criteria

- cover affects combat meaningfully
- hidden information is partially system-supported
- LOS results are stable and explainable

### Notes

This is likely one of the hardest technical phases.
Do not start here.

---

## Phase 10 – Basic Spellcasting & Expanded Rule Support

### Goal

Add a narrow but usable spell layer.

### Outcomes

- a small subset of spells can be validated
- concentration can be tracked
- target legality works for supported spell types

### Scope

- spell slots
- casting validation
- concentration
- direct-target spells
- limited AoE support
- supported spell whitelist

### Deliverables

- spellcasting validator
- spell action flow
- concentration state model
- AoE template basics
- supported spell registry

### Exit Criteria

- supported spells are reliable
- unsupported spells fail gracefully or fall back to DM-led flow
- concentration is synchronized and auditable

### Notes

Do not aim for “all spells.”
Aim for “small, correct, expandable.”

---

## Phase 11 – Reliability, Reconnect & Persistence Hardening

### Goal

Make the system robust enough for repeated real use.

### Outcomes

- reconnect works reliably
- snapshots reduce recovery cost
- command idempotency is in place
- event history is usable

### Scope

- snapshotting
- reconnect flow
- delta catch-up
- command deduplication
- persistence hardening
- failure recovery flows

### Deliverables

- snapshot strategy
- reconnect protocol
- missed-event replay
- command ID handling
- durability guarantees for important session data

### Exit Criteria

- players can reconnect without breaking session state
- duplicate commands do not cause corruption
- important state survives expected failures

---

## Phase 12 – Performance, Observability & MVP Release Readiness

### Goal

Prepare the MVP for broader use.

### Outcomes

- bottlenecks are visible
- geometry and sync costs are measured
- latency is acceptable
- system can support many small concurrent sessions

### Scope

- performance profiling
- metrics
- logging
- tracing basic critical paths
- room-level health monitoring
- targeted optimization

### Deliverables

- room metrics
- latency dashboards/logging
- command timing instrumentation
- geometry hot path measurements
- basic release checklist

### Exit Criteria

- MVP use under expected load is acceptable
- bottlenecks are known and monitored
- the system is ready for limited real-world testing

---

## 6. Milestone Summary

### Milestone A – Connected Room

End of Phase 1
A DM and players can connect to the same authoritative session.

### Milestone B – Rules-Aware Session

End of Phase 2
Sessions have rules profiles and characters are structurally usable.

### Milestone C – Playable Tactical Map

End of Phase 4
Movement on a synchronized map is working.

### Milestone D – Combat Skeleton

End of Phase 5
Initiative and turns are functional.

### Milestone E – Basic Playable Encounter

End of Phase 7
A simple combat encounter can be played end-to-end.

### Milestone F – Real DM Usability

End of Phase 8
The DM can practically run the game.

### Milestone G – MVP Ready

End of Phase 12
The product is reliable enough for limited release.

---

## 7. Dependency Notes

### Must come early

- session runtime
- rules profile
- character structure
- map state
- movement validation

### Must come before usable combat

- turn system
- dice service
- basic conditions
- DM overrides

### Should come later

- advanced geometry
- spell expansion
- campaign depth
- performance optimization
- advanced tooling

---

## 8. Things to Avoid

- Building full spell support before basic combat works
- Building a rich map editor before runtime state is correct
- Over-designing microservices too early
- Treating UI state as authoritative
- Automating ambiguous rules too aggressively
- Expanding breadth before validating the narrow gameplay loop

---

## 9. Recommended Immediate Next Step

After this roadmap, create:

- a milestone breakdown
- phase-by-phase task lists
- implementation tickets for Phase 0 and Phase 1 first

Do not task out the whole roadmap in full detail immediately.
Only break down the next one or two phases at a time.
