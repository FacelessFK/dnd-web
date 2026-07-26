# Training Room Table Experience Fresh Goal Intake

## Intake Status

- Date: 2026-06-05
- Chosen path: Training Room table experience product intake
- Recommended effort: `medium`
- Scope: evidence/readout-only fresh product goal after the Character Library
  -> Runtime handoff review verdict closed with `pass` and cautions
- Runtime/product code changed during this intake: no
- Protocol, server commands, DM gates, Character Library/runtime separation,
  DB schema, DB/auth semantics, replay/catch-up, SSE behavior, combat
  automation, and read-model recovery behavior changed or claimed: no

## Why This Path

The Character Library -> Runtime handoff review sequence is closed for the
current evidence. The next useful product question returns to the core table:
can a DM and Player understand the Training Room table state during actual
play?

This intake focuses on comprehension of the existing runtime table experience:

1. DM session creation and Training Room setup.
2. Player join/recovery in a separate browser profile.
3. Tactical grid and assigned-token visibility.
4. Table Setup, Table flow, Player readiness, roster, encounter status, and
   recovery status.
5. Current-turn, `Turn & Target`, action feedback, and blocked/ready states.
6. Player Local Reset as browser-local cleanup.
7. English/Persian scanability and LTR/RTL layout expectations.

This is not a request to add runtime capability. It is a fresh product-goal
intake to decide whether the next slice should be manual review, docs, UI/copy
polish, or no follow-up.

## Fresh Evidence Collected

Commands run on 2026-06-05:

- `corepack pnpm --filter @dnd/web test:smoke` passed with exit code 0.
- `corepack pnpm --filter @dnd/web test:smoke:two-profile` passed all 8 steps
  with session `SCU9S8`:
  - authoritative server startup;
  - Next runtime UI startup;
  - separate DM and Player browser profiles;
  - Training Room build in DM profile;
  - encounter start in DM profile;
  - Player join and table recovery;
  - Player guardrails;
  - Player Local Reset isolation from the DM profile.

Supporting docs/evidence:

- `docs/delivery/TRAINING_ROOM_SKIRMISH_CODEX_BROWSER_RUN.md` records the older
  browser playtest sequence, microcopy polish sequence, bilingual closure, and
  post-Phase-6 action-hierarchy closure.
- `docs/delivery/TRAINING_ROOM_SKIRMISH_PLAYTEST_CHECKLIST.md` already defines
  the fuller human DM/Player checklist for Training Room table experience,
  including saved-character setup, assignment, scene/placement, readiness,
  roster, turn clarity, recovery honesty, English/Persian scanability, and
  visual hierarchy.
- `docs/delivery/RUNTIME_VISUAL_QA_CHECKLIST.md` remains the companion guide
  for visual and responsive review.

## Product Read

Healthy for current automated evidence:

- The default Training Room runtime smoke remains runnable.
- The two-profile DM/Player Training Room smoke remains runnable.
- Player-mode guardrails still hide DM-only Training Room setup, Scene Builder,
  and monster/NPC controls.
- Player Local Reset remains browser-local and does not clear the DM profile's
  server-owned Training Room state.
- The previous action-hierarchy slice remains covered by two-profile smoke
  evidence: `Turn & Target` stays promoted before lower-priority role panels in
  active flows.

Remaining product-confidence gap:

- The newest evidence is still harness-led. It proves mechanics and guardrails,
  but it does not record a fresh human-style table experience review after the
  handoff sequence closed.
- The strongest next question is subjective table clarity: can reviewers
  quickly answer "what is happening at the table, whose turn is it, what can I
  do, and why is this blocked?" without reading implementation context?

## Recommended Next Slice

Training Room Table Experience Reviewer Pass.

Recommended effort: `medium`.

Goal:

Run or record a focused reviewer pass using
`docs/delivery/TRAINING_ROOM_SKIRMISH_PLAYTEST_CHECKLIST.md`, with attention to
the table experience after the latest closures rather than adding new
mechanics.

Scope:

- Use two browser profiles where practical: one DM and one Player.
- Review default Training Room setup, scene/placement, roster, readiness,
  encounter status, `Turn & Target`, action feedback, recovery status, and
  Player Local Reset.
- Review English and Persian scanability where practical.
- Classify any issue as UX/copy, visual hierarchy, i18n/RTL, recovery wording,
  action clarity, role-gate clarity, environment, or product-scope issue.
- Choose any follow-up only from observed review evidence.

Non-goals:

- No runtime protocol changes.
- No DB schema, migration, transaction, idempotency, outbox, or auth changes.
- No production auth/security claims.
- No durable replay, stream cursor, catch-up, exactly-once, multi-process SSE,
  or cold-boot outbox redelivery claims.
- No new Character Library -> Runtime bridge behavior.
- No combat automation, spell automation, inventory expansion, CRPG systems,
  monster AI, fog of war, ranged/death-save systems, or broader D&D systems.
- No implementation during the reviewer pass unless a fresh blocker is found
  and a separate narrow implementation task is approved.

Suggested validation/evidence for the next slice:

- `corepack pnpm --filter @dnd/web test:smoke`
- `corepack pnpm --filter @dnd/web test:smoke:two-profile`
- Manual notes using
  `docs/delivery/TRAINING_ROOM_SKIRMISH_PLAYTEST_CHECKLIST.md`
- Optional visual notes using `docs/delivery/RUNTIME_VISUAL_QA_CHECKLIST.md`

## Boundary Review

Verdict: pass.

Critical findings: none.

Important findings: none.

Minor findings / cautions:

- The current evidence is local harness evidence, not a two-human table test.
- The next slice should stay review-first. Do not turn subjective table clarity
  questions into new runtime features without observed evidence.
- If the next review finds only copy, hierarchy, or i18n friction, keep the
  follow-up at `medium`.
- If the next review touches server authority, DM gates, protocol, DB/auth,
  runtime state, Character Library/runtime separation, realtime/outbox claims,
  or broad product scope, raise follow-up effort to `high` and run boundary
  review before implementation.

## Closure Decision

Close this fresh goal intake as complete.

The next recommended task is a docs/evidence reviewer pass for Training Room
table experience, not immediate runtime implementation.
