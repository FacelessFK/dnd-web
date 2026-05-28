# Manual End-to-End Validation

This guide validates the default local server path, which still starts with the
in-memory authoritative runtime by default. It is intentionally copy-pasteable
and does not require frontend UI, database persistence, event replay, auth, or
deployment.

Phase 10 added injected DB-backed character, session snapshot, and scene
boundaries. Phase 11 added injected DB-backed active-encounter,
encounter-only transaction, attack-first cross-store combat transaction, and
encounter-aware movement transaction boundaries. Phase 12 now adds a narrow
DB-backed pre-execution idempotency-claim foundation, the narrow DB-backed
scene transaction baseline for covered scene-only durable writes, and the
single-process session/character/movement/encounter/combat outbox
persistence foundation plus covered live-command post-commit dispatch for the
already-covered DB paths. Unpublished outbox rows may remain stored after a
restart, but they are not auto-redelivered on cold boot because SSE
subscribers are process-local and there is still no replay or catch-up
surface. DB-backed runs can inspect unpublished backlog counts with
`GET /api/outbox/status`; that status read does not drain or replay rows.
DM mode in `/runtime` also has a manual outbox status badge for the same
read-only endpoint. This manual curl flow still validates the default in-memory
startup path rather than those injected durable restart or transactional paths.
The automated server suite now carries the DB-backed missed-delivery recovery
audit for that transactional/read-model contract.

For browser-based manual operation of the same runtime surface, start both apps
with `pnpm dev` and open `http://localhost:3000/runtime`.

The examples below use `bash`, `curl`, and `jq` for capturing IDs. If you do not
have `jq`, run the same `curl` commands and copy the returned IDs into the
environment variables manually.

For browser-driven local playtesting, start the server and web app with
`pnpm dev`, open `/runtime`, and choose DM mode or Player mode. DM mode exposes
the Table Setup checklist, named demo scenario setup, scene setup, monster/NPC
combatant, encounter, and override controls. Player mode can join or recover a
session, view its assigned
character, move its own token, use its own turn resources, and attack selected
player targets. On the tactical board, use the camera controls to zoom in/out,
pan around the scene, and reset the view; this camera state is local browser UI
state. The board also marks the selected movement cell, selected token,
current-turn actor, and attack target with compact badges. During an active
encounter, confirm the compact current-turn rail above the grid shows the
current actor, remaining movement, and action/bonus/reaction usage. In the
Turn & Target panel, confirm the encounter status feedback shows active/ended
or no-encounter status, round/turn progress, current actor, next actor, latest
encounter update, and latest combat result after a hit or miss. Choose a target
and confirm the target feedback block shows target HP/AC, attack readiness or
the disabled reason, and the latest attack result after a hit or miss. In the
Player readiness panel, confirm the readiness summary shows session, joined,
character, assignment, scene, placement, and turn readiness states, plus current
actor, token position, selected target, movement readiness, attack readiness,
and available action-option count. In the
same panel, confirm the action economy feedback shows the current actor, latest
encounter update, and action/bonus/reaction resources as available, used, or
blocked. After spending one of those resources, confirm only that resource's
button shows the used-resource blocker while the remaining resources stay
available when the server read model allows them. Select a destination cell and
confirm the movement preview shows the acting token, current cell, destination
cell, distance, current turn movement budget, and any blocked reason before
submitting movement. When a board cell is focused, use arrow keys to move the
selected cell, Home to jump to the first cell, and End to jump to the last cell.
Local Reset clears browser runtime state only; it does not delete backend
sessions or runtime state.

For a human DM plus human Player Training Room Skirmish pass, use
`docs/delivery/TRAINING_ROOM_SKIRMISH_PLAYTEST_CHECKLIST.md`. It focuses on
login/session start, saved-character submission, pending assignment, DM
assignment, placement, readiness/status overview, roster, turn clarity,
read-model honesty, English/Persian direction, visual hierarchy, and UX gaps to
triage next.

