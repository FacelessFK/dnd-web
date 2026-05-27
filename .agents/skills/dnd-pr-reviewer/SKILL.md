---
name: dnd-pr-reviewer
description: Use to review DND-web diffs, PR summaries, or implementation reports before merge using the project checklist.
---

# DND-web PR Reviewer

Use this skill to review a DND-web diff, PR summary, or implementation report
before merge. Review only; do not implement fixes directly.

Trigger examples:

- "review this PR"
- "review this diff before merge"
- "check this implementation report"
- "run DND-web PR review"
- "pre-merge review"
- "review against project checklist"

## Review Rules

- Inspect the provided diff, summary, or report first.
- Inspect relevant files and source-of-truth docs when available before making
  claims.
- Do not patch files, start implementation, or run a fix unless a human
  explicitly approves a follow-up implementation task.
- Cite exact file paths and line numbers when reviewing actual code or diffs.
- Mark opinion-based findings clearly as opinion.
- If evidence is missing, list it under uncertainty instead of guessing.
- Keep findings evidence-led and focused on merge risk.

## Severity

- **Critical:** must fix before merge.
- **Important:** should fix before merge.
- **Minor:** nice to have, clarity, or low-risk wording cleanup.
- **No issues found:** use only when the reviewed evidence shows no material
  issues.

## Project Checklist

### A. Scope

- Does the change match the approved task?
- Did it avoid unrelated refactors, broad rewrites, file moves, and scope
  creep?
- Did it avoid broadening into CRPG/full automation/monster AI/full spell
  systems/fog of war/production auth?

### B. Product North Star

- Does the change preserve DM-first tabletop control?
- Does it improve the browser-based D&D product experience without turning into
  CRPG automation?
- For visual or UI polish, does it move toward tactical clarity and richer
  presentation without removing tabletop or DM authority?

### C. Runtime Boundaries

- Browser state is never authoritative.
- The server owns runtime/session state and validates commands.
- DM-only actions remain role-gated server-side.
- Player intent does not bypass DM authority.

### D. Character Library Vs Runtime Separation

- Reusable Character Library entries are not mutated by runtime HP, position,
  conditions, movement usage, active encounter membership, scene placement, or
  DM overrides.
- The Character Library -> Runtime bridge continues to use separate runtime
  copies and source metadata where applicable.

### E. Realtime, Outbox, And Auth Honesty

- Do not overclaim durable replay, stream cursor, catch-up, exactly-once
  delivery, multi-process SSE, outbox draining, or production auth.
- Auth/security claims stay aligned with MVP opaque HttpOnly-cookie sessions
  unless implementation proves otherwise.

### F. i18n, RTL/LTR, And Accessibility

- English/Persian user-facing copy was updated together when needed.
- LTR/RTL behavior is preserved.
- Existing accessibility patterns are preserved.

### G. Tests And Validation

- Relevant tests were added or updated for the risk level.
- Validation commands match task risk and touched areas.
- Failures, skipped commands, and blockers are reported honestly.
- The implementation report does not claim success beyond validation evidence.

### H. Docs Drift

- If docs were changed, source-of-truth docs stayed aligned.
- If docs were not changed, that is reasonable for the approved scope.
- Any docs drift revealed by the implementation is called out for follow-up.

## Finding Format

For each finding include:

- Affected file/path if known.
- Evidence from the diff, PR summary, implementation report, or cited source.
- Why it matters.
- Recommended next action.

Use `None` for empty finding sections. If the review is blocked by missing
diffs, missing files, or missing validation evidence, say exactly what is
missing.

## Output Format

1. **Verdict**
   - `Approve`
   - `Approve with cautions`
   - `Request changes`
   - `Block merge`
2. **Critical findings**
3. **Important findings**
4. **Minor findings**
5. **Uncertainties / missing evidence**
6. **Recommended next action**
