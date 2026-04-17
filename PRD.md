# 📄 D&D DM-Driven Platform – Product Requirements Document (PRD)

---

## 1. 🎯 Product Overview

### Product Name

D&D DM-Driven Platform (working name)

### Summary

A browser-based platform that enables Dungeon Masters (DMs) to run Dungeons & Dragons sessions with:

- structured player actions
- visual maps and entities
- rules-assisted gameplay
- full DM authority over outcomes

The system acts as a **digital tabletop runtime**, not a video game.

---

## 2. 🧠 Problem Statement

Running D&D digitally today has several problems:

- Tools like VTTs (e.g. :contentReference[oaicite:0]{index=0}) lack strong rule enforcement
- Many actions rely on manual tracking (movement, conditions, turns)
- DM overhead is high (tracking state, validating rules)
- Visual clarity is often limited or cluttered
- No clear separation between "player intent" and "game resolution"

### Goal

Reduce DM cognitive load while preserving:

- player freedom
- narrative control
- rule flexibility

---

## 3. 👥 Target Users

### Primary: Dungeon Master (DM)

Needs:

- control over game flow
- ability to override rules
- clear visibility of game state
- fast interaction tools

### Secondary: Player

Needs:

- clear understanding of available actions
- structured interaction
- visual feedback
- minimal confusion about rules

---

## 4. 🎮 Core User Experience

### Player Loop

1. Observe current game state
2. Choose an action (move, attack, interact, etc.)
3. Submit intent
4. Wait for validation / DM decision
5. See result applied

---

### DM Loop

1. Observe full game state (including hidden info)
2. Receive player intents
3. Accept / reject / modify / override
4. Trigger events when needed
5. Control NPCs and world

---

## 5. 🧩 Core Features (MVP)

### 5.1 Session System

- Create session
- Join session (players)
- Assign DM role
- Maintain isolated session state

---

### 5.2 Map & Scene System

- Grid-based map (5ft cells)
- Place entities (players, monsters, objects)
- Support multiple scenes per session
- DM controls active scene

---

### 5.3 Movement System

- Player selects destination
- System calculates valid movement
- Highlight reachable tiles
- Movement requires validation
- DM can override

---

### 5.4 Turn System

- Initiative order
- Turn-based gameplay
- Action / Bonus / Reaction tracking
- Movement tracking per turn

---

### 5.5 Dice System

- Roll d20 and other dice
- Apply modifiers automatically
- Support visibility:
  - public
  - private
  - DM-only
- DM can override outcomes

---

### 5.6 Character System

- Character sheet per player
- Stores:
  - stats
  - HP
  - AC
  - movement
  - abilities
- Used for rule validation

---

### 5.7 Rule Enforcement (Partial)

System should enforce:

- movement limits
- turn order
- attack rolls
- saving throws
- basic conditions

System should NOT enforce:

- improvised actions
- social interactions
- ambiguous situations

---

### 5.8 DM Control Panel

- Approve/reject actions
- Override results
- Modify HP, position, conditions
- Trigger events (traps, scene changes)

---

## 6. ⚖️ Rules Configuration

Each session must define:

- base ruleset (e.g. 5e 2024)
- optional rules
- house rules
- strictness level

### Strictness Levels

- strict → system enforces rules strictly
- assistive → warnings + DM confirmation
- DM-led → minimal blocking

---

## 7. ❌ Non-Goals (MVP)

- Full spell system
- Full D&D rule coverage
- Campaign progression tools
- Voice/video chat
- Advanced AI
- Complex lighting system
- High-end graphics

---

## 8. 📏 Success Metrics

### Product Success

- DM can run a full combat encounter without confusion
- Players understand what actions they can take
- Minimal manual tracking required

### Technical Success

- Stable session state
- Low latency per action
- No desync between players

---

## 9. 🚨 Risks

- Over-automation breaking DM flexibility
- Under-automation causing frustration
- Complex rules creating bugs
- State sync issues in multiplayer
- Performance issues with map/geometry

---

## 10. 🧭 MVP Definition

The MVP is successful when:

- A DM can create a session
- 2–5 players can join
- A map is loaded
- Players can move and attack
- Turns are enforced
- Dice rolls work
- DM can override actions
- A full combat scenario can be played end-to-end

---

## 11. 🔜 Future Features (Post-MVP)

- Full spell system
- Advanced conditions and effects
- Campaign system
- Scene branching tools
- Replay system
- Analytics
- AI-assisted DM tools
- Asset marketplace

---

## 12. 📌 Open Questions

- Which ruleset is MVP default? (2014 vs 2024)
- How strict should rule enforcement be?
- How much control should players have vs DM?
- How detailed should maps be?
- How to handle split-party scenarios?
