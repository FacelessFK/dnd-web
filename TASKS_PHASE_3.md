# ✅ TASKS_PHASE_3.md

## Phase 3 Goal

Introduce the first authoritative world-state foundation for the platform.

This phase is successful when:

- a session can own one or more scenes
- a scene has a valid grid
- scene entities can be created and placed on the grid
- placement is validated server-side
- a session can activate one of its scenes
- scene state is cleanly separated from character and session state

---

## 1. Phase Scope

This phase is intentionally focused on **scene/map runtime foundations**, not gameplay resolution.

It is **not** about:

- movement rules
- combat
- dice resolution
- spell logic
- LOS / cover
- pathfinding
- rich map editor UI

It **is** about:

- scenes
- grids
- scene entities
- occupancy-aware placement
- active scene switching
- repository boundary for scenes

---

## 2. Core Outcome

By the end of this phase, the system should support:

- a DM can create a scene for a session
- a scene has a grid definition
- entities can be placed on the scene
- invalid placement is rejected server-side
- a session can activate a scene
- scene ownership and cross-session validation are enforced

---

## 3. Tasks

## 3.1 Shared Domain Models

### Task 3.1 — Add Scene model

**Description:** Define a shared domain model for scenes.

**Must include:**

- scene ID
- session ID
- name
- grid definition
- entity list
- created time
- updated time

**Definition of Done:**

- Scene model exists in shared domain code
- It is narrow and engine-friendly
- It does not include gameplay-heavy logic

---

### Task 3.2 — Add GridDefinition model

**Description:** Define the grid shape used by scenes.

**Must include:**

- cell size in feet
- width
- height

**Definition of Done:**

- GridDefinition exists in shared domain code
- Validation expectations are documented in protocol/runtime layers

---

### Task 3.3 — Add SceneEntity model

**Description:** Define a minimal scene entity representation.

**Must include:**

- entity ID
- type/category
- name/label
- position
- footprint
- blocksMovement
- blocksVision
- hidden
- metadata placeholder

**Definition of Done:**

- SceneEntity exists
- It is scene/runtime focused, not a full monster/NPC model

---

## 3.2 Protocol & Validation

### Task 3.4 — Add scene protocol schemas

**Description:** Add transport schemas for scene-related commands and responses.

**Must include commands for:**

- create_scene
- get_scene
- activate_scene_for_session
- place_entity_in_scene

**Definition of Done:**

- Command schemas exist
- Response schemas exist
- Validation errors are explicit and consistent

---

### Task 3.5 — Add scene-related error codes

**Description:** Add runtime/protocol error codes for scene operations.

**Examples:**

- scene_not_found
- invalid_scene_session_association
- invalid_grid_size
- invalid_entity_position
- scene_entity_out_of_bounds
- scene_entity_overlap

**Definition of Done:**

- Error codes exist
- Error-to-status mapping is defined in server layer

---

## 3.3 Scene Persistence Boundary

### Task 3.6 — Add SceneRepository abstraction

**Description:** Introduce a narrow storage boundary for scene persistence.

**Requirements:**

- repository interface
- in-memory implementation
- clone-safe reads/writes

**Definition of Done:**

- SceneRepository exists
- InMemorySceneStore exists
- Future DB-backed replacement is straightforward

---

## 3.4 Runtime Scene Flows

### Task 3.7 — Implement create scene flow

**Description:** Allow a DM to create a scene for a session.

**Requirements:**

- validate session membership
- validate DM role
- validate grid definition
- associate scene with session

**Definition of Done:**

- Scene can be created successfully
- Invalid cases fail safely

---

### Task 3.8 — Implement get scene flow

**Description:** Allow a session participant to retrieve a scene belonging to the same session.

**Definition of Done:**

- Valid scene retrieval works
- Cross-session retrieval fails safely

---

### Task 3.9 — Implement activate scene flow

**Description:** Allow a DM to mark a scene as the active scene for a session.

**Requirements:**

- validate DM role
- validate scene belongs to session
- update authoritative session state
- increment session revision
- broadcast session update

**Definition of Done:**

- Active scene can be switched
- Session state reflects the new active scene
- Session SSE emits active scene change

---

### Task 3.10 — Implement entity placement flow

**Description:** Allow a DM to place a scene entity onto a scene.

**Requirements:**

- validate DM role
- validate scene belongs to session
- validate in-bounds placement
- validate no illegal overlap
- respect footprint dimensions

**Definition of Done:**

- Valid placement succeeds
- Invalid placement fails safely
- Placement is validated server-side only

---

## 3.5 Rules Helpers

### Task 3.11 — Add pure grid/placement helper functions

**Description:** Add reusable pure helpers for scene placement validation.

**Must include:**

- grid validity check
- entity fit-within-grid check
- entity overlap check

**Definition of Done:**

- Helpers exist in the rules package
- Helpers are transport-independent
- Helpers are covered by tests directly or indirectly

---

## 3.6 Session Integration

### Task 3.12 — Extend session runtime for active scene support

**Description:** Add active scene mutation to the session store/runtime.

**Requirements:**

- activeSceneId update
- revision increment
- session update broadcast
- no cross-session scene activation

**Definition of Done:**

- Session runtime can activate scenes cleanly
- Existing session architecture remains authoritative

---

## 3.7 Tests

### Task 3.13 — Add scene repository tests

**Description:** Verify repository behavior.

**Must cover:**

- create
- get
- save
- missing scene handling
- clone safety

**Definition of Done:**

- Repository behavior is test-covered

---

### Task 3.14 — Add runtime tests for scene flows

**Description:** Verify scene flows through runtime orchestration.

**Must cover:**

- create scene
- get scene
- activate scene
- valid placement
- out-of-bounds rejection
- overlap rejection
- invalid cross-session activation

**Definition of Done:**

- Core scene runtime behavior is test-covered

---

### Task 3.15 — Add session store tests for active scene updates

**Description:** Verify that active scene updates change authoritative session state correctly.

**Definition of Done:**

- revision behavior is covered
- session update broadcasting is covered

---

### Task 3.16 — Add server/API validation tests

**Description:** Verify invalid command payloads and scene-related errors.

**Definition of Done:**

- Scene command validation paths are tested

---

## 4. Suggested Deliverables

By the end of Phase 3, the repo should contain:

- shared scene/grid/entity models
- protocol schemas for scene commands
- scene repository abstraction
- in-memory scene store
- runtime scene creation/get/activate/place flows
- session active-scene integration
- placement helper functions
- tests for the above

---

## 5. Phase Exit Checklist

Before Phase 3 is complete, confirm:

- [ ] Scene model exists
- [ ] GridDefinition exists
- [ ] SceneEntity exists
- [ ] SceneRepository abstraction exists
- [ ] DM can create a scene
- [ ] Participants can retrieve a valid session scene
- [ ] DM can activate a scene
- [ ] Active scene updates session state correctly
- [ ] Entity placement is validated server-side
- [ ] Out-of-bounds placement is rejected
- [ ] Overlapping placement is rejected
- [ ] Core scene flows are covered by tests

---

## 6. Notes

### What NOT to do in Phase 3

- Do not implement movement rules
- Do not implement combat
- Do not implement pathfinding
- Do not implement LOS/cover
- Do not implement dice
- Do not build a rich map editor UI
- Do not add DB persistence yet

### Why this phase matters

Movement and combat cannot be implemented cleanly until:

- scenes exist
- active scenes are tracked
- occupancy is authoritative
- placement rules exist

### Output of Phase 3

At the end of this phase, the platform should have a real authoritative map/scene runtime foundation.

The next step after this phase is:

- Movement Validation Foundation
