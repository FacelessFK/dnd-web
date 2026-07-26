---
name: dnd-boundary-review
description: Review a DND-web plan, spec, diff, or PR summary against the non-negotiable guardrails - server authority, DM role gates, Character Library/runtime separation, i18n/RTL, realtime and outbox claims, auth claims, and product scope creep. Review-only, never patches code.
---

# DND-web Runtime Boundary Review

Review-only. Report findings; do not patch files or start implementation unless
a human explicitly approves a follow-up task.

Cite exact file paths and line numbers when reviewing real code. If evidence is
missing, list it under uncertainty instead of guessing.

## The Six Checks

Run every one. For each, answer **pass / fail / needs evidence** with a reason.

### 1. Server authority

- Does anything treat browser state as truth?
- Is a value computed client-side that the server should own (HP, position,
  turn order, legality, damage, initiative)?
- Does the UI optimistically apply a mutation without a server response?

The browser may render, preview, and derive display state from server responses.
It may not decide outcomes.

### 2. DM role gates

- Is every DM-only behavior gated in `apps/server`, not only in the UI?
- Does a Player-mode path reach a `dm_*` command or another participant's
  character?
- Check `apps/server/src/session-server.ts` and `game-runtime.ts` for the
  actual role check, not the component that hides the button.

### 3. Character Library / runtime separation

The single most important boundary in this repo.

- Does live play write back into a Character Library entry? Live HP, position,
  conditions, movement usage, encounter membership, and DM overrides must never
  mutate `character_library_entries`.
- Does the change confuse `POST /api/characters/command` (runtime characters)
  with `POST /api/character-library/command` (reusable entries)?
- If the bridge is involved: does it still create a _separate_ runtime character
  copy and record `meta.sourceCharacterLibraryEntryId`?

### 4. i18n and RTL

- Is there new user-facing copy outside `apps/web/lib/i18n.tsx`?
- Does every new key exist in both `en` and `fa`?
- Is a localized label being used as a canonical ID? (`rulesProfileId`, class /
  species / background / spell IDs, ability keys, command types, DB IDs must
  stay stable and untranslated.)
- Is user-entered character data being auto-translated? It must not be.
- Does the layout hold in RTL — no hardcoded `left`/`right` where logical
  properties are needed?

### 5. Realtime, outbox, and persistence claims

- Does any code, copy, doc, or commit message imply replay, stream cursors, a
  catch-up API, exactly-once delivery, cold-boot outbox redelivery, or
  multi-process coordination? None of those exist.
- Is `GET /api/outbox/status` described as anything more than a read-only
  backlog count? It does not drain, publish, or replay.
- Is auth described as more than an MVP? There is no password reset, email
  verification, MFA, OAuth, account management UI, or dedicated CSRF token.

### 6. Product scope

Flag drift toward: full spell automation, a full condition engine (condition
tags are metadata only), monster AI, full monster stat blocks, CRPG systems,
fog of war / line of sight / lighting, opportunity attacks and reaction windows,
broad weapon / ranged / inventory / death-save systems, production auth,
deployment, or monitoring.

Scope drift is a finding even when the code is good.

## Report

Group findings by severity:

- **Blocker** — violates a non-negotiable boundary. Must change before merge.
- **Risk** — likely to cause a boundary problem later, or an overclaim in docs.
- **Note** — worth knowing, not blocking.
- **Uncertainty** — evidence you could not obtain.

End with a one-line verdict: `pass`, `pass with cautions`, or `blocked`, and the
recommended next action.