In DM mode, confirm the Table Setup checklist changes as the table advances:
with no session it should show session creation as the next action; after
players join it should advance toward character assignment; after assignment,
scene activation, and token placement it should mark those steps done; after at
least one token is placed it should show encounter start as available.

In the DM Scene Builder panel, confirm the Entity palette buttons fill the
existing Place entity draft for wall, cover, marker, hidden prop, player spawn,
and monster spawn presets. Confirm selecting a preset does not persist anything
until **Place Entity** succeeds, and that the footprint, blocking, vision, and
hidden fields remain editable before submission.

In the DM Scene Transitions panel, confirm the Transition presets buttons fill
the existing Create transition draft for door, stairs, portal, gate, and other
exits. Confirm selecting a preset preserves the currently chosen target scene
ID/label, does not persist anything until **Create Transition** succeeds, and
leaves kind, name, footprint, hidden, blocking, target, and notes editable
before submission.

A lightweight automated browser smoke for the same surface is available with
`pnpm --filter @dnd/web test:smoke`. It starts local server/web dev processes,
runs the named Training Room Skirmish demo scenario through headless Chrome,
validates read-model recovery after reload, checks the Recovery Status summary,
checks Player mode guardrails, confirms Local Reset clears only browser state,
and verifies stale demo table text is no longer visible after reset. It then
restores the same session ID and confirms the backend runtime state, Recovery
Status summary, and Encounter Status summary can still be recovered. It is
intentionally not a full production E2E suite. When a browser wait times out,
the smoke report includes the current URL, summarized persisted cockpit state,
visible enabled buttons, visible page text, and recent server/web/browser
process output.

## Browser Playable Session Script

Use this script for the first local playable-session pass after startup:

1. Open `/runtime`, wait for the runtime shell, and run **Local Reset** if the
   browser still has a stored session.
2. Switch to **DM Mode**, confirm **Demo scenario** is set to **Training Room
   Skirmish**, and run **Run Training Room Skirmish**.
3. Confirm the active scene is **Training Room**, the tactical grid is visible,
   and the sample characters **Aria** and **Borin** appear.
4. Confirm the **Recovery status** panel reports the session, scene,
   active-scene placement, characters, and encounter read models. Before an
   encounter starts, the missing encounter row is expected to be optional.
5. Start the encounter from the DM controls.
6. Confirm **Encounter status** shows round/turn progress and the current or
   next actor.
7. Confirm **Combat & Event Feed** and **Monsters & NPCs** are visible in DM
   mode.
8. Reload the browser, click **Recover**, and confirm **Training Room**,
   **Aria**, **Borin**, **Recovery status**, and **Encounter status** return.
9. Switch to **Player Mode**, click **Recover**, and confirm **PLAYER VIEW**,
   the assigned character, tactical grid, and **Readiness summary** are visible.
10. Confirm Player mode does not show **Run Training Room Skirmish**, **Scene
    Builder**, or **Monsters & NPCs**.
11. Click **Local Reset** and confirm the browser session input is blank, and
    that stale demo table text such as **Training Room**, **Aria**, and
    **Borin** is no longer visible. This reset is browser-local and does not
    delete backend runtime state.
12. Paste the same session ID back into the session input, click **Recover**,
    and confirm **Training Room**, **Recovery status**, and **Encounter
    status** return. This confirms Local Reset did not delete the backend
    runtime session or leave the table only partially recovered.

