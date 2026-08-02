# Roadmap

Milestones are named, not numbered by phase. Each one is a vertical slice that
leaves the product more playable than before. Breadth of rules coverage comes
after depth of playability.

Ordering principles:

- A slice that makes the game playable beats a slice that makes it complete.
- Security and correctness before cosmetic expansion.
- The GM stays authoritative; the server stays the only source of truth.
- Nothing ships claiming a guarantee it does not implement.
- Every milestone can be tested.

## Status summary

| Milestone                      | State    |
| ------------------------------ | -------- |
| M0 — Foundation repair         | Complete |
| M1 — First playable table      | Complete |
| M2 — Game HUD                  | Complete |
| M3 — Fog of war and lighting   | Next     |
| M4 — Renderer quality          | Planned  |
| M5 — Map builder completion    | Planned  |
| M6 — Character foundations     | Planned  |
| M7 — Combat breadth            | Planned  |
| M8 — Spellcasting architecture | Planned  |
| M9 — Equipment and resources   | Planned  |
| M10 — Progression              | Planned  |
| M11 — Campaigns                | Planned  |
| M12 — Content packs            | Planned  |
| M13 — Polish                   | Planned  |
| M14 — Production               | Planned  |

---

## M0 — Foundation repair

Fix what makes the rest unsafe or unbuildable. No new player-facing features.

**User-visible outcome.** Nothing new, and that is intentional. A player can no
longer be impersonated, and a player can no longer act as the GM.

**Technical outcome.**

- Server-issued participant credentials; a claimed `participantId` proves
  nothing on its own. Commands and stream subscriptions both verify.
- Request bodies bounded in size and time.
- Operational endpoints require authorization; no endpoint materializes an
  unbounded row set.
- Deployment configuration where cookie flags, CORS allowlist, and public
  server URL are derived together instead of drifting apart.
- Frontend requests have timeouts.
- The event feed goes through i18n.
- Documentation reduced to README, PRD, ROADMAP, CLAUDE.
- Browser smoke tests run in CI.

**Acceptance criteria.** PRD A1, A2, A3, F3, I1. A test proves that a caller
holding only public session data — including the GM's participant ID, which the
session snapshot broadcasts — cannot act as another participant or subscribe to
their stream.

**Tests.** Unit tests for the credential store; HTTP tests for missing, wrong,
and cross-participant tokens on every command category and on the stream; body
limit and timeout tests; an outbox aggregate-query test; i18n parity at
typecheck.

**Dependencies.** None.

**Excludes.** Any new gameplay. Any renderer work. Refactoring the runtime
cockpit. Converting rules content to 2014.

**Known gaps left open, deliberately.**

- Credentials are per-process and in-memory, so a second process would not
  recognise them. Shared storage is M14. A restart no longer forces a rejoin:
  the durable seat binding lets the owning account `reconnect_session` and be
  issued a new credential, while the old one stays unverifiable.
- Credentials live in `localStorage`, readable by any script on the origin,
  because the web app and the server are different origins and an HttpOnly
  cookie would need `SameSite=None; Secure`. Same-origin proxying is M14.
- No UI calls `clearParticipantCredentials()` - there is no explicit "leave
  table" action yet. It belongs with the HUD work in M2.
- ~~An occupied _player_ seat is re-claimable with the session code.~~ Closed in
  M1: a seat is now bound to the authenticated account that took it, and the
  binding is checked before any credential is minted.

---

## M1 — First playable table

The vertical slice from PRD §24. One GM, one player, one map, one fight, end to
end, with nothing faked.

**User-visible outcome.** A GM authenticates, publishes a map, and activates it.
A player joins with a code, brings a character from their library, and is
assigned it. Both see the same scene through their own visibility projection.
The GM places a monster and moves it. The player moves their character. A hidden
creature stays hidden. The GM calls for a saving throw and the player rolls it.
The player attacks and deals damage. Initiative advances. HP changes and a
condition applies and _means something_. Either side refreshes mid-fight and
continues. In DB mode all of it survives a server restart.

