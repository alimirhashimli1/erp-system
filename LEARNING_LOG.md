# Learning Log

Append-only. One entry per milestone.

## 2026-10-01 — Phase 0: Foundation

- Built: monorepo (Turborepo + pnpm), Docker Compose stack, Prisma 7 with first migration,
  JWT + rotating refresh-token auth, default-deny RBAC, append-only audit log, health
  checks, structured logging, CI, React login + dashboard.
- Concept: **Segregation of Duties** is why procurement roles exist and why the audit log
  is built before any business module (`docs/modules/auth.md`).
- Concept: **ports & adapters** let the real auth service run in tests with in-memory
  repositories; no database needed to prove token-theft detection works.
