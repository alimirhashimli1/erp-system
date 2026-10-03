# ProcureStack

A learning-grade **Procure-to-Pay ERP**: requisitions → sourcing → purchase orders →
goods receipt → 3-way match → payment, plus inventory, supplier management and compliance.

## Quick start (Docker)

```bash
pnpm install          # once, for the env script and git hooks (Node 24, pnpm 12)
pnpm env:init         # creates .env with random secrets and prints the demo password
docker compose up --build
```

| What               | URL                                    |
| ------------------ | -------------------------------------- |
| App                | http://localhost:8080                  |
| API docs (Swagger) | http://localhost:8080/api/docs         |
| Readiness          | http://localhost:8080/api/health/ready |

Demo users (password = `SEED_DEFAULT_PASSWORD` in `.env`):
`requester@`, `approver@` (DoA L1), `head@` (L2), `cfo@` (L3), `buyer@`, `warehouse@`,
`finance@`, `admin@` + `procurestack.dev`.

## Local development (hot reload)

```bash
docker compose up -d postgres redis        # infrastructure only
pnpm --filter @procurestack/api db:deploy  # apply migrations
pnpm --filter @procurestack/api db:seed    # demo users + master data
pnpm dev                                   # api :3000, web :5173 (proxies /api)
```

## Common tasks

| Command                                      | Does                                             |
| -------------------------------------------- | ------------------------------------------------ |
| `pnpm test`                                  | all unit + e2e tests                             |
| `pnpm lint` / `pnpm typecheck`               | static checks                                    |
| `pnpm build`                                 | production builds                                |
| `pnpm --filter @procurestack/api db:migrate` | create a migration after editing `schema.prisma` |
| `pnpm audit:deps`                            | dependency vulnerability audit                   |

## Stack

NestJS 11 · Prisma 7 / PostgreSQL 18 · Redis 8 + BullMQ · React 19 + Vite · React Query ·
React Hook Form · Zod (shared schemas) · Turborepo + pnpm · Jest / Vitest · Docker.

## Map

| Path                                           | What                                |
| ---------------------------------------------- | ----------------------------------- |
| [`apps/api`](apps/api/README.md)               | NestJS API                          |
| [`apps/web`](apps/web/README.md)               | React SPA                           |
| [`packages/shared`](packages/shared/README.md) | Zod schemas & domain constants      |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)           | phases and status                   |
| [`docs/SECURITY.md`](docs/SECURITY.md)         | threat model & controls             |
| [`docs/adr/`](docs/adr)                        | architecture decisions              |
| [`docs/modules/`](docs/modules)                | in-depth concept + design write-ups |
| [`LEARNING_LOG.md`](LEARNING_LOG.md)           | milestone log                       |