For the persisted character product MVP, run the server in DB mode with
`0008_character_library_entries.sql`, `0009_auth_users_and_sessions.sql`, and
`0010_auth_user_owned_character_library.sql` applied, then start the web app and
open `http://localhost:3000/characters`. The browser Character Library expects
a logged-in user backed by an HttpOnly session cookie; use `/login` to register
or log in. Select **Create New Character**, upload a JPEG, PNG, or WebP portrait
under 1 MB in Step 1, choose a rules profile, select
species/race, class, and background, adjust ability scores, and confirm derived
HP, AC, speed, initiative, proficiency, proficiencies, equipment, and spell
setup update. Click **Save Draft**, return to `/characters`, and confirm the new
card appears from the persisted list. Open **Edit**, move to Review, finalize
the character, and download the template-filled character sheet PDF from
Review. Confirm current or 2024-style rules profiles use the 2024 local
template, legacy 2014-style profiles use the 2014 fillable local template, and
any visible fallback notice clearly explains why the repo-owned simple PDF was
used. Then return to `/characters`, download the same template-filled PDF from
the card, reload the browser, and confirm the finalized card still appears. If
no portrait is uploaded, confirm the card and summary fall back to selected
species/race art. Portrait embedding into the PDF is not required for this MVP;
the exported PDF may remain text-only.

For the Character Library -> runtime bridge UI, keep the same logged-in
browser session, open `/runtime`, switch to Player mode, join or recover a live
session, refresh the saved-character list, select a finalized saved character,
and submit it. Confirm the player shows a pending assignment. Switch to DM mode
and confirm the Roster's Assignment Requests card shows a character preview
with name, build, HP, AC, speed, runtime copy ID, and source library entry ID
before assigning that pending runtime character. Click **Assign Pending
Character** and confirm the assigned character card still shows the runtime
copy ID and source library entry ID after the pending request clears. Confirm
the reusable library entry remains separate from live runtime HP, movement,
conditions, and DM overrides.

For the rule-aware builder slice, also check:

- Select different species and confirm the summary rail and Species step show
  rule data such as speed, size, and traits.
- Select different classes and confirm hit die, saving throws, skill choice
  limits, equipment suggestions, and spell setup update.
- Select Acolyte, Criminal, Sage, and Soldier backgrounds and confirm ability
  options, fixed skills, tools, origin feat labels, and equipment metadata
  update.
- Adjust base ability scores and confirm final scores, modifiers, HP preview,
  AC preview, speed, initiative, and proficiency bonus update immediately.
- Open Choices & Proficiencies and confirm fixed grants are separate from
  limited local choices, with over-selection disabled.
- Open Equipment and confirm the recommended loadout changes by
  class/background and remains metadata only.
- Open Spells with a caster such as Wizard and confirm level/school filtering
  and cantrip/level 1 spell limits. Then choose a non-caster such as Fighter
  and confirm the "No spell setup required for this class in this MVP" state.
- Open Review and confirm it summarizes species, class, background, final
  ability scores, HP, AC, speed, proficiency bonus, saving throws, skills,
  languages, tools, equipment, and spells from local rule data.

## What This Covers

- Session create, join, reconnect, and SSE subscription.
- Character create, finalize, assign, and read.
- Scene create, activate, transition create/update/delete/activation, passive
  entity placement/edit/reposition/delete, and active-scene state read.
- Narrow DM-controlled monster/NPC combatant creation, HP control, turn
  override, and fixed-damage melee attack.
- Mixed player/combatant encounter start, turn usage, attack, and encounter
  state read.
- Reaction usage foundation through `use_reaction`.
- Browser action economy feedback for current action, bonus action, and
  reaction readiness around the existing turn controls.
- Browser encounter status feedback for round/turn progress, next actor, latest
  encounter update, and latest combat result.
- Browser player readiness feedback for joined, character, assignment,
  placement, and turn-ready states.
- Browser recovery status feedback for session, scene, active-scene placement,
  characters, encounter, and recover notes.
- Downed actor gating using a 1 HP target.
- Backend DM controls for HP, condition tags, active-scene reposition, turn
  usage, current turn actor, combatants, and active encounter end.
- In-memory idempotent retry behavior for a successful mutating command.
- Reconnect recovery through read models instead of missed-event replay.

## 1. Start The Server

From the repo root:

```bash
pnpm --filter @dnd/server dev
```

In another terminal:

```bash
curl -sS http://127.0.0.1:2567/
```

Expected high-level status:

