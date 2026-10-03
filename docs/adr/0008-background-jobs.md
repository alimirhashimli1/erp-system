# ADR 0008 — Background jobs (BullMQ) and domain events

**Status:** Accepted · 2026-10-04

## Context

Sourcing needs time-based and asynchronous work: close an RFx at its deadline, and (for
the demo) let simulated suppliers answer after a delay. Such work must survive restarts
and retry on failure, and it must not block HTTP requests.

## Decision

- **BullMQ on Redis.** Queue `sourcing`, with jobs `close-rfx` (delayed until the
  deadline) and `simulate-bid` (delayed a few seconds).
- **Idempotent jobs.** Deterministic job IDs (`close-<rfxId>`) stop duplicates. Handlers
  re-check state ("still PUBLISHED?") because a job may run twice or after a manual action.
  Retries use 3 attempts with exponential backoff.
- **Decoupled through domain events.** `SourcingService` emits `rfx.published` after its
  transaction commits. The jobs module listens and enqueues. The service never imports
  BullMQ, which avoids a circular dependency (the processor calls the service).
- **Optional.** `JOBS_ENABLED=false` skips the queue/worker module (`ConditionalModule`),
  so tests and Redis-less runs work. The RFx then has to be closed manually.
- **In-process worker** for now. A separate worker process is a Phase 5 scaling lesson.

## Consequences

- An event can be lost if the process dies between commit and enqueue. The fix is a
  transactional outbox (Phase 5).
- `RFX_SIMULATE_SUPPLIERS` must stay false in production. It defaults to false, and only
  `.env.example`/Compose turn it on for the demo.
