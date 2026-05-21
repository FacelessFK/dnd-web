# Domain Model

This document defines product/domain concepts. Exact protocol and persistence
shapes remain in `packages/protocol`, `packages/shared`, `packages/db`, and
`docs/api-surface.md`.

## Core Separation Rule

Reusable content and live runtime state are different things.

Character Library entries, authored scenes, future adventures, and asset
metadata can be reused across sessions. Runtime HP, active-scene position,
conditions, turn usage, active encounters, pending assignment, visibility
state, and DM overrides belong to a live session/runtime overlay.

Live play must not mutate reusable Character Library entries.

## User

A person using the product. In the current auth MVP, a user exists in DB mode
through `auth_users` and authenticates with an opaque HttpOnly-cookie session
stored as a token hash in `auth_sessions`.

Current limits:

- no production account-management system;
- no password reset, email verification, MFA, OAuth, or dedicated CSRF token;
- Character Library ownership is DB-backed when auth is injected.

## Character Library Entry

A reusable player-owned build/identity record managed through
`/characters` and `POST /api/character-library/command`.

It contains builder/library data such as identity, rules profile, selected
species/race, class, background, ability method and scores, derived previews,
proficiencies, languages, tools, equipment, spells, portrait references, and
finalization status.

It is not live session state. Damage, movement, conditions, encounter state,
and DM corrections must not write back into this reusable record.

## Runtime Character

A character resource used by the live runtime through
`POST /api/characters/command`. Runtime characters participate in session
assignment, placement, movement, HP, attacks, and encounter reads.

Current runtime character APIs already support create, update, finalize,
submit-for-assignment, DM assignment, and read flows. They do not yet accept
reusable Character Library entries as the direct source for session assignment.

## Character Session Overlay

Live, mutable session-specific state associated with a character in a runtime
session.

Examples:

- active-scene position;
- active condition tags;
- current HP and downed/defeated state;
- concentration placeholder;
- visibility/session placement;
- pending assignment and participant linkage.

Implementation note: current runtime storage still has some canonical
character fields and overlay fields together in runtime character records. The
product boundary still treats reusable library identity/build as separate from
live session overlays.

## Session

A live runtime room with participants, roles, rules profile, active scene
reference, assignment state, connection state, revisions, and SSE stream path.

The session is authoritative server state. Clients render snapshots, read
models, and live events; they do not own truth.

## Scene

One tactical playable space with a grid, scene entities, passive objects,
blocking flags, hidden flags, transition nodes, and optional metadata.

Scene entities are map/object/obstacle data unless created as explicit
DM-controlled combatants through DM commands. Scene activation belongs to a
session.

## Adventure

A reusable prepared-content container made of one or more connected scenes.

Current implementation has runtime scenes and transition nodes but does not yet
provide a full adventure authoring product. Treat adventure as target domain
language and future product direction, not an implemented feature.

## Asset

Reusable visual or content material such as portraits, species/class/background
art, tokens, icons, sheet templates, tiles, props, markers, and future
map-building assets.

Current implemented assets are local project assets for the Character Builder
and PDF export. Do not claim production object storage or a complete asset
pipeline.

## Encounter

Combat state inside a session. It tracks the active scene, participants,
current turn, round, turn usage, and status.

Current encounters support mixed player-character and DM-controlled combatant
participants, narrow melee attacks, action/bonus/reaction/movement usage, and
DM controls. They are not full D&D combat automation.

## Player Intent

A structured command submitted by a player, such as joining a session,
creating/updating/finalizing a runtime character, submitting for assignment,
moving, using turn resources, or attacking a legal target.

The server validates deterministic constraints. The DM can override or correct
where product rules allow it.

## DM Override

An explicit server-side DM command that mutates authoritative runtime state.

Current examples include HP changes, condition tag changes, character or
combatant repositioning, turn usage edits, current-turn override, combatant
creation, combatant HP control, combatant attack, and encounter end.

DM override is not a generic unsafe client escape hatch. It should remain
auditable through command boundaries, role-gated server-side, and separate from
reusable library data.
