# ADR 0007 — Integration tests against real Postgres (PGlite locally, Postgres in CI)

**Status:** Accepted · 2026-10-03

## Context

Unit tests use in-memory fakes, but Prisma queries, constraints, triggers and
transactions need a real database. Not every dev machine has Docker.

## Decision

- `pnpm --filter @procurestack/api test:int` runs `*.int-spec.ts` files serially.
- If `TEST_DATABASE_URL` is set (CI uses a `postgres:18` service), the tests use it.
  Otherwise Jest's global setup starts **PGlite** (Postgres compiled to WASM, in-process)
  behind `pglite-socket`, so `pg`/Prisma connect over TCP exactly as in production.
- Global setup runs `prisma migrate deploy`, so the suite also proves that migrations apply.

## Consequences

- PGlite is Postgres 17, not 18. Version-specific behaviour is still caught by CI.
- Adds two dev-only dependencies (`@electric-sql/pglite`, `@electric-sql/pglite-socket`).
- PGlite is a single session: connections are multiplexed, not isolated. The suite runs
  serially, and race conditions are tested deterministically (stale version), not with
  real parallelism.
- Prisma 7 loads its WASM query compiler via dynamic `import()`, so this suite runs Jest
  with `--experimental-vm-modules`.
- `db:new-migration <name>` reuses the same PGlite helper to generate migrations without
  Docker (apply existing migrations, then diff against `schema.prisma`).
