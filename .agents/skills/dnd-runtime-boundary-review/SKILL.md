---
name: dnd-runtime-boundary-review
description: Use when reviewing DND-web prompts, plans, diffs, or PR summaries for server authority, DM role gates, Character Library/runtime separation, i18n, realtime/outbox claims, and product scope creep.
---

# DND-web Runtime Boundary Review

Use this skill to review a proposed task, implementation plan, diff summary, or
PR summary against DND-web's runtime and product guardrails. Review only; do
not implement fixes directly.

Trigger examples:

- "review this plan for runtime boundaries"
- "check this diff against DND-web guardrails"
- "does this violate Character Library/runtime separation?"
- "review for DM authority and server authority"
- "check realtime/outbox claims"
- "boundary review before implementation"
- "boundary review before PR"

## Review Rules

- Inspect relevant docs or files when available before making claims.
- If reviewing actual code or a diff, request or cite exact file paths and line
  numbers when possible.
- Do not guess. If evidence is missing, list it under uncertainty.
- Focus on boundary risks, not general code style, unless style creates a
  boundary or product-scope problem.
- Recommend the next action, but do not patch files or start implementation.

## Severity

- **Critical:** must fix before implementation or merge.
- **Important:** should fix before implementation or merge.
- **Minor:** nice to have, clarity, or wording cleanup.
- **No issues found:** use only when you found no boundary problems in the
  evidence reviewed.

## Boundaries To Check Every Time

### A. Server Authority

- Browser state is never authoritative.
- Browser may render state, send commands, subscribe to SSE, and reread read
  models.
- Server validates commands and owns session/runtime state.

### B. DM Authority And Role Gates

- DM remains final authority.
- DM-only actions must be server-side role gated.
- Player intent must not bypass DM assignment or approval where the product
  requires DM control.

### C. Character Library Vs Runtime Separation

- Character Library entries are reusable player-owned build/identity records.
- Runtime HP, position, conditions, movement usage, active encounter
  membership, scene placement, and DM overrides are live-session overlays.
- Runtime mutations must never mutate reusable Character Library entries.
- The Character Library -> Runtime bridge should create or use separate runtime
  copies and preserve source metadata where appropriate.

### D. Realtime And Outbox Honesty

- Do not claim durable replay, stream cursor, catch-up, exactly-once delivery,
  or multi-process SSE coordination unless actually implemented.
- Existing outbox/status visibility must not be described as replay, drain, or
  catch-up unless code proves it.

### E. Product Scope

- Do not broaden into CRPG, monster AI, full D&D automation, full spell system,
  fog of war, broad inventory/ranged/death-save systems, or production auth
  unless explicitly approved by a human.
- Keep current priority focused on Training Room Skirmish / Phase 6 playable
  DM-player product-flow polish unless a human changes the milestone.

### F. i18n And UX Direction

- Preserve English/Persian i18n.
- Preserve LTR/RTL behavior.
- Visual polish may be inspired by Diablo/Hades, but must not turn the project
  into a CRPG or remove DM-first tabletop control.

### G. Auth And Security Claims

- Auth is MVP opaque HttpOnly-cookie session auth, not production account
  security.
- Do not overclaim password reset, email verification, MFA, OAuth, CSRF
  coverage, or production hardening unless implemented.

## Finding Format

For each finding include:

- Boundary violated or at risk.
- Evidence from the prompt, plan, diff, PR summary, or cited file/line.
- Why it matters.
- Recommended next action.

When citing code, use file paths and line numbers when available. If you cannot
inspect the relevant file, state that explicitly.

## Output Format

1. **Verdict**
   - `Pass`, `Pass with cautions`, or `Blocked`.
2. **Critical findings**
3. **Important findings**
4. **Minor findings**
5. **Uncertainties / missing evidence**
6. **Recommended next action**

Use `None` for empty finding sections. Keep the review concise and evidence-led.