```json
{
  "name": "dnd-dm-platform-server",
  "phase": "phase-12",
  "status": "db-idempotency-claim-plus-scene-transaction-and-session-character-movement-encounter-combat-outbox-foundation"
}
```

## 2. Create A Session

```bash
CREATE_SESSION_RESPONSE=$(curl -sS -X POST http://127.0.0.1:2567/api/session/command \
  -H 'content-type: application/json' \
  -d @- <<'JSON'
{
  "commandId": "manual-create-session-1",
  "type": "create_session",
  "actor": {
    "participantId": "dm-001",
    "displayName": "Dungeon Master",
    "role": "dm"
  },
  "payload": {
    "rulesProfileId": "dnd5e-2024-core"
  }
}
JSON
)

echo "$CREATE_SESSION_RESPONSE" | jq .
export SESSION_ID=$(echo "$CREATE_SESSION_RESPONSE" | jq -r '.data.sessionId')
echo "$SESSION_ID"
```

## 3. Subscribe To SSE

Open a separate terminal and run:

```bash
export SESSION_ID="<SESSION_ID>"
curl -N "http://127.0.0.1:2567/api/sessions/$SESSION_ID/stream?participantId=dm-001"
```

You should see `session_state`, `movement_state`, `encounter_state`,
`combat_event`, and `character_state` events as later commands mutate runtime
state.

## 4. Join Players

```bash
curl -sS -X POST http://127.0.0.1:2567/api/session/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-join-player-1",
  "type": "join_session",
  "actor": {
    "participantId": "player-001",
    "displayName": "Player One",
    "role": "player"
  },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/session/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-join-player-2",
  "type": "join_session",
  "actor": {
    "participantId": "player-002",
    "displayName": "Player Two",
    "role": "player"
  },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON
```

## 5. Create Characters

The second character intentionally has 1 HP and 0 AC so the baseline attack
always hits and exercises downed-state recovery/gating without dice luck.

```bash
CHARACTER_ONE_RESPONSE=$(curl -sS -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON
{
  "commandId": "manual-create-character-1",
  "type": "create_character",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "ownerParticipantId": "player-001",
    "character": {
      "name": "Aria",
      "level": 5,
      "className": "Wizard",
      "speciesOrRace": "Elf",
      "background": "Sage",
      "abilities": {
        "str": 8,
        "dex": 14,
        "con": 13,
        "int": 16,
        "wis": 12,
        "cha": 10
      },
      "hp": { "max": 26, "current": 26, "temp": 0 },
      "armorClass": 13,
      "speed": 30
    }
  }
}
JSON
)

echo "$CHARACTER_ONE_RESPONSE" | jq .
export CHARACTER_ONE_ID=$(echo "$CHARACTER_ONE_RESPONSE" | jq -r '.data.character.id')

CHARACTER_TWO_RESPONSE=$(curl -sS -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON
{
  "commandId": "manual-create-character-2",
  "type": "create_character",
  "actor": { "participantId": "player-002" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "ownerParticipantId": "player-002",
    "character": {
      "name": "Borin",
      "level": 5,
      "className": "Fighter",
      "speciesOrRace": "Dwarf",
      "background": "Guard",
      "abilities": {
        "str": 16,
        "dex": 12,
        "con": 14,
        "int": 10,
        "wis": 10,
        "cha": 8
      },
      "hp": { "max": 1, "current": 1, "temp": 0 },
      "armorClass": 0,
      "speed": 30
    }
  }
}
JSON
)

echo "$CHARACTER_TWO_RESPONSE" | jq .
export CHARACTER_TWO_ID=$(echo "$CHARACTER_TWO_RESPONSE" | jq -r '.data.character.id')
echo "$CHARACTER_ONE_ID"
echo "$CHARACTER_TWO_ID"
```

## 6. Finalize And Assign Characters

