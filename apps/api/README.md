# @procurestack/api

NestJS 11 API. Reads env from the repo-root `.env` (see `.env.example`).

## Run & test

```bash
pnpm dev            # watch mode on :3000 (needs Postgres + Redis, see root README)
pnpm test           # unit (src/**/*.spec.ts) + e2e (test/*.e2e-spec.ts) — no DB needed
pnpm test:cov       # with coverage
pnpm test:int       # integration (test/integration/*.int-spec.ts) on real Postgres — PGlite if
                    # TEST_DATABASE_URL is unset (ADR 0007)
pnpm db:migrate     # create + apply a migration (needs a running Postgres)
pnpm db:new-migration <name>  # same, Docker-free: diffs schema.prisma against PGlite
pnpm db:deploy      # apply committed migrations (what CI/containers do)
pnpm db:seed        # upsert one demo user per role
```

## Layout

```
prisma/              schema, migrations (committed), seed
src/
  common/            DomainError (+ HTTP filter), UnitOfWork & numbering ports, throttles
  config/            Zod env schema + typed AppConfigService
  infrastructure/    PrismaService, PrismaTxHost (ambient transaction), Redis/BullMQ root
  modules/<context>/
    domain/          entities, state machines, pure rules (no Nest, no Prisma)
    application/     use-case services + ports (interfaces)
    infrastructure/  adapters implementing ports (Prisma, argon2…)
    http/            controllers, DTOs, guards, decorators
  generated/         Prisma client (git-ignored, `prisma generate`)
test/                e2e specs + in-memory fakes for ports; integration/ = real-DB suite
```

## Conventions

- Every route declares `@Public()`, `@AnyAuthenticated()` or `@Roles(...)` — else 403.
- DTOs come from `@procurestack/shared` Zod schemas via `createZodDto`.
- Sensitive actions call `AuditService.record()` inside the same `UnitOfWork` as the change.
- Business-rule failures throw `DomainError`; money is integer cents (ADR 0005/0006).
- Modules: [auth](src/modules/auth/README.md) · [audit](src/modules/audit/README.md) ·
  [master-data](src/modules/master-data/README.md) ·
  [requisitions](src/modules/requisitions/README.md) ·
  [sourcing](src/modules/sourcing/README.md) ·
  [purchasing](src/modules/purchasing/README.md) ·
  health ([observability doc](../../docs/modules/observability.md))
