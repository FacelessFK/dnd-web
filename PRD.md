# Product Requirements Document

## 1. Product vision

DND-web is a browser-based multiplayer Dungeons & Dragons platform. A Game
Master runs a live table for a group of players on a shared tactical map. The
server owns every fact about the game world. Players express what their
characters do; the system resolves rules and dice; the GM keeps final authority
over all of it.

The product should feel like playing a game. Not like operating a tool that
happens to be about a game. Someone who opens a session should see a world, a
character they control, and immediate visual feedback for what they do — not a
form, a table of JSON, or a debug panel.

The GM remains the storyteller, referee, world controller, and final authority.
Nothing in this product tries to replace that role.

## 2. Target users

Groups of three to seven people, one GM and two to six players, playing
scheduled sessions of a few hours. Desktop browsers, sitting either at the same
table or remote. Mixed English- and Persian-speaking tables, often in the same
group.

They are people who already play D&D and are frustrated by the bookkeeping: the
map that has to be redrawn, the HP that gets lost, the initiative order on a
scrap of paper, the fog of war improvised out of index cards, the fact that
half the table cannot see what is happening.

### GM persona

Runs the world. Prepares some material and improvises the rest. Their session
succeeds or fails on how quickly they can answer "what happens now".

They need to:

- set up a table in minutes, not an hour;
- load or paint a map and put creatures on it;
- know everything, always, including what players cannot see;
- reveal and conceal information deliberately;
- change any number in the game without arguing with the software;
- roll in secret or in public;
- ask a player for a check or a save;
- say "no, it works like this at my table" and have the system accept it;
- improvise a creature, a door, or a hazard that was not prepared.

Their failure mode is a system that is slower than a pencil, or that quietly
overrides their ruling.

### Player persona

Controls one character. Wants to feel like that character is theirs, understand
what their options are, and act without asking permission for every routine
thing.

They need to:

- keep a personal library of characters across sessions and campaigns;
- build a character through a guided flow, not a spreadsheet;
- join a table with a code and start playing;
- see the map from their character's point of view, and only that;
- move, target, attack, cast, check, and save;
- track their own HP, resources, spell slots, inventory, and conditions;
- say something the software has no button for, and have the GM hear it;
- refresh the page mid-fight and lose nothing.

Their failure mode is being shown information their character should not have,
or being unable to express an action that is obviously reasonable.

## 3. Core gameplay loop

1. The GM presents the environment.
2. Players describe or select what their characters do.
3. The system applies relevant rules and dice.
4. The GM approves, modifies, overrides, or narrates the result.
5. The shared world updates — differently for each viewer, according to what
   each is allowed to know.
6. Play continues.

Step 4 is not an escape hatch. It is a designed step in the loop and must be as
fast and as prominent as steps 2 and 3.

Step 2 must never be constrained to a fixed menu. Every action surface needs a
path for "my character does something you did not anticipate", routed to the GM
as intent.

## 4. Pillars

### Exploration

Moving through a place and finding out what is in it. Needs a readable map,
free movement outside combat, doors and transitions that actually connect
places, and hidden things that stay hidden until found. The system tracks
position, blocking, and visibility. The GM decides what a search reveals.

### Social interaction

Talking to the world. The system's job here is small and must stay small:
identify who is present, support a check when the GM calls for one, and give
players a channel to state intent. No dialogue trees. No AI NPCs.

### Combat

Structured and turn-based. Initiative, rounds, turns, an action economy,
movement budgets, attacks, damage, healing, conditions, and death. This is where
rules assistance pays for itself and where the system should be most opinionated
— and still overridable.

The three pillars share one map, one visibility model, and one authority model.
Combat is a mode the table enters and leaves, not a separate application.

## 5. Session lifecycle

1. **Establish identity.** The GM authenticates. Players authenticate to reach
   their character library.
2. **Create.** The GM creates a session and receives a short share code.
3. **Join.** Players join with the code and receive a participant credential
   bound to that session.
4. **Assign.** A player submits a character; the GM assigns it. The reusable
   library record is copied into a separate live runtime character — the library
   entry is never mutated by play.