```bash
curl -sS -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-finalize-character-1",
  "type": "finalize_character",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "characterId": "$CHARACTER_ONE_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-finalize-character-2",
  "type": "finalize_character",
  "actor": { "participantId": "player-002" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "characterId": "$CHARACTER_TWO_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-assign-character-1",
  "type": "assign_character_to_participant",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "participantId": "player-001",
    "characterId": "$CHARACTER_ONE_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-assign-character-2",
  "type": "assign_character_to_participant",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "participantId": "player-002",
    "characterId": "$CHARACTER_TWO_ID"
  }
}
JSON
```

## 7. Create And Activate A Scene

```bash
SCENE_RESPONSE=$(curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON
{
  "commandId": "manual-create-scene-1",
  "type": "create_scene",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "scene": {
      "name": "Training Room",
      "grid": {
        "width": 8,
        "height": 8,
        "cellSizeFeet": 5
      }
    }
  }
}
JSON
)

echo "$SCENE_RESPONSE" | jq .
export SCENE_ID=$(echo "$SCENE_RESPONSE" | jq -r '.data.scene.id')

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-activate-scene-1",
  "type": "activate_scene_for_session",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID"
  }
}
JSON
```

Create a second scene, add a transition node in the training room pointing to
that second scene, update it, activate it as the DM, confirm a player cannot
activate it, then reactivate the training room so the rest of this flow can
continue in the original scene.

```bash
TARGET_SCENE_RESPONSE=$(curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON
{
  "commandId": "manual-create-transition-target-scene-1",
  "type": "create_scene",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "scene": {
      "name": "Moonlit Hall",
      "grid": {
        "width": 8,
        "height": 8,
        "cellSizeFeet": 5
      }
    }
  }
}
JSON
)

echo "$TARGET_SCENE_RESPONSE" | jq .
export TARGET_SCENE_ID=$(echo "$TARGET_SCENE_RESPONSE" | jq -r '.data.scene.id')

TRANSITION_RESPONSE=$(curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON
{
  "commandId": "manual-create-scene-transition-1",
  "type": "create_scene_transition",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID",
    "transition": {
      "kind": "door",
      "name": "North Door",
      "targetSceneId": "$TARGET_SCENE_ID",
      "targetLabel": "Moonlit Hall",
      "notes": "A cold iron-banded door.",
      "position": { "x": 7, "y": 7 },
      "footprint": { "width": 1, "height": 1 },
      "blocksMovement": false,
      "blocksVision": false,
      "hidden": false
    }
  }
}
JSON
)

echo "$TRANSITION_RESPONSE" | jq .
export TRANSITION_ID=$(echo "$TRANSITION_RESPONSE" | jq -r '.data.scene.entities[] | select(.transition != null) | .id')

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq '.data.scene.entities[] | select(.id == "'$TRANSITION_ID'")'
{
  "commandId": "manual-update-scene-transition-1",
  "type": "update_scene_transition",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID",
    "transitionId": "$TRANSITION_ID",
    "transition": {
      "kind": "portal",
      "name": "Moon Gate",
      "targetSceneId": "$TARGET_SCENE_ID",
      "targetLabel": "Moonlit Hall"
    }
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-activate-scene-transition-1",
  "type": "activate_scene_transition",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID",
    "transitionId": "$TRANSITION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq '.data.scene.entities[]? | select(.id == "'$TRANSITION_ID'")'
{
  "commandId": "manual-delete-scene-transition-1",
  "type": "delete_scene_transition",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID",
    "transitionId": "$TRANSITION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-player-activate-scene-transition-denied-1",
  "type": "activate_scene_transition",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID",
    "transitionId": "$TRANSITION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-reactivate-training-room-after-transition-1",
  "type": "activate_scene_for_session",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID"
  }
}
JSON
```

## 8. Place A Passive Entity, Characters, And A Training Combatant

