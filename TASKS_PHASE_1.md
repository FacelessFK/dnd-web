# ✅ TASKS_PHASE_1.md

## Phase 1 Goal

Build the smallest authoritative session runtime for the platform.

This phase is successful when:

- a DM can create a session
- players can join a session
- the server owns the room state
- connected clients receive synchronized session updates
- no gameplay feature depends on client-side authority

---

## 1. Phase Scope

This phase is intentionally narrow.

It is **not** about:

- combat
- maps
- movement rules
- character validation
- dice resolution

It **is** about:

- session creation
- room membership
- role assignment
- connection lifecycle
- authoritative state ownership
- real-time sync baseline

---

## 2. Core Outcome

By the end of this phase, the system should support:

- one DM creates a session
- multiple players join the same session
- the session exists as an authoritative server-owned room
- all connected clients see the same room state
- joins/leaves/reconnects update session presence correctly

---

## 3. Tasks

## 3.1 Session Domain Model

### Task 1.1 — Define session entity

**Description:** Create the conceptual and implementation model for a session.

**Must include:**

- session ID
- session status
- DM identity
- player list
- connection/presence state
- created time
- updated time
- active rules profile reference
- active scene placeholder

**Definition of Done:**

- Session model is defined
- Required fields are documented
- The model supports both runtime and persistence needs

---

### Task 1.2 — Define participant model

**Description:** Define the structure for session participants.

**Must include:**

- user ID
- role (`dm` or `player`)
- connection status
- display name
- joined time
- optional character reference placeholder

**Definition of Done:**

- Participant model exists
- Role handling is explicit
- Connection state is trackable

---

### Task 1.3 — Define room state model

**Description:** Define the in-memory authoritative room state.

**Must include:**

- session metadata
- participant list
- presence state
- active runtime state placeholder
- pending client connections
- version counter or state revision field

**Definition of Done:**

- Runtime room state structure exists
- State ownership is server-side only
- State revision strategy is defined

---

## 3.2 Session Lifecycle

### Task 1.4 — Implement session creation flow

**Description:** Allow a DM to create a new session.

**Expected behavior:**

- session ID is generated
- creator becomes DM
- room state is initialized
- session becomes available for join flow

**Definition of Done:**

- Session can be created successfully
- Creator is assigned DM role automatically
- Server initializes authoritative state

---

### Task 1.5 — Implement player join flow

**Description:** Allow players to join an existing session.

**Expected behavior:**

- player provides valid join target
- server validates room existence
- participant is added to session state
- all connected clients receive updated session state

**Definition of Done:**

- Players can join an existing session
- Invalid joins fail safely
- Room membership updates are broadcast

---

### Task 1.6 — Implement leave / disconnect handling

**Description:** Handle participant disconnects and exits.

**Expected behavior:**

- participant presence is updated
- room state remains authoritative
- other clients are notified
- DM disconnect behavior is explicitly handled

**Definition of Done:**

- Disconnect updates room state correctly
- Other clients receive presence updates
- Room does not corrupt on disconnect

---

### Task 1.7 — Define reconnect behavior

**Description:** Define and implement the initial reconnect flow.

**Expected behavior:**

- reconnecting clients can resume session presence
- server reattaches them to the existing room if valid
- full room state or initial sync payload is resent

**Definition of Done:**

- Reconnect path exists
- Duplicate participant creation is prevented
- Reconnected client receives authoritative room state

---

## 3.3 Real-Time Communication Baseline

### Task 1.8 — Establish real-time connection model

**Description:** Implement the baseline real-time connection layer between clients and server.

**Must support:**

- connection open
- connection close
- session subscription
- room-scoped updates

**Definition of Done:**

- Connected users can subscribe to a session
- Server can push room updates to all participants
- Updates are scoped to the correct room

---

### Task 1.9 — Define client-to-server command format

**Description:** Define the shape of runtime commands sent from client to server.

**Examples:**

- create session
- join session
- leave session
- reconnect
- ping / heartbeat

**Requirements:**

- command type
- request payload
- actor/user context
- command ID for future idempotency support

**Definition of Done:**

- Command format is documented
- Commands are consistent
- The format is extensible for later gameplay features

---

### Task 1.10 — Define server-to-client state update format

**Description:** Define the response/update payload shape sent from server to clients.

**Should support:**

- initial room sync
- participant updates
- state revision
- metadata for future delta updates

**Definition of Done:**

