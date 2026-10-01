# ADR 0001 — Architecture overview

**Status:** Accepted · 2026-10-01

## Context

A learning-grade Procure-to-Pay ERP must model ten procurement concepts as real logic,
stay readable as it grows, and practise production engineering habits from day one.

## Decision

- **Modular monolith, one NestJS module per bounded context** (requisitions, sourcing,
  purchase orders, receiving & matching, inventory, SRM, category management, compliance).
  Modules talk through exported application services, never through each other's tables.
  A monolith keeps transactions and deployment simple; module boundaries keep the option
  of extracting services later.
- **Hexagonal layering inside each module:**
  `http/` (controllers, DTOs, guards) → `application/` (use cases, **ports** = interfaces)
  → `domain/` (entities, state machines, pure formulas) ← `infrastructure/` (Prisma/argon2
  adapters implementing the ports). Domain code imports neither Nest nor Prisma.
- **Zod as the single contract:** schemas live in `packages/shared`; the API derives DTOs,
  validation and Swagger from them (`nestjs-zod`), the web app derives form validation and
  response parsing from the same schemas.
- **Monorepo:** pnpm workspaces + Turborepo (task graph + caching). `shared` is built with
  tsup to ESM + CJS because Vite consumes ESM and Nest runs as CommonJS.
- **State machines** for document status (PR, RFx, PO, match): explicit transition tables
  with guards, never a free-writable status column.
- **Security defaults:** global authentication + authorization guards that deny any route
  without an explicit access policy; append-only audit log enforced by a DB trigger.

## Consequences

- More files per feature than a "service + controller" style; in return, business rules
  are testable without a database (see `test/fakes/`).
- The DB `Role` enum and shared `ROLES` are duplicated by necessity; a unit test guards drift.
- Cross-module reads need explicit service APIs — slower to write, but boundaries stay visible.