```bash
ENTITY_RESPONSE=$(curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON
{
  "commandId": "manual-place-scene-entity-1",
  "type": "place_entity_in_scene",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID",
    "entity": {
      "type": "object",
      "name": "Rune Door",
      "position": { "x": 3, "y": 3 },
      "footprint": { "width": 1, "height": 1 },
      "blocksMovement": true,
      "blocksVision": true,
      "hidden": false,
      "meta": { "note": "manual validation object" }
    }
  }
}
JSON
)

echo "$ENTITY_RESPONSE" | jq .
export SCENE_ENTITY_ID=$(echo "$ENTITY_RESPONSE" | jq -r '.data.scene.entities[] | select(.name == "Rune Door") | .id')
echo "$SCENE_ENTITY_ID"

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq '.data.scene.entities[] | select(.id == "'$SCENE_ENTITY_ID'")'
{
  "commandId": "manual-update-scene-entity-1",
  "type": "update_scene_entity",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID",
    "entityId": "$SCENE_ENTITY_ID",
    "entity": {
      "name": "Rune Door, Open",
      "blocksMovement": false,
      "blocksVision": false,
      "hidden": false,
      "meta": { "note": "updated during manual validation" }
    }
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq '.data.scene.entities[] | select(.id == "'$SCENE_ENTITY_ID'")'
{
  "commandId": "manual-reposition-scene-entity-1",
  "type": "reposition_scene_entity",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID",
    "entityId": "$SCENE_ENTITY_ID",
    "position": { "x": 4, "y": 3 }
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq '.data.scene.entities[]? | select(.id == "'$SCENE_ENTITY_ID'")'
{
  "commandId": "manual-delete-scene-entity-1",
  "type": "delete_scene_entity",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID",
    "entityId": "$SCENE_ENTITY_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq '.data.scene.entities[]? | select(.id == "'$SCENE_ENTITY_ID'")'
{
  "commandId": "manual-read-deleted-scene-entity-1",
  "type": "get_scene",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/movement/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-place-character-1",
  "type": "place_character_in_active_scene",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "participantId": "player-001",
    "position": { "x": 0, "y": 0 }
  }
}
JSON

COMBATANT_RESPONSE=$(curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON
{
  "commandId": "manual-dm-create-combatant-1",
  "type": "dm_create_combatant_in_active_scene",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "combatant": {
      "kind": "monster",
      "name": "Training Goblin",
      "position": { "x": 1, "y": 1 },
      "footprint": { "width": 1, "height": 1 },
      "hp": { "max": 7, "current": 7, "temp": 0 },
      "armorClass": 0,
      "speed": 30,
      "abilities": {
        "str": 8,
        "dex": 14,
        "con": 10,
        "int": 10,
        "wis": 8,
        "cha": 8
      }
    }
  }
}
JSON
)

echo "$COMBATANT_RESPONSE" | jq .
export COMBATANT_ID=$(echo "$COMBATANT_RESPONSE" | jq -r '.data.scene.entities[] | select(.name == "Training Goblin") | .id')
echo "$COMBATANT_ID"

curl -sS -X POST http://127.0.0.1:2567/api/movement/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-place-character-2",
  "type": "place_character_in_active_scene",
  "actor": { "participantId": "player-002" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "participantId": "player-002",
    "position": { "x": 1, "y": 0 }
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/movement/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-read-active-scene-before-encounter",
  "type": "get_active_scene_state",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON
```

## 9. Start Mixed Encounter And Use Turn State

Aria should be first because her initiative modifier is higher than Borin's.
The training goblin is included in turn order as a DM-controlled combatant, but
Aria should still act before it. This lets player 001 use reaction/bonus-action
state and then attack.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-start-encounter-1",
  "type": "start_encounter",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-use-reaction-1",
  "type": "use_reaction",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-use-bonus-action-1",
  "type": "use_bonus_action",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON
```

If you want to validate explicit action usage instead of attacking, call
`use_action` here. Skip it when validating attack, because attack consumes the
current turn action.

## 10. Attack And Verify Idempotent Retry

The target has 1 HP and AC 0, so this attack should hit, apply fixed damage 1,
and bring the target to 0 HP.

```bash
ATTACK_PAYLOAD=$(cat <<JSON
{
  "commandId": "manual-attack-1",
  "type": "attack",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "targetParticipantId": "player-002"
  }
}
JSON
)

curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d "$ATTACK_PAYLOAD" | jq .
```

Retry the exact same command. This should return the same cached success
response without rerolling, reapplying damage, or emitting duplicate events.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d "$ATTACK_PAYLOAD" | jq .
```

Read the target character and confirm `hp.current` is `0`:

```bash
curl -sS -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-read-target-character-after-attack",
  "type": "get_character",
  "actor": { "participantId": "player-002" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "characterId": "$CHARACTER_TWO_ID"
  }
}
JSON
```

## 11. Verify Downed Actor Gating

DM can still advance past a downed current-turn actor. Once the turn advances to
player 002, turn-bound commands for that downed actor should fail with
`turn_actor_downed`.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-advance-turn-1",
  "type": "advance_turn",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-downed-use-action-1",
  "type": "use_action",
  "actor": { "participantId": "player-002" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON
```

Expected error shape:

```json
{
  "ok": false,
  "error": {
    "code": "turn_actor_downed",
    "message": "..."
  }
}
```

## 12. Reconnect And Re-Read Authoritative State

This validates the Phase 8 reconnect model: no missed event replay is required
for clients to recover current state.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/session/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-reconnect-player-1",
  "type": "reconnect_session",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/movement/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-read-active-scene-after-reconnect",
  "type": "get_active_scene_state",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-read-encounter-after-reconnect",
  "type": "get_encounter_state",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/characters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-read-target-after-reconnect",
  "type": "get_character",
  "actor": { "participantId": "player-002" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "characterId": "$CHARACTER_TWO_ID"
  }
}
JSON
```

## 13. Optional DM Control Checks

These commands validate the current backend-only DM command surface. They are
administrative overrides, not normal player actions.

Restore Borin from 0 HP to 1 HP and retry the exact same command to confirm
idempotency. The retry should return the cached success response without a
second `character_state` event.

```bash
DM_HP_PAYLOAD=$(cat <<JSON
{
  "commandId": "manual-dm-set-hp-1",
  "type": "dm_set_character_current_hp",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "participantId": "player-002",
    "characterId": "$CHARACTER_TWO_ID",
    "currentHp": 1
  }
}
JSON
)

curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d "$DM_HP_PAYLOAD" | jq .

curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d "$DM_HP_PAYLOAD" | jq .
```

Set DM-managed condition tags on Aria. These tags are metadata only in the
current runtime and do not apply rules effects.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-dm-set-conditions-1",
  "type": "dm_set_character_active_conditions",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "participantId": "player-001",
    "characterId": "$CHARACTER_ONE_ID",
    "activeConditions": ["prone", "marked"]
  }
}
JSON
```

Reposition Aria administratively. This reuses active-scene occupancy validation
but does not spend movement or require current-turn ownership.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-dm-reposition-1",
  "type": "dm_reposition_character_in_active_scene",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "participantId": "player-001",
    "characterId": "$CHARACTER_ONE_ID",
    "position": { "x": 0, "y": 1 }
  }
}
JSON
```

Adjust the training goblin through the narrow DM-controlled combatant surface.
The current-turn override can target a combatant ID, and `dm_combatant_attack`
uses the same narrow fixed-damage melee attack foundation. The attack may hit or
miss depending on the server roll, but legality checks happen before any roll.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-dm-combatant-hp-1",
  "type": "dm_set_combatant_current_hp",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "combatantId": "$COMBATANT_ID",
    "currentHp": 6
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-dm-combatant-turn-1",
  "type": "dm_set_current_turn_participant",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "combatantId": "$COMBATANT_ID"
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-dm-combatant-attack-1",
  "type": "dm_combatant_attack",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "combatantId": "$COMBATANT_ID",
    "targetParticipantId": "player-001"
  }
}
JSON
```

Set current turn usage directly, then switch the current turn actor back to
player 001. The current-turn override resets usage and does not reroll
initiative, reorder participants, or change the round number.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-dm-turn-usage-1",
  "type": "dm_set_current_turn_usage",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "turnUsage": {
      "actionUsed": false,
      "bonusActionUsed": true,
      "reactionUsed": true,
      "movementUsed": 5
    }
  }
}
JSON

curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-dm-current-turn-1",
  "type": "dm_set_current_turn_participant",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "participantId": "player-001"
  }
}
JSON
```