- Update payload shape is documented
- Clients can render synchronized room state from it
- State revisions are included or planned explicitly

---

## 3.4 Authority & Validation Baseline

### Task 1.11 — Enforce server-side room authority

**Description:** Ensure session state mutations can only happen on the server.

**Must prevent:**

- client-side direct state ownership
- blind trust in client role claims
- cross-room state mutation

**Definition of Done:**

- Server is the only source of session truth
- Role validation happens server-side
- Client input is treated as intent, not truth

---

### Task 1.12 — Validate role permissions for session actions

**Description:** Enforce role-based permissions for session lifecycle actions.

**Examples:**

- only a DM can create a DM-owned session
- only authorized participants can subscribe to a room
- player cannot impersonate DM

**Definition of Done:**

- Basic permission checks exist
- Unauthorized operations fail safely
- Role handling is testable

---

### Task 1.13 — Add session existence and membership validation

**Description:** Validate that session-scoped operations target a real room and valid participant context.

**Definition of Done:**

- Invalid room IDs fail safely
- Invalid membership state fails safely
- Errors are explicit and debuggable

---

## 3.5 Initial Persistence Decisions

### Task 1.14 — Decide temporary runtime persistence strategy

**Description:** Decide what Phase 1 stores only in memory and what is persisted.

**Recommended for this phase:**

- room runtime state may remain in memory
- session metadata may be persisted later
- reconnect behavior can rely on live process state initially

**Definition of Done:**

- In-memory vs persistent boundary is documented
- Team/self knows what is temporary in this phase
- No accidental hidden persistence assumptions

---

### Task 1.15 — Add minimal session event logging

**Description:** Add lightweight logging for session lifecycle events.

**Examples:**

- session created
- participant joined
- participant disconnected
- participant reconnected

**Definition of Done:**

- Session lifecycle events are logged
- Logs are useful for debugging
- Logging does not pollute core logic excessively

---

## 3.6 Testing & Validation

### Task 1.16 — Add tests for session creation

**Description:** Verify session creation behavior.

**Must cover:**

- session ID generation
- DM assignment
- room initialization

**Definition of Done:**

- Tests pass reliably
- Failures are meaningful

---

### Task 1.17 — Add tests for join flow

**Description:** Verify correct room membership behavior.

**Must cover:**

- valid join
- invalid room join
- duplicate join handling
- role safety

**Definition of Done:**

- Join behavior is covered by tests
- Invalid paths are tested

---

### Task 1.18 — Add tests for disconnect/reconnect flow

**Description:** Verify participant connection lifecycle behavior.

**Must cover:**

- disconnect
- reconnect
- no duplicate participant on reconnect
- room state remains stable

**Definition of Done:**

- Presence lifecycle is test-covered
- Reconnect does not corrupt state

---

### Task 1.19 — Manual multiplayer validation

**Description:** Run a manual end-to-end validation using multiple clients.

**Suggested scenario:**

- DM creates session
- 2–3 players join
- one disconnects
- reconnects
- all participants still see correct room state

**Definition of Done:**

- Manual multiplayer flow works
- Basic session sync feels stable

---

## 4. Suggested Deliverables

By the end of Phase 1, the repo should contain:

- session model
- participant model
- room state model
- real-time connection baseline
- session creation/join/leave/reconnect flows
- tests for lifecycle behavior
- minimal logging for lifecycle events

---

## 5. Phase Exit Checklist

Before Phase 1 is complete, confirm:

- [ ] DM can create a session
- [ ] Players can join a session
- [ ] Server owns authoritative room state
- [ ] Clients receive synchronized room updates
- [ ] Disconnect updates presence correctly
- [ ] Reconnect restores session participation correctly
- [ ] Basic permissions are enforced
- [ ] Invalid room operations fail safely
- [ ] Session lifecycle tests pass
- [ ] Manual multiplayer validation has been done

---

## 6. Notes

### What NOT to do in Phase 1

- Do not implement movement logic
- Do not implement combat
- Do not add map rules
- Do not add spell systems
- Do not overbuild persistence
- Do not optimize for large scale yet

### Why this phase matters

If the session runtime is not clean and authoritative, every later system
(movement, turns, combat, dice, DM overrides) becomes harder and more fragile.

### Output of Phase 1

At the end of this phase, the project should have a real multiplayer room runtime.

The next step after this phase is:

- `TASKS_PHASE_2.md`
- or a stack decision discussion before implementation expands further