**Technical outcome.**

- Ability checks and saving throws as a first-class resolution: request,
  resolve, publish, with a full audit record (dice, modifiers, sources, DC,
  outcome).
- At least one condition with mechanical effect, not just a tag.
- A dice resolution record shared by the resolver, the stream, and the UI.
- Free-form player intent submitted to the GM.
- Visual feedback for movement, attack, damage, and dice.

**Acceptance criteria.** PRD P1–P4, V1–V3, L1, L2, R1 for the profile in use.

**Tests.** Rules unit tests for check and save maths including advantage and
proficiency; server tests for the request/resolve flow and its projections; a
two-profile browser smoke covering the whole loop with a refresh in the middle;
a DB-mode smoke proving the same loop persists.

**Dependencies.** M0.

**Excludes.** Fog of war. Spellcasting. Inventory. Multiple simultaneous
players. The HUD redesign — this milestone may ship inside the existing cockpit.

**Landed.** The whole loop, in that order:

- One `diceResolution` record shared by checks, saves and attacks, with stance
  and named modifier sources, in `packages/protocol`.
- Request/submit/cancel commands for checks and saves, free-form player intent,
  and `dm_set_combatant_hidden`.
- `packages/rules` resolves checks and saves, folds advantage/disadvantage
  without stacking, and applies `poisoned` to attack rolls and ability checks
  but not saving throws.
- Session seats bind to authenticated accounts, and a restart no longer forces
  a rejoin: the durable seat binding is what the account proves its claim with.
- A character records what it is trained in as canonical skill and ability IDs,
  copied from its library entry by the existing bridge, so a proficient roll
  reports a proficiency contribution and a non-proficient one does not.
- Server handlers persist and project all of it per role, and a new subscriber
  receives an `initial_sync` projection of the table it is joining.
- The GM and player surfaces, the dice-result presentation, and the feedback
  layer, in both locales.
- `Recover` restores the M1 table. Requests, resolutions and notes have no read
  command - the server only projects them onto a live subscription - so
  recovering reopens the stream rather than leaving the panels empty.

**Verified by.** `m1-full-loop-smoke.mjs` plays a table from an empty session to
a recovered one through the real controls in two authenticated browser profiles,
including the three probes that must fail. `m1-db-browser-restart-smoke.mjs`
does it across a real PostgreSQL-backed server restart with both windows left
open. Both ran three times cleanly, and the full loop was also played visibly on
a desktop. Both run in the `m1-browser-acceptance` CI job.

**Limitation carried forward, now closed.** No stream event carried a scene
projection, so a creature the GM placed, revealed or concealed reached a player
only when that player pressed `Recover`. The projection was correct either way -
concealment is applied server-side before the bytes leave - so it was a liveness
gap, not a disclosure one. M2 closed it: `scene_state` is a named stream event,
and both the M2 acceptance harness and `test:smoke:live-scene` assert that
placing, moving, concealing and revealing each reach the other browser with no
`Recover` in between.

---

## M2 — Game HUD

Separate the game from the cockpit. This is the largest single risk in the
product (PRD §27.1) and it is deliberately its own milestone.

**User-visible outcome.** A player opens a session and sees a game: the map
dominates, their character sheet and actions frame it, and there is no debug
panel anywhere. The GM gets a distinct interface built for authority and speed.

**Technical outcome.** `apps/web/app/runtime/runtime-cockpit.tsx` decomposed
along the seams in PRD §13: rendering, HUD, GM tools, player tools, session
state, command orchestration, recovery, character management, map editing,
diagnostics. A client state model with selectors and hooks rather than one
component owning every variable. Diagnostics behind a GM or development surface.

**Acceptance criteria.**

- No M2-owned component exceeds 500 lines. M2 owns the runtime HUD: the role
  shells, the runtime composition root, runtime panels, and diagnostics -
  everything under `apps/web/app/runtime/`.
