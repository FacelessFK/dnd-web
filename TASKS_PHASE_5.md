# ✅ TASKS_PHASE_5.md

## Phase 5 Goal

Introduce the first authoritative turn-based gameplay foundation for the platform.

This phase is successful when:

- a session can enter an encounter/combat state
- a turn order can exist
- one participant/character can be the current turn owner
- turn progression is authoritative
- per-turn usage state can reset cleanly
- movement/action foundations can attach to turn state later

---

## 1. Phase Scope

This phase is intentionally focused on **turn/action economy foundations**, not full combat resolution.

It is **not** about:

- attack rolls
- damage
- spellcasting resolution
- reactions in depth
- opportunity attacks
- cover / LOS
- status effects resolution
- AI / monster tactics

It **is** about:

- encounter lifecycle
- initiative/turn order baseline
- current turn ownership
- turn advancement
- per-turn action state
- movement budget reset baseline

---

## 2. Core Outcome

By the end of this phase, the system should support:

- starting an encounter in the active scene
- registering encounter participants
- defining a turn order baseline
- tracking whose turn it is
- advancing to the next turn authoritatively
- resetting per-turn usage state for the active turn actor

---

## 3. Tasks

## 3.1 Shared Domain Models

### Task 5.1 — Add encounter/combat state model

**Description:** Define a minimal encounter runtime state.

**Must include:**

- encounter ID
- session ID
- scene ID
- status
- participant entries
- current turn index
- round number

**Definition of Done:**

- Encounter model exists in shared domain code
- It is runtime-focused, not full combat-resolution heavy

---

### Task 5.2 — Add encounter participant model

**Description:** Define a minimal encounter participant entry.

**Must include:**

- characterId or entity reference
- participantId if applicable
- initiative value or initiative order field
- active/inactive flag if needed
- turn usage baseline reference if needed

**Definition of Done:**

- Encounter participant model exists
- It is sufficient for turn ownership and turn progression

---

### Task 5.3 — Add turn/action usage baseline

**Description:** Define a minimal per-turn usage model.

**Must include baseline tracking for:**

- action used
- bonus action used
- reaction used
- movement used

**Definition of Done:**

- Turn usage model is explicit
- It can be reset at turn transitions

---

## 3.2 Protocol & Validation

### Task 5.4 — Add encounter protocol schemas

**Description:** Add transport schemas for encounter/turn commands and responses.

**Must include commands for:**

- `start_encounter`
- `get_encounter_state`
- `advance_turn`

Optional if useful:

- `end_encounter`

**Definition of Done:**

- Command schemas exist
- Response schemas exist
- Validation errors are explicit and consistent

---

### Task 5.5 — Add encounter-related error codes

**Description:** Add runtime errors for encounter/turn flows.

**Examples:**

- `no_active_scene`
- `encounter_not_found`
- `encounter_already_active`
- `no_encounter_active`
- `invalid_turn_advance`
- `invalid_encounter_participant`
- `invalid_scene_encounter_association`

**Definition of Done:**

- Error codes exist
- Error/status mapping is coherent

---

## 3.3 Persistence Boundary

### Task 5.6 — Add encounter repository abstraction

**Description:** Introduce a narrow storage boundary for encounter runtime state.

**Requirements:**

- repository interface
- in-memory implementation
- clone-safe reads/writes

**Definition of Done:**

- EncounterRepository exists
- InMemoryEncounterStore exists
- Future DB-backed replacement is straightforward

---

## 3.4 Runtime Encounter Flows

### Task 5.7 — Implement start encounter flow

**Description:** Allow the DM to start an encounter in the active scene.

**Requirements:**

- active scene must exist
- encounter belongs to current session/scene
- encounter participants are derived from valid placed characters or another narrow baseline
- no duplicate active encounter for the same session

**Definition of Done:**

- Encounter can be started successfully
- Invalid start cases fail safely

---

### Task 5.8 — Implement get encounter state flow

**Description:** Allow session participants to read the current encounter state.

**Definition of Done:**

- Valid encounter retrieval works
- Invalid/no-encounter cases fail safely

---

### Task 5.9 — Implement advance turn flow

**Description:** Allow authoritative progression to the next turn.

**Requirements:**

- current turn index advances deterministically
- round number increments when wrapping
- active turn usage resets correctly
- invalid advance cases fail safely

**Definition of Done:**

- Turn advancement works
- Round progression works
- Per-turn usage reset works

---

## 3.5 Rules / Helpers

### Task 5.10 — Add minimal initiative / turn helpers

**Description:** Add the smallest useful helpers for initiative order and turn progression.

**May include:**

- sort participants into encounter order
- compute next turn index
- detect round wrap

**Definition of Done:**

- Helpers are pure and reusable where practical
- Runtime orchestration stays clean

---

## 3.6 Session / Runtime Integration

### Task 5.11 — Keep encounter state authoritative

**Description:** Ensure encounter state is server-owned and consistent with session and active scene state.

**Requirements:**

- encounter tied to session
- encounter tied to active scene
- encounter state separate from canonical character data
- turn usage separate from canonical character data

**Definition of Done:**

- Runtime boundaries remain clean
- Encounter state does not leak into canonical character model

---

## 3.7 Tests

### Task 5.12 — Add encounter repository tests

**Description:** Verify repository behavior.

**Must cover:**

- create
- get
- save
- missing encounter handling
- clone safety

**Definition of Done:**

- Repository behavior is covered

---

### Task 5.13 — Add runtime tests for encounter flows

**Description:** Verify:

- start encounter
- get encounter state
- advance turn
- round wrap
- invalid encounter start
- invalid turn advancement
- no active scene / no active encounter cases

**Definition of Done:**

- Core encounter runtime behavior is covered

---

### Task 5.14 — Add server/API validation tests

**Description:** Verify invalid command payloads and encounter error paths.

**Definition of Done:**

- Encounter command validation paths are tested

---

## 4. Suggested Deliverables

By the end of Phase 5, the repo should contain:

- shared encounter/turn models
- protocol schemas for encounter commands
- encounter repository abstraction
- in-memory encounter store
- runtime start/get/advance flows
- initiative/turn helper logic
- tests for the above

---

## 5. Phase Exit Checklist

Before Phase 5 is complete, confirm:

- [ ] Encounter model exists
- [ ] Encounter participant model exists
- [ ] Turn usage baseline exists
- [ ] Encounter repository abstraction exists
- [ ] DM can start an encounter in the active scene
- [ ] Participants can read encounter state
- [ ] Turn can advance authoritatively
- [ ] Round progression works
- [ ] Per-turn usage resets correctly
- [ ] Core encounter flows are covered by tests

---

## 6. Notes

### What NOT to do in Phase 5

- Do not implement attack resolution
- Do not implement damage
- Do not implement spell resolution
- Do not implement complex reactions
- Do not implement LOS/cover
- Do not implement monster AI
- Do not add DB persistence yet

### Why this phase matters

Combat cannot be built cleanly until:

- encounter state exists
- turn ownership is authoritative
- turn progression is deterministic
- per-turn runtime usage exists

### Output of Phase 5

At the end of this phase, the platform should have a real authoritative turn foundation.

The next step after this phase is:

- action execution baseline
- then combat resolution slices
