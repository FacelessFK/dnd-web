# ✅ TASKS_PHASE_4.md

## Phase 4 Goal

Introduce the first authoritative movement foundation for the platform.

This phase is successful when:

- an assigned character can be placed into the active scene
- a placed character can submit a movement intent
- movement is validated server-side
- illegal movement is rejected authoritatively
- movement logic stays separate from combat and action economy

---

## 1. Phase Scope

This phase is intentionally focused on **movement foundation**, not full gameplay.

It is **not** about:

- combat
- attacks
- spellcasting
- reactions
- opportunity attacks
- turn economy
- difficult terrain
- pathfinding-heavy navigation
- LOS / cover

It **is** about:

- active scene character placement
- movement intent
- destination validation
- movement allowance baseline
- blocking occupancy
- authoritative movement state changes

---

## 2. Core Outcome

By the end of this phase, the system should support:

- a participant’s assigned character can be placed in the active scene
- a placed character can move to a legal destination
- movement is constrained by scene bounds
- movement is constrained by occupancy/blocking rules
- movement is constrained by a baseline allowance derived from character speed
- invalid movement fails safely

---

## 3. Tasks

## 3.1 Shared Domain Extensions

### Task 4.1 — Extend encounter overlay for movement

**Description:** Add the minimal runtime data needed for authoritative movement.

**Must include:**

- footprint on overlay
- scene position usage aligned with active scene
- no unnecessary gameplay expansion

**Definition of Done:**

- Overlay supports placement and movement baseline cleanly
- Overlay remains runtime-focused, not canonical character data

---

## 3.2 Protocol & Commands

### Task 4.2 — Add movement protocol schemas

**Description:** Add transport schemas for movement-related commands and responses.

**Must include commands for:**

- `place_character_in_active_scene`
- `move_character_in_active_scene`

**Definition of Done:**

- Movement command schemas exist
- Success/error response schemas exist
- Validation errors are explicit and consistent

---

### Task 4.3 — Add movement-related error codes

**Description:** Add explicit runtime errors for movement flows.

**Examples:**

- `no_active_scene`
- `no_assigned_character`
- `character_not_placed`
- `movement_out_of_bounds`
- `movement_destination_blocked`
- `movement_exceeds_allowance`

**Definition of Done:**

- Error codes exist
- Error-to-status mapping is defined and coherent

---

## 3.3 Rules Helpers

### Task 4.4 — Add pure occupancy/movement helper functions

**Description:** Add reusable pure helpers for movement validation.

**Must include:**

- occupancy fit-within-grid check
- occupancy overlap check
- destination blocking check
- grid distance calculation
- movement distance in feet calculation

**Definition of Done:**

- Helpers exist in rules package
- Helpers are pure and transport-independent
- Helpers are used by runtime movement validation

---

## 3.4 Movement Runtime

### Task 4.5 — Add movement-specific runtime module

**Description:** Keep movement validation logic out of the main runtime orchestrator.

**Responsibilities may include:**

- active scene requirement
- assigned character requirement
- placement requirement
- movement allowance enforcement
- destination availability checks

**Definition of Done:**

- Movement-specific runtime validation is extracted into a focused module
- Main runtime remains orchestrator-oriented

---

## 3.5 Character Placement Flow

### Task 4.6 — Implement active scene character placement

**Description:** Allow an assigned character to be placed into the active scene.

**Requirements:**

- active scene must exist
- participant must have an assigned character
- character must belong to the session correctly
- destination must be legal
- placement must be authoritative and server-side

**Definition of Done:**

- Valid placement succeeds
- Invalid placement fails safely
- Placement semantics are clearly separate from regular movement

---

## 3.6 Movement Flow

### Task 4.7 — Implement move character in active scene

**Description:** Allow an already placed character to move within the active scene.

**Requirements:**

- active scene exists
- assigned character exists
- character is already placed in active scene
- destination is in bounds
- destination is not blocked illegally
- movement distance does not exceed baseline allowance

**Definition of Done:**

- Valid moves succeed
- Invalid moves fail safely
- Movement remains destination-based only for this phase

---

## 3.7 Occupancy & Blocking

### Task 4.8 — Use scene + character occupancy as movement blockers

**Description:** Validate movement destination against both scene entities and other placed characters.

**Definition of Done:**

- Blocking entities prevent invalid movement
- Other character occupancies prevent invalid movement
- Excluded self-occupancy is handled correctly

---

## 3.8 Server/API Integration

### Task 4.9 — Add movement server command handling

**Description:** Add server support for movement commands.

**Requirements:**

- `/api/movement/command`
- validation
- success responses
- runtime error handling

**Definition of Done:**

- Movement endpoint exists
- Commands are validated
- Runtime errors are returned consistently

---

## 3.9 Tests

### Task 4.10 — Add movement runtime tests

**Description:** Verify core movement flows.

**Must cover:**

- placement into active scene
- valid movement
- out-of-bounds movement rejection
- blocked destination rejection
- movement allowance rejection
- no active scene
- no assigned character
- character not placed

**Definition of Done:**

- Core movement runtime behavior is test-covered

---

### Task 4.11 — Add movement server/API validation tests

**Description:** Verify movement command validation and error paths.

**Definition of Done:**

- Invalid movement payloads are tested
- Runtime validation paths are covered through API layer where practical

---

## 4. Suggested Deliverables

By the end of Phase 4, the repo should contain:

- movement protocol schemas
- movement runtime error codes
- movement rules helpers
- movement runtime module
- placement flow for assigned characters
- move flow for placed characters
- movement endpoint handling
- tests for the above

---

## 5. Phase Exit Checklist

Before Phase 4 is complete, confirm:

- [ ] Assigned character can be placed in active scene
- [ ] Placed character can move legally
- [ ] Out-of-bounds movement is rejected
- [ ] Blocking occupancy is rejected
- [ ] Movement allowance is enforced
- [ ] No-active-scene flow fails safely
- [ ] No-assigned-character flow fails safely
- [ ] Character-not-placed flow fails safely
- [ ] Movement endpoint exists and validates commands
- [ ] Core movement runtime behavior is covered by tests

---

## 6. Notes

### What NOT to do in Phase 4

- Do not implement combat
- Do not implement attacks
- Do not implement action economy
- Do not implement difficult terrain
- Do not implement pathfinding beyond minimal destination checks
- Do not implement LOS/cover
- Do not implement spell logic
- Do not add DB persistence yet

### Why this phase matters

Combat and turn systems cannot be built cleanly until:

- character placement exists
- movement is authoritative
- occupancy is enforced
- movement legality is predictable

### Output of Phase 4

At the end of this phase, the platform should have a real authoritative movement foundation.

The next step after this phase is:

- realtime movement propagation / consistency
- then turn/action economy foundations