5. **Stage.** The GM activates a map, places tokens, and sets visibility.
6. **Play.** Exploration, interaction, and encounters, in any order, repeatedly.
7. **Recover.** Any participant may disconnect and rejoin at any time and
   rebuild full current state from the server.
8. **Close.** The GM ends the session. Library characters persist; runtime
   overlays do not leak back into them.

## 6. GM experience

A dedicated interface, not the player interface with extra buttons.

**Must support:** session management; map selection, creation, and activation;
placing and moving player characters, NPCs, monsters, objects, traps, doors,
transitions, and effects; free movement of controlled entities; hiding and
revealing entities; fog-of-war and visibility control; private notes and hidden
information; modifying HP, temporary HP, conditions, initiative, movement,
resources, and positions; starting, pausing, altering, and ending encounters;
reordering initiative; rolling privately or publicly; requesting checks and
saving throws; approving or overriding player actions; authoring custom
creatures, objects, effects, and encounters; moving players between scenes;
controlling doors, portals, hazards, lighting, and environmental effects; using
prepared content without losing the ability to improvise.

**Design requirements:** the GM view is omniscient by product rule. Every
override is explicit, attributable, and visible in the event log. Diagnostics
and operational panels live behind a GM tool surface, never in the player view.
No GM capability may be enforced only by hiding a control — see §14.

## 7. Player experience

**Must support:** authentication and a personal character library; guided
character creation; joining a session; using an assigned character; seeing only
permitted information; moving their own character when permitted; selecting
targets and interacting with visible entities; attacks, checks, saves, and spell
actions; managing inventory, equipment, spell slots, class resources,
conditions, rests, and advancement; communicating intent the system cannot
represent; reconnecting without loss.

**Design requirements:** the player sees a game. A player must never receive
data their character cannot know, including in transit — filtering in the
browser is not filtering. When the client's local preview and the server
disagree (because the client is missing hidden information), the server wins and
the error must read in-fiction rather than as a validation failure.

## 8. Character builder

Guided, staged, explains itself. Species/race, class, background, abilities,
skills, equipment, spells, and identity, with the rules for each choice enforced
or previewed as the ruleset dictates.

- Rule legality is checked against the session's rules profile.
- Every canonical identifier — class, species, background, spell, ability key,
  rules profile — is stable and untranslated. Localized labels are never IDs.
- User-entered character text is stored exactly as entered and never
  auto-translated.
- A character can be exported to a printable sheet.
- Incomplete drafts persist. Finalization is explicit.

## 9. Character library

A player's characters are theirs, reusable across sessions, and owned by their
account.

**The central invariant:** a library entry is a reusable record; a runtime
character is live state. Live HP, position, conditions, movement usage,
encounter membership, and GM overrides must never write back into a library
entry. Bringing a character to a table copies it into a separate runtime
character that records its source entry ID.

This is the most important boundary in the system. Violating it means a player's
character sheet is corrupted by something that happened in one session.

## 10. Map builder

A real authoring workflow, not a terrain-paint demo.

**Must support:** terrain painting; floors and walls; doors, gates, stairs,
portals, and transitions; rooms and zones; collision and movement blocking;
vision blocking; lighting; fog of war; elevation or layers where practical;
props and decorations; hidden objects and traps; player spawn points; NPC and
monster spawn points; grid configuration; snap-to-grid and optional free
placement; copy, paste, undo, redo, selection, grouping, and deletion; reusable
presets; import and export; draft saving; publishing into a live session;
editing a map without corrupting an active session; versioning or snapshots
where necessary.

**Design requirements:** the builder holds no authoritative state. Nothing it
draws is real until the server accepts it. Editing a published map must never
mutate a running session in place — a live scene is a snapshot, and republishing
is an explicit, versioned act.

## 11. Live map runtime

The centre of the product. One authoritative scene, rendered per viewer through
that viewer's visibility projection.

