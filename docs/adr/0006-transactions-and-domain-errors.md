# ADR 0006 — Transactions (unit of work) and domain errors

**Status:** Accepted · 2026-10-03

## Context

A state change and its audit entry must commit together, or not at all. Services must
not import Prisma (hexagonal rule), yet they decide where a transaction starts and ends.

## Decision

- **`UnitOfWork` port** with `run(fn)`. The Prisma adapter opens an interactive
  transaction and puts the transaction client in `AsyncLocalStorage`. Every repository
  reads its client from `PrismaTxHost.client`, so all calls inside `run` share one
  transaction, including `AuditService.record`.
- **Optimistic locking:** aggregates carry `version`. Writes use
  `updateMany({ where: { id, version } })`, and 0 rows updated means `409 Conflict`
  (someone else changed it first).
- **Domain errors** (`DomainError` with kind `not_found | forbidden | conflict | rule`) are
  plain classes with no Nest import. One global filter maps them to 404/403/409/422.
- **Row-level reads** that are not allowed return **404, not 403**, so IDs can't be probed.

## Consequences

- Test fakes implement `run(fn) => fn()`. Rollback itself is covered by the integration
  suite against a real Postgres.
- Long work (e.g. BullMQ jobs) must never run inside `run`. Keep transactions short.