With player 001 back on turn, validate player-to-combatant targeting. The
training goblin has AC 0, so this legal melee attack should hit, reduce its HP
to 0, keep the defeated combatant visible in the scene, and return cached
success on an exact retry without rerolling or reapplying damage.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-dm-combatant-hp-before-player-attack-1",
  "type": "dm_set_combatant_current_hp",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "combatantId": "$COMBATANT_ID",
    "currentHp": 1
  }
}
JSON

PLAYER_COMBATANT_ATTACK_PAYLOAD=$(cat <<JSON
{
  "commandId": "manual-player-attack-combatant-1",
  "type": "attack",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "targetCombatantId": "$COMBATANT_ID"
  }
}
JSON
)

curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d "$PLAYER_COMBATANT_ATTACK_PAYLOAD" | jq .

curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d "$PLAYER_COMBATANT_ATTACK_PAYLOAD" | jq .

curl -sS -X POST http://127.0.0.1:2567/api/scenes/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq '.data.scene.entities[] | select(.id == "'$COMBATANT_ID'") | { id, name, hp: .combatant.hp }'
{
  "commandId": "manual-read-combatant-after-player-attack",
  "type": "get_scene",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "sceneId": "$SCENE_ID"
  }
}
JSON
```

Try a fresh attack command against the defeated combatant. Expected error code:
`attack_target_downed`. This proves defeated combatants remain recoverable scene
state but are not valid attack targets.

Passive scene entity edits are recovered through `get_scene`, not SSE replay.
After the update/reposition/delete commands above, `get_scene` should no longer
return the deleted `SCENE_ENTITY_ID`.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/encounters/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-player-attack-defeated-combatant-1",
  "type": "attack",
  "actor": { "participantId": "player-001" },
  "payload": {
    "sessionId": "$SESSION_ID",
    "targetCombatantId": "$COMBATANT_ID"
  }
}
JSON
```

End the active encounter. This emits one final `encounter_state` with
`encounter_ended`, then clears the active encounter. After this command,
`get_encounter_state` should return `no_active_encounter` until a new encounter
is started.

```bash
curl -sS -X POST http://127.0.0.1:2567/api/dm/command \
  -H 'content-type: application/json' \
  -d @- <<JSON | jq .
{
  "commandId": "manual-dm-end-encounter-1",
  "type": "dm_end_active_encounter",
  "actor": { "participantId": "dm-001" },
  "payload": {
    "sessionId": "$SESSION_ID"
  }
}
JSON
```

## Expected Stream Behavior

During this flow, the SSE terminal should receive:

- `session_state` when participants join, characters are assigned, and the
  active scene changes.
- `movement_state` when characters are placed, moved, or repositioned by the
  DM.
- `encounter_state` when the mixed player/combatant encounter starts and turn
  usage changes.
- `combat_event` when player or DM-controlled combatant attack resolution
  succeeds.
- `character_state` when the DM changes HP or condition tags.

There is still no scene-specific SSE event for scene entity creation, editing,
repositioning, deletion, transition authoring, or combatant creation. Transition
activation uses the existing `session_state` active-scene update. Browser map
state is refreshed from command responses and `get_scene` recovery reads.
`combat_event`, `movement_state`, and `character_state` are not durable replay
events. Use the read commands above to recover current authoritative state after
reconnect.