**Requirements:** readable tokens with strong silhouettes at every zoom level;
smooth camera pan and zoom; clear hover, selection, and targeting states;
movement range and path preview; animated feedback for movement, attacks,
damage, healing, dice, conditions, doors, traps, and effects; fog of war and
line of sight; top-down or isometric presentation; keyboard and screen-reader
access to cell selection and navigation.

**Architectural requirement:** rendering must be able to reach game quality
without the server contract changing. The renderer sits behind an interface, so
that a dedicated 2D renderer can replace the current canvas drawing
incrementally rather than through a rewrite. The server protocol is renderer-
agnostic and must stay that way.

## 12. Rules engine

Target ruleset: **`dnd-5e-2014`**, explicitly and exclusively. 2014 and 2024
rules must never be mixed within a profile.

**Requirements:**

- Deterministic wherever the rules are deterministic; randomness only where dice
  belong, through an injectable roller.
- Versioned. A session declares a rules profile; the profile decides which
  content and which rule interpretations apply.
- Testable without UI, network, or database.
- Data-driven where the rules are data (spells, items, monsters, classes) and
  coded where they are behaviour.
- General rule plus specific exception, not one giant switch statement. Rule
  modules and content registries, without prematurely inventing a universal
  scripting language.
- Capable of: advantage and disadvantage; proficiency and expertise; the action
  economy; movement, reach, and range; conditions and effects; spell and
  class-resource tracking.
- Overridable by an explicit GM decision at every step.
- **Auditable.** Every result carries the reasoning that produced it, so the UI
  can explain _why_ — which dice, which modifiers, which rule, which override.

Content packs are separate from the engine so that legally distributable
SRD-compatible data can ship independently of any private reference material.
One rulebook is not the whole corpus; the architecture must accommodate
additional legally usable sources.

## 13. Dice and action resolution

Every roll happens on the server. The client never rolls, and never decides
whether a roll succeeded.

A resolution produces: the dice expression, each die result, each modifier and
its source, the total, the target number, the outcome, and any critical
handling. That record drives both the animation and the audit trail.

- Public rolls go to everyone. GM private rolls go to the GM only.
- The GM can request a check or save from a specific player, and can resolve one
  on their behalf.
- The GM can override any result, and the override is recorded as an override
  rather than silently replacing the roll.

## 14. Visibility and hidden information

**The rule: if a client must not know something, the server must not send it.**

- Reads and streams are projected per role. Filtering happens before the bytes
  leave the server.
- The GM view is omniscient.
- A player receives their own character in full, other players' public state,
  and only the world their character can perceive.
- A concealed creature's identity is withheld. Its turn slot may remain visible
  where turn-order alignment requires it — players at a real table do learn that
  _something_ acted; what they must not learn is what it was.
- Fog of war and line of sight are server-computed, not client-rendered
  illusions.
- Hiding a control in the UI is not a permission check. Every GM-only action is
  gated server-side against a verified participant credential.

## 15. GM override and house rules

First-class, not an escape hatch.

- **Override:** the GM changes a specific outcome or value. Recorded, attributed,
  visible in the log.
- **House rule:** the GM changes how a rule works for the whole table, declared
  on the rules profile, applied consistently by the engine.

The engine must be able to report "this result came from a house rule" or "this
was a GM override" so nobody is confused about why a number changed.

## 16. Multiplayer and reconnect

The server is authoritative for session membership and roles, character
assignment, active scene state, placement and movement, encounter and turn
state, combat mutations, GM controls, and event publication.

- Realtime delivery over SSE, projected per role.
- **Identity is a server-issued credential**, not a client-asserted ID. A
  participant proves who they are on every command and every stream
  subscription.
- Recovery is by re-reading authoritative read models. Expected empty reads
  (`no_active_scene`, `no_active_encounter`) are recoverable local state, not
  failures.
- Every command carries a command ID and is idempotent on replay.
- Realtime claims must stay honest: live delivery only, with no replay, cursor,
  catch-up, or exactly-once guarantee until such a thing is actually built.

## 17. Visual and interaction direction

Desktop-first, dark, dramatic, readable. Reference points for _quality_ — Hades'
readability and animation feedback, Diablo's atmosphere and lighting, Among Us'
silhouette clarity at small sizes — never for assets, layout, or branding. The
project has its own visual identity.

