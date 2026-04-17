# 🧱 STACK_DECISIONS.md

## Purpose

This document records the initial technology decisions for the D&D DM-Driven Platform.

Its goal is to:

- lock the early implementation direction
- reduce repeated stack debates during MVP
- clarify which choices are intentional
- define what is chosen now vs deferred for later

This document is not permanent.
It can evolve as the project matures, but changes should be intentional and documented.

---

## 1. Guiding Constraints

The stack is being chosen for a project that is:

- browser-based
- real-time
- multiplayer
- DM-authoritative
- session/room-oriented
- rules-assisted
- built initially by a solo developer with AI assistance

Because of that, the stack should optimize for:

- development speed
- correctness of shared models
- low integration friction
- maintainability
- fast iteration
- room/session-based real-time architecture

It should **not** optimize first for:

- premature microservice decomposition
- maximum theoretical backend performance
- complex infra from day one
- broad polyglot architecture

---

## 2. Chosen Stack

### Language

- **TypeScript**

### Package Management / Monorepo

- **pnpm workspaces**

### Frontend

- **Next.js**
- **React**
- **Tailwind CSS**

### Backend Runtime

- **Node.js**

### Real-Time Multiplayer / Authoritative Room Runtime

- **Colyseus**

### Database

- **PostgreSQL**

### ORM / Database Toolkit

- **Drizzle ORM**

### Validation / Shared Contracts

- **Zod**

### Authentication

- **Deferred initially**
- likely direction: **Auth.js** later if/when full auth becomes necessary

---

## 3. Why This Stack Was Chosen

## TypeScript

Chosen because:

- the project has many shared contracts between client and server
- rules, commands, state payloads, and character models benefit from shared typing
- end-to-end TypeScript reduces context switching
- it improves solo development velocity
- it works well with AI-assisted development and refactoring

### Expected benefits

- shared schemas across frontend/backend
- lower integration friction
- easier iteration during early architecture changes

---

## pnpm Workspaces

Chosen because:

- the project will likely be a monorepo
- multiple apps/packages will share code
- pnpm is efficient and widely used for TypeScript monorepos

### Expected structure

- `apps/web`
- `apps/server`
- `packages/shared`
- `packages/rules`
- `packages/protocol`
- `packages/db`

---

## Next.js

Chosen because:

- the frontend is browser-based
- the product needs structured UI, not just a canvas
- it will likely need dashboards, session pages, settings, and DM tools
- it gives a productive React-based app foundation

### Expected benefits

- strong developer experience
- easy route structure
- good fit for browser UI + product surface

---

## Node.js

Chosen because:

- it matches the TypeScript ecosystem
- it keeps the frontend/backend development model aligned
- it allows using Colyseus naturally
- it reduces stack fragmentation in MVP

---

## Colyseus

Chosen because:

- the product is session/room-based
- each D&D session maps naturally to an authoritative room
- the server must own session state
- real-time synchronization is a core product need
- reconnect/lifecycle/room semantics are important

### Why it fits this product

This platform is not generic chat or generic realtime collaboration.
It is a **stateful session runtime**.

Colyseus provides a good base for:

- room isolation
- authoritative state ownership
- synchronized session runtime
- client intent → server validation → room update flow

### Important limitation

Colyseus is **not** the rules engine.
It provides the real-time room/runtime model, not D&D rules logic.

---

## PostgreSQL

Chosen because:

- the system needs durable structured data
- it must support character data, session metadata, scenes, and history
- it is reliable and well understood
- relational structure fits the domain well

### Expected usage

- users
- campaigns
- session metadata
- character documents
- scene definitions
- snapshots
- audit/event history

---

## Drizzle ORM

Chosen because:

- it is lightweight
- TypeScript-native usage is strong
- it fits a shared-schema workflow
- it keeps database logic relatively close to SQL reality

### Expected benefits

- low friction migrations
- predictable schema ownership
- good fit for solo development

---

## Zod

Chosen because:

- the project needs runtime validation, not only compile-time typing
- commands and payloads cannot trust clients
- rules configuration and user actions must be validated explicitly

### Expected usage

- session commands
- character input validation
- rules profile validation
- shared API/request schemas
- DM action payloads

---

## 4. Deferred Decisions

The following decisions are intentionally deferred:

### Authentication Strategy

Deferred because:

- early MVP can begin with lightweight identity/session assumptions
- full auth is not required to validate the core room runtime

Likely later candidate:

- Auth.js

---

### Deployment Platform

Deferred because:

- infrastructure needs should be shaped by the actual runtime
- deployment choice should follow successful local MVP runtime

Possible future options:

- Vercel for web
- Railway / Fly.io / Render / VPS / container hosting for server
- managed Postgres provider

---

### Redis / Presence / Multi-Process Scaling

Deferred because:

- MVP should start with single-process assumptions where reasonable
- multi-room scaling should come after core correctness is proven

Expected future use:

- Redis presence / coordination when scaling beyond single-process runtime

---

### Observability Stack

Deferred because:

- early development needs lightweight logging first
- full metrics/tracing should come after runtime is working

Possible future additions:

- structured logs
- metrics
- tracing
- room-level diagnostics

---

### Asset Storage Strategy

Deferred because:

- asset complexity is not needed to validate the initial runtime
- simple local/static asset handling is enough initially

---

## 5. Explicit Non-Choices

These are intentionally **not** chosen for MVP as the primary stack direction.

### Go

Not chosen for MVP because:

- it would split the language model between frontend and backend
- shared contracts would become more complex
- it would reduce iteration speed in the early phase
- it is better kept as a future option for targeted heavy services if needed

### Microservices

Not chosen because:

- the project is still in MVP definition stage
- service decomposition would create unnecessary complexity too early
- a modular monolith / room-oriented runtime is more appropriate initially

### Socket.IO as a full custom room runtime foundation

Not chosen as the primary architecture because:

- the project benefits from a room/session abstraction
- Colyseus is closer to the product’s runtime model
- custom socket architecture would increase boilerplate early on

### Full auth-first architecture

Not chosen because:

- it is not necessary to prove the MVP gameplay/runtime loop
- it would slow early implementation

---

## 6. Initial Repository Shape

### Root

- `README.md`
- `SYSTEM_DESIGN.md`
- `PRD.md`
- `ROADMAP.md`
- `TASKS_PHASE_0.md`
- `TASKS_PHASE_1.md`
- `STACK_DECISIONS.md`

### Applications

- `apps/web`
- `apps/server`

### Shared Packages

- `packages/shared`
- `packages/protocol`
- `packages/rules`
- `packages/db`

### Optional Later Additions

- `packages/ui`
- `scripts/`
- `infra/`
- `docs/decisions/`

---

## 7. Decision Rules Going Forward

Future stack changes should follow these rules:

1. Do not change the stack because of novelty or hype.
2. Prefer changing architecture only when a real bottleneck is proven.
3. Keep shared contracts simple and explicit.
4. Protect solo development velocity during MVP.
5. Optimize for correctness and iteration before optimization for scale.
6. Introduce new infrastructure only when the current phase truly demands it.

---

## 8. Current Implementation Baseline

The current assumed implementation baseline is:

- TypeScript everywhere
- pnpm workspace monorepo
- Next.js frontend in `apps/web`
- Colyseus/Node server in `apps/server`
- PostgreSQL database
- Drizzle ORM
- Zod for runtime validation

This baseline should remain stable through:

- Phase 0
- Phase 1
- early MVP runtime work

Unless a critical blocker appears, stack changes should be avoided during those phases.