- Legacy components already over the limit outside that surface are pinned by
  the repository shape test and assigned to the milestone that will decompose
  each one. They may not grow while exempt, every exemption names its owning
  milestone and its reason, and an exemption must be removed once its milestone
  brings the file under the limit - the test fails on a stale entry as loudly as
  on a violated one.
- The Player and the GM use distinct production shells.
- `runtime-cockpit.tsx` remains a small composition root.
- The player bundle contains no diagnostic panel.
- Every existing runtime behaviour still passes its tests.
- A player-mode screenshot contains no raw identifier or protocol field name.

The original wording said "no component over 500 lines" without saying which
components. Read literally that made M2 responsible for decomposing the map
builder, the character builder and the renderer - three surfaces this milestone
was explicitly told to leave alone, and three that later milestones already own.
The criterion above is the same rule with its scope stated, not a weaker one:
inside the surface M2 rebuilt it is unconditional.

**Tests.** Existing helper tests preserved and extended per extracted module;
browser smokes updated to the new surfaces; both locales verified for RTL.

**Dependencies.** M1, which is complete.

**Excludes.** Renderer replacement. New gameplay.

**Delivered.** `runtime-cockpit.tsx` is a 135-line composition root: it chooses
a role shell and provides its dependencies. `PlayerGameShell` and
`GameMasterGameShell` are the production surfaces, each a map-dominant layout
with a compact status strip, one contextual side region and one collapsible tool
region. The model lives in `useRuntimeHud` over seven focused modules - drafts,
selection, diagnostics, character library, and three pure derivations - none of
which the shells may write to except through a command.

Diagnostics moved to `app/runtime/diagnostics/`, which makes the boundary
provable: a repository-shape test walks the Player shell's import graph and
fails if anything under that directory appears in it, with the inverse assertion
on the GM shell so a walk that resolved nothing cannot pass for the wrong
reason. The same test enforces the 500-line rule.

Every M2-owned component is under it; the largest is
`hud/player-readiness-panels.tsx` at 468. Five components were already over the
limit when the rule landed, and the import graph - not their filenames - decides
who owns each:

| component                                                | lines | owner | why it is outside M2                                                                                                                        |
| -------------------------------------------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/maps/map-builder.tsx`                               | 1211  | M5    | The `/maps` route. Reached only from `app/maps/page.tsx`; no runtime shell reaches it.                                                      |
| `app/runtime/tactical-map.tsx`                           | 1097  | M4    | The renderer surface, reached only through `runtime-map-stage.tsx`. M4 may swap the drawing layer behind that seam.                         |
| `.../simple-builder/components/sheet/CharacterSheet.tsx` | 818   | M6    | The Character Builder review sheet. Not the Player HUD character surface, which is `app/runtime/panels/character-summary.tsx` at 127 lines. |
| `app/characters/character-builder-ui.tsx`                | 688   | M6    | The `/characters` builder routes.                                                                                                           |
| `.../simple-builder/components/steps/ClassStep.tsx`      | 532   | M6    | A Character Builder wizard step.                                                                                                            |

Only the renderer is inside a runtime shell's import graph, and the test asserts
it is reached through the map-stage seam and nowhere else - which is what lets
M4 replace the drawing layer without either shell noticing. The other four are
asserted _unreachable_ from both shells, so a builder surface cannot drift into
the runtime by accident.

None of this is a general allowance. Each entry pins a maximum size, names the
milestone that will remove it, and fails the build if it grows, if its declared
reachability stops matching the graph, or if it is still listed after its
milestone brings it under the limit.

`test:smoke:m2-game-hud` is the acceptance harness. Map dominance is measured
rather than judged: 70% of its row at 1366, 77% at 1920, 100% on mobile. It runs
in Persian and English at 1920, 1366 and 430px, checks the Player surface for
UUIDs, record IDs, participant IDs, protocol command names, read command names,
raw HTTP statuses and protocol error codes, opens and closes a mobile drawer and
confirms focus returned to its opener.

The last defect it caught is worth recording, because it was invisible to every
headless run: the column split came from React's observed viewport width, so the
shell kept the desktop template whenever a `resize` never arrived and a 380px
inspector squeezed the map to 26px. The split is a media query now - the map's
share cannot depend on an event arriving - while the structural half, whether a
side panel is an `<aside>` or a modal `role="dialog"`, stays measured because
focus trapping and Escape cannot be expressed in CSS.

Nine defects were found by these harnesses and fixed rather than worked around.
The ones worth naming: a subscription opened without a credential stayed dead
forever, because `EventSource` retries the URL it was built with; the credential
cache went stale against any write it did not make itself; recovery notes and
`EncounterStatusFeedback` put a protocol failure and an encounter ID onto a
player's screen; the Character Sheet panel showed a player their own participant
and character IDs and was entirely untranslated; and headless Chrome had been
running every harness at 800x600, so no layout assertion described the viewport
it claimed.

**Layout limitation carried forward.** At 1366x768 the page is about one and a
half viewport heights when the event feed or a GM tool group is open, so reading
either scrolls the map off screen. What is asserted, at every desktop viewport
and on every run, is that the map and the role's primary action region - the
Player's action rail, the GM's inspector - each begin inside the first viewport
height. Optional reading below the fold is the limitation; a required action
below the fold would be a defect, and is tested for. A viewport-locked layout
was attempted and reverted after it collapsed the map to 34px. Polish, not a
blocker.

---

## M3 — Fog of war and lighting

**User-visible outcome.** Players see only what their characters can see.
Explored-but-not-visible areas are remembered dimly. Light sources matter.
Opening a door changes what everyone can see. The GM controls all of it and can
reveal or conceal at will.

**Technical outcome.** Server-side visibility computation consuming the
`blocksVision` flag that terrain and entities already store. Per-viewer
visibility projection on scene reads and streams. Persisted per-character
explored state. Light sources as scene data.

**Acceptance criteria.** PRD V4. A player's scene payload contains no
unrevealed map state — verified by inspecting the payload, not the render.
Visibility recomputation stays within frame budget on a 100×100 map.

**Tests.** Rules unit tests for line of sight and light falloff; server tests
that a player payload omits unrevealed cells and entities; a browser smoke where
the player's view changes when the GM opens a door.

**Dependencies.** M2 (needs a renderer surface that can express fog).

**Excludes.** Dynamic shadows. Coloured lighting. Vision types such as
darkvision — deferred to M7's condition and sense work.

---

## M4 — Renderer quality

**User-visible outcome.** The map looks and feels like a game. Tokens animate
between cells rather than snapping. Attacks, damage, healing, and conditions have
visible effects. Doors and traps animate. It holds 60 fps with a busy scene.

**Technical outcome.** Decide, on evidence, whether the current canvas renderer
can reach the bar. Keep the renderer behind an interface either way. If it
cannot, adopt a dedicated 2D renderer (PixiJS or equivalent) incrementally
behind that interface, one layer at a time, with the server contract untouched.

**Acceptance criteria.** PRD F1 and §17. A documented benchmark on a 100×100 map
with 50 tokens. No change to `packages/protocol`.

**Tests.** Deterministic unit tests for camera and projection maths; a benchmark
script with a recorded baseline; visual capture diffs.

**Dependencies.** M2. Informed by M3.

**Excludes.** 3D. Isometric-only commitment — projection stays a camera mode.

---

## M5 — Map builder completion

**User-visible outcome.** A GM can author a real dungeon: rooms, walls, doors,
stairs, portals, zones, hidden objects, traps, spawn points, lighting, and
layers. Copy, paste, group, select, delete. Reusable presets. Save drafts,
publish, and re-edit a published map without breaking a running session.

**Technical outcome.** The remainder of PRD §10. Scene versioning: a live scene
is a snapshot, and republishing is explicit and versioned. Server-side map
records that the builder can reopen.

**Acceptance criteria.** Every PRD §10 capability present. Editing and
republishing a map used by a live session does not mutate that session in place.

**Tests.** `map-builder-state` unit tests per tool and per undo path; a smoke
covering paint, publish, re-edit, republish, and verification that the live scene
is unchanged until the GM adopts the new version.

**Dependencies.** M3 for vision and lighting authoring.

**Excludes.** Procedural generation. Asset import pipelines.

---

## M6 — Character foundations

**User-visible outcome.** A complete, correct level-1 character under the
declared ruleset, built through a guided flow that explains each choice.

**Technical outcome.** Resolve the 2014/2024 mixing defect (PRD §27.3). Build
the 2014 content pack: races with ability score increases, 2014 backgrounds,
2014 class features. Explicit choice UI where the current build only previews an
automatic assignment. Rules-profile validation that refuses cross-edition
content.

**Acceptance criteria.** PRD R1. A character built under `dnd-5e-2014` contains
no 2024-only species, background boost, or class feature. Every builder choice
is a stored decision, not an inferred preview.

**Tests.** Content-pack legality tests per profile; a test that no profile can
resolve content from another edition; Persian phrase coverage for all new
content.

**Dependencies.** M1.

**Excludes.** Multiclassing. Levels above 1 (that is M10).

---

## M7 — Combat breadth

**User-visible outcome.** Combat that resembles playing D&D: weapons that
differ, ranged attacks, reach, cover, opportunity attacks, reactions,
advantage and disadvantage, damage types, resistance, temporary HP, death saves,
and conditions that actually do something.

**Technical outcome.** A weapon and damage model. Reach and range with cover.
The reaction window. A real condition engine — conditions as effects with
mechanical consequences and durations. Senses, including darkvision, feeding
M3's visibility.

**Acceptance criteria.** Every rule in the 2014 combat chapter that this
milestone claims is unit-tested against the book. Each result's audit record
names the rule applied.

**Tests.** Rules unit tests per mechanic; server tests for reaction timing and
turn-order interaction; a browser smoke for a ranged attack with cover and an
opportunity attack.

**Dependencies.** M6.

**Excludes.** Spells. Monster stat blocks beyond what the GM authors by hand.

---

## M8 — Spellcasting architecture

**User-visible outcome.** A caster can prepare, cast, and track spells; slots
are spent; concentration is tracked; areas of effect appear on the map.

**Technical outcome.** The extensibility test for the rules engine. Spells as
content-pack data plus a small set of composable effect primitives — targeting,
area, save-or-effect, damage, healing, condition application, duration,
concentration — registered rather than switched on. Explicitly _not_ a universal
scripting engine.

**Acceptance criteria.** Adding a new SRD spell that composes existing
primitives requires a data entry and no engine change. Spells that do not
compose are declared unsupported rather than special-cased.

**Tests.** Effect-primitive unit tests; per-spell data tests for a
representative set; concentration interruption tests.

**Dependencies.** M7.

**Excludes.** Every spell in the book. Ritual timing. Wild magic.

---

## M9 — Equipment and resources

**User-visible outcome.** Inventory, equipment with real effects, attunement,
currency, encumbrance where the table wants it, short and long rests, hit dice,
and class resources that recover on the right schedule.

**Technical outcome.** An item model in the content pack. Equipped-state effects
feeding AC and attacks. The rest system driving resource recovery.

**Acceptance criteria.** Equipping armour changes AC through the rules engine,
not the UI. A long rest restores exactly what the 2014 rules say.

**Tests.** Rules unit tests for AC derivation, encumbrance, and rest recovery;
a browser smoke for equip, rest, and resource recovery.

**Dependencies.** M7.

---

## M10 — Progression

**User-visible outcome.** Characters level up: hit points, proficiency,
features, subclasses, ability score improvements, feats, and spell progression.

**Technical outcome.** Class progression tables in the content pack. A level-up
flow that records choices as decisions. Migration of existing level-1 library
entries.

**Acceptance criteria.** A character can advance 1→5 with correct derived stats
at each level. An existing library entry survives the migration unchanged in
meaning.

**Dependencies.** M6, M8, M9.

**Excludes.** Multiclassing, unless it falls out for free.

---

## M11 — Campaigns

**User-visible outcome.** A GM runs a campaign, not isolated sessions: multiple
maps, persistent world state, session history, party state carried forward, and
prepared content ready to drop in.

**Technical outcome.** A campaign aggregate above sessions. Persistent character
progress across sessions, still respecting the library boundary. Prepared
encounter and scene libraries.

**Acceptance criteria.** PRD L1 holds across a whole campaign, not just one
session.

**Dependencies.** M5, M10.

---

## M12 — Content packs

**User-visible outcome.** A table installs additional legally usable content and
the GM authors their own creatures, items, and spells.

**Technical outcome.** A content pack format with declared source, licence, and
ruleset version. Loading, validation, and per-session enabling. GM-authored
content as a first-class pack. Distributable SRD data shipped separately from any
private reference material.

**Acceptance criteria.** No pack can inject content from a ruleset the session
did not declare. Removing a pack degrades gracefully rather than corrupting saved
characters.

**Dependencies.** M6.

**Excludes.** A marketplace, paid content, or any hosting of third-party
copyrighted text.

---

## M13 — Polish

**User-visible outcome.** It feels finished. Consistent visual identity,
animation and audio feedback, empty and loading states, onboarding, and full
accessibility.

**Technical outcome.** A design system. Motion honouring `prefers-reduced-motion`.
Complete keyboard paths and screen-reader coverage. Full Persian coverage
including RTL layout on every surface.

**Acceptance criteria.** PRD §22 in full, PRD I1–I3, and a WCAG AA audit.

**Dependencies.** M4.

---

## M14 — Production

**User-visible outcome.** Someone who is not the maintainer can host a game
their group actually plays on.

**Technical outcome.** Compiled server build rather than `tsx`. TLS and a
reverse proxy. Shared rate limiting and shared SSE fan-out, so more than one
process is safe. Cold-boot outbox redelivery. Health checks, structured logging,
metrics, and backups. Documented upgrade and migration procedure.

**Acceptance criteria.** Two server processes behave identically to one for rate
limiting, event delivery, and outbox dispatch. A documented restore from backup.

**Dependencies.** M1 at minimum; realistically after M13.

**Excludes.** Autoscaling, multi-region, multi-tenancy, billing.

---

## Rules coverage model

Per PHB (2014) rule domain. **Target ruleset is `dnd-5e-2014` exclusively.**

Levels: **None** — nothing exists. **Data** — content is present but the engine
does not act on it. **Partial** — some rules act, with named gaps. **Solid** —
the domain works for normal play with documented exclusions.

| Domain                       | Coverage | Reality                                                                                  | Milestone |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------- | --------- |
| Ability scores and modifiers | Solid    | Scores, modifiers, derived stats. Standard array, point buy, manual.                     | done      |
| Proficiency bonus            | Partial  | By level in the builder; not consumed by every resolution path.                          | M6, M7    |
| Skills                       | Data     | All 18 present as data. No check resolution.                                             | M1        |
| Saving throws                | Data     | Class proficiencies stored. No save resolution.                                          | M1        |
| Races and subraces           | Data     | **2024 species data, not 2014 races.** The mixing defect.                                | M6        |
| Classes                      | Data     | Level-1 metadata for 12 classes. No features acting.                                     | M6, M10   |
| Class progression            | None     | Level 1 only.                                                                            | M10       |
| Backgrounds                  | Data     | 2024-style background ability boosts. Cross-edition.                                     | M6        |
| Equipment                    | Data     | Starting-equipment labels and simple AC metadata.                                        | M9        |
| Armor and weapons            | None     | No weapon model at all; attacks use a fixed `1d8`.                                       | M7        |
| Adventuring and movement     | Partial  | Grid movement, budget, blocking terrain. No difficult terrain, travel pace, or climbing. | M1, M7    |
| Rests                        | None     | No short or long rest.                                                                   | M9        |
| Combat structure             | Partial  | Initiative, rounds, turns, action economy. No reaction window.                           | M7        |
| Actions and reactions        | Partial  | Action, bonus action, and reaction are tracked as budget only.                           | M7        |
| Attacks                      | Partial  | Melee d20 vs AC, crit and crit-miss. No range, reach, cover, or advantage.               | M7        |
| Damage and healing           | Partial  | `1d8 + STR`, doubled dice on crit. No damage types, resistance, or temp HP.              | M7        |
| Death and dying              | None     | Downed only. No death saves or stabilization.                                            | M7        |
| Conditions                   | Data     | Tags with no mechanical effect.                                                          | M7        |
| Spellcasting                 | Data     | Level-1 spell lists and slot metadata. No casting.                                       | M8        |
| Spells                       | Data     | SRD cantrips and level-1 spells as data only.                                            | M8        |
| Vision, light, and stealth   | None     | `blocksVision` is stored and consumed by nothing.                                        | M3        |
| Monsters and stat blocks     | None     | Combatants are GM-controlled actors. Out of PHB scope anyway.                            | M7, M12   |
| Magic items                  | None     | Out of PHB scope. Needs another source.                                                  | M12       |
| Encounter building           | None     | Out of PHB scope. Needs another source.                                                  | M12       |

The PHB is not the whole corpus. Monsters, magic items, and encounter-building
rules are not in it, and the architecture must not pretend one book covers
everything.

## Known defects tracked as work

| Defect                                               | Severity | Milestone |
| ---------------------------------------------------- | -------- | --------- |
| 2014/2024 rules content mixing                       | High     | M6        |
| Rate limits, SSE fan-out, and outbox are per-process | Medium   | M14       |
| Server runs via `tsx` in the container image         | Medium   | M14       |
| No cold-boot outbox redelivery                       | Medium   | M14       |
| `/maps` cannot re-edit a published scene             | Medium   | M5        |
| Movement preview can offer a cell the server rejects | Low      | M3        |
| Auth MVP lacks reset, verification, and MFA          | Low      | M14       |
| Demo scenario copy is hardcoded English              | Low      | M1        |

`demoScenarios` in `apps/web/lib/runtime-cockpit-helpers.ts` carries its
`description` as a literal, so the Persian surface renders the English sentence
"Training Room Skirmish uses Training Room with Aria and Borin for a short
two-player encounter." verbatim. The `Messages` type cannot catch this: the
string never enters `messages`, so typecheck sees nothing to compare. Scenario
names and IDs are canonical and stay untranslated - the prose is the bug.

The DB bridge harness flake is fixed. It was not the session-ID write: the
cockpit re-reads its persisted state in a mount effect, and Next's dev server
compiles `/runtime` on demand, so a compile landing while the harness was
already driving the page remounted the cockpit and replayed the stored mode over
the click it had just made. The page fell back to DM mode and the run died much
later waiting for `Join Session`, which only renders for a player - which is why
it surfaced at two different steps on identical code. The failing run showed
`Compiled /runtime in 2.2s` mid-run and took 137s against ~39s for the passing
runs either side of it. The harnesses now confirm the mode against stored state
and re-click if it reverts, and re-apply the session-ID write until it sticks.

The product-side half was the hydration effect replaying stored local state over
whatever the surface currently showed on any remount. M2's split resolved it:
identity and the projected read models now live in one hook whose only entry
point is `switchIdentity`, and every switch clears the previous seat's
projections, so there is no longer a second copy for a remount to replay.