- A game HUD: the map dominates; controls frame it.
- Strong silhouettes; a token is identifiable at a glance and at any zoom.
- Every state change gets visible feedback. Nothing changes silently.
- Animation is functional — it tells you what happened and who did it.
- Diagnostics are never part of the player view.
- 60 fps target on a mid-range laptop with a busy scene.

## 18. Localization

English and Persian are both first-class. Persian (`fa`) is the default locale.
English is LTR; Persian is RTL.

- Every user-facing string goes through the i18n system. A hardcoded English
  string in the Persian UI is a bug, not a rough edge.
- RTL is a layout requirement, not a text-direction attribute: mirrored panels,
  correct icon direction, correct numeric and date formatting.
- Canonical IDs stay untranslated.
- User-entered character data is never auto-translated.
- SRD content strings use a phrase book keyed on the English source with
  fallback, so untranslated content degrades to English rather than breaking the
  build — with coverage tests to catch the gap.

## 19. Persistence

- Postgres via Drizzle, with an in-memory mode for development.
- Durable: accounts and auth sessions, character library entries, runtime
  character records, session snapshots, scenes, active encounters, command
  idempotency records and claims.
- Explicit transaction boundaries through a unit-of-work; a command's writes and
  its idempotency record commit together.
- Events are written to an outbox inside the command transaction and dispatched
  after commit.
- UTF8 end to end, verified by a readiness check, because Persian content
  depends on it.
- Migrations are numbered, forward-only, and never edited after being applied.

## 20. Security

- The browser is never authoritative for identity, permissions, rules, HP,
  hidden data, or game state.
- Participant identity is a server-issued opaque credential. A claimed
  `participantId` alone proves nothing.
- Role gates live on the server. Every GM-only command verifies the caller.
- Passwords are hashed with a memory-hard KDF; session tokens are stored hashed.
- Auth endpoints are rate limited, with constant-work responses so timing does
  not leak whether an account exists.
- Request bodies are size-limited and time-limited.
- Operational endpoints require authorization.
- CORS is an explicit allowlist. Cookie flags must match the deployment scheme.
- Secrets never appear in logs, errors, documentation, or commit messages.

## 21. Performance

- 60 fps map rendering on a mid-range laptop, with 50+ tokens and a 100×100 map.
- Command round trip under 150 ms locally, under 400 ms over a normal
  connection.
- An event reaches all subscribers within 250 ms of commit.
- Reconnect and full state rebuild under 2 seconds.
- Rendering cost scales with what is visible, not with map size.
- No unbounded query: anything that can grow is paginated or aggregated in the
  database.
- Every client request has a timeout.

## 22. Accessibility

- Full keyboard path for every action, including map cell selection and
  navigation.
- Screen-reader-accessible representation of the map and of turn state.
- Text contrast at WCAG AA; never colour alone to convey state.
- Respects `prefers-reduced-motion` — animation is feedback, and feedback must
  survive without motion.
- Readable at 1280px wide and at 150% browser zoom.

## 23. Non-goals

- AI game master, AI narration, AI NPC dialogue, or monster AI.
- A single-player CRPG.
- Full automation of every spell, feat, and class feature.
- Voice or video chat.
- Mobile-first or native clients.
- A content marketplace or user-generated-content economy.
- Hosting other people's copyrighted rulebooks.
- Multi-tenant SaaS operations, billing, or horizontal scaling.

## 24. MVP scope

One vertical slice that is genuinely playable, before broad rules coverage:

- GM authenticates; player joins securely with a credential.
- GM publishes or loads one map and activates it.
- Both see the same scene through different visibility projections.
- GM places and moves an NPC or monster; the player moves their assigned
  character.
- Hidden entities stay hidden.
- One ability check or saving throw, resolved end to end.
- One attack and damage flow.
- Initiative and turn progression.
- HP and at least one mechanically meaningful condition.
- Disconnect, reconnect, full state recovery.
- Persistence in DB mode.
- Game-quality visual feedback for movement, attacks, and damage.
- Verified by browser-level automated tests.

