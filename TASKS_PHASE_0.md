# ✅ TASKS_PHASE_0.md

## Phase 0 Goal

Establish a stable, repeatable project foundation before feature development begins.

This phase is successful when:

- the repository is structured
- the core documents are in place
- the development workflow is repeatable
- local setup is clear
- basic quality gates exist

---

## 1. Repository Foundation

### Task 0.1 — Create root documentation layout

**Description:** Add and organize core project documents in the root of the repository.

**Deliverables:**

- `README.md`
- `SYSTEM_DESIGN.md`
- `PRD.md`
- `ROADMAP.md`
- `TASKS_PHASE_0.md`

**Definition of Done:**

- All files exist in root
- File names are consistent
- Documents are committed

---

### Task 0.2 — Create project directory structure

**Description:** Define an initial folder structure that supports future client/server/domain separation.

**Suggested output:**

- `/apps`
- `/packages`
- `/docs`
- `/scripts`
- optional `/infra`

**Definition of Done:**

- Folder structure exists
- Structure is documented briefly in `README.md`

---

### Task 0.3 — Add `.gitignore`

**Description:** Add a proper `.gitignore` for the expected stack and local development artifacts.

**Definition of Done:**

- Common junk files are ignored
- Environment files and build outputs are ignored

---

## 2. Development Workflow Baseline

### Task 0.4 — Choose package manager strategy

**Description:** Decide on the package manager and standardize it for the repo.

**Decision to capture:**

- npm / pnpm / yarn / bun

**Definition of Done:**

- Choice is documented in `README.md`
- Lockfile exists if applicable

---

### Task 0.5 — Set formatting and linting baseline

**Description:** Add code formatting and linting standards for future implementation.

**Deliverables:**

- formatter config
- linter config
- scripts for formatting/linting

**Definition of Done:**

- One command exists to format code
- One command exists to lint code
- The commands are documented

---

### Task 0.6 — Set test command baseline

**Description:** Define how tests will run, even if no real tests exist yet.

**Deliverables:**

- test script in project config
- placeholder test setup if needed

**Definition of Done:**

- `test` command exists
- command runs successfully

---

## 3. Local Setup & Onboarding

### Task 0.7 — Write initial `README.md`

**Description:** Write a minimal but useful README for local onboarding.

**README should include:**

- project purpose
- current status
- how to install dependencies
- how to run local development
- how to run lint/format/test
- where the main docs live

**Definition of Done:**

- A new contributor can clone the repo and understand how to start

---

### Task 0.8 — Define environment variable strategy

**Description:** Decide how environment variables will be handled across local development.

**Deliverables:**

- `.env.example`
- documented naming convention
- note on secrets handling

**Definition of Done:**

- No secret values are committed
- Example env file exists

---

### Task 0.9 — Add local run script strategy

**Description:** Define the commands used to boot the project locally.

**Definition of Done:**

- There is a documented dev command
- Command naming is consistent

---

## 4. Quality & Automation Baseline

### Task 0.10 — Set up basic CI

**Description:** Add a minimal CI pipeline for validation on push/PR.

**Minimum checks:**

- install
- lint
- test
- format check (optional)

**Definition of Done:**

- CI runs automatically
- CI passes on main branch

---

### Task 0.11 — Add pre-commit / pre-push quality hooks (optional but recommended)

**Description:** Add lightweight local automation to prevent obvious mistakes.

**Definition of Done:**

- Hooks run reliably
- Hooks are documented
- Hooks do not create unnecessary friction

---

## 5. Decision Logging

### Task 0.12 — Create lightweight architecture/decision log

**Description:** Add a place to capture important project decisions as they happen.

**Suggested output:**

- `/docs/decisions/`
- or `DECISIONS.md`

**Use it for:**

- package manager choice
- repo structure decisions
- future stack decisions
- major tradeoff decisions

**Definition of Done:**

- A decision log exists
- First entry is created

---

## 6. Phase Exit Checklist

Before Phase 0 is complete, confirm:

- [ ] Root docs are in place
- [ ] Repo structure exists
- [ ] `.gitignore` exists
- [ ] Package manager choice is documented
- [ ] Lint/format/test commands exist
- [ ] `README.md` is usable
- [ ] `.env.example` exists
- [ ] Local dev command is documented
- [ ] CI runs successfully
- [ ] Decision log exists

---

## 7. Notes

### What NOT to do in Phase 0

- Do not implement gameplay features
- Do not choose advanced infra prematurely
- Do not overdesign the folder structure
- Do not commit secrets
- Do not optimize for scale yet

### Output of Phase 0

At the end of this phase, the project should feel ready for real feature work.
The next step after this phase is `TASKS_PHASE_1.md`.