## 25. Post-MVP scope

Stronger map builder; lighting and fog of war; complete character-building
foundations; broader combat actions; spellcasting architecture; equipment and
inventory; rests and resources; class progression; wider rules coverage;
campaign management across sessions; content packs; visual and animation polish;
production deployment and scaling.

Sequencing is in [ROADMAP.md](ROADMAP.md).

## 26. Acceptance criteria

Measurable, and each one testable.

**Authority**

- A1. A participant cannot act as another participant, given only public session
  data. Verified by an automated test that attempts exactly that.
- A2. Every GM-only command rejects a non-GM caller server-side, with the UI
  control removed or not.
- A3. No client-supplied value determines identity, role, dice, or HP.

**Visibility**

- V1. A player's scene read contains no GM-hidden entity, in any field.
- V2. A player's encounter read and stream contain no concealed combatant's
  identity or HP.
- V3. Revealing a creature mid-encounter takes effect on the next event without
  an invalidation step.
- V4. Fog of war is computed server-side; a player payload never contains
  unrevealed map state.

**Playability**

- P1. A GM and a player can complete the §24 loop in one browser session,
  automated end to end.
- P2. Either participant can refresh at any point in that loop and continue,
  with state rebuilt from the server.
- P3. Every dice result the UI shows can be traced to dice, modifiers, and
  sources supplied by the server.
- P4. A player can submit free-form intent and the GM receives it.

**Library boundary**

- L1. After a full session including damage, movement, conditions, and GM
  overrides, the source library entry is byte-identical to before.
- L2. A runtime character records its source library entry ID.

**Localization**

- I1. No user-facing string in the runtime, HUD, or event feed renders English
  in the Persian locale.
- I2. Every `en` key has an `fa` counterpart, enforced at typecheck.
- I3. RTL layout holds on every player-facing and GM-facing surface.

**Rules**

- R1. A session declares a rules profile and no resolution mixes 2014 and 2024
  content.
- R2. Every rules helper is unit-tested without UI, network, or database.
- R3. A GM override or house rule is reported as such in the audit record.

**Performance**

- F1. 60 fps with 50 tokens on a 100×100 map on a mid-range laptop.
- F2. Reconnect and full rebuild under 2 seconds locally.
- F3. No endpoint materializes an unbounded row set.

## 27. Known product risks

1. **The runtime UI is the product, and it is currently a developer cockpit.**
   ~8,800 lines in one component. Everything in §11 and §17 is blocked behind
   decomposing it. This is the single largest risk to the vision.
2. **Rendering ceiling.** The current canvas drawing may not reach the animation
   and fog-of-war quality the vision requires. Mitigation: keep the renderer
   behind an interface so a dedicated 2D renderer can be adopted incrementally,
   with the server contract untouched.
3. **2014 versus 2024 rules mixing.** Shipped builder content is 2024 SRD 5.2.1
   while the target is 2014. Left alone, this produces characters that are
   illegal under the declared ruleset.
4. **Rules scope is effectively unbounded.** Spells, items, feats, and class
   features can absorb infinite effort. Mitigation: content packs and rule
   modules, coverage tracked honestly, vertical slices before breadth.
5. **Fog of war is expensive and touches everything** — server visibility
   computation, per-viewer projection, renderer, and map authoring at once.
6. **Hidden-information leaks are silent.** A projection bug shows a player
   something they should not see, and nobody notices. Mitigation: visibility is
   a tested invariant, not a feature.
7. **Localization erodes by default.** Every new string is an opportunity to
   hardcode English. Mitigation: typecheck parity plus coverage tests.
8. **Single-process assumptions are load-bearing.** Rate limits, SSE
   subscribers, and outbox dispatch are per-process. A second process weakens
   all three, and nothing currently prevents someone from starting one.
9. **GM authority can be eroded by convenience.** Each automated rule is a place
   where the software might overrule the GM. Overrides must stay first-class.
10. **Solo-maintainer capacity.** The scope in this document is large. The
    roadmap must stay ordered by playability, not by completeness.
