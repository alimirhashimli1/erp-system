# Security

One page: assumptions, then controls. Update only when a control changes.

## Threat model assumptions

- Internet-facing SPA + API; attackers can send arbitrary HTTP requests and run scripts
  on other origins. They do not control the host or the container runtime.
- Insider risk is real (it is procurement): users may try actions outside their role,
  or approve their own requests. Segregation of duties (SoD) is a security requirement.
- Single region, single instance for now; TLS is terminated in front of nginx in production.

## Controls

| Area                  | Control                                                                                                                                                                           | Where                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Secrets               | No secrets in source or images; `.env` git-ignored; `pnpm env:init` generates random values; Compose refuses to start if any is missing                                           | `.env.example`, `scripts/init-env.mjs`, `docker-compose.yml`                        |
| Config                | Env validated with Zod at boot; errors name the variable, never echo values                                                                                                       | `apps/api/src/config/env.schema.ts`                                                 |
| Passwords             | argon2id (19 MiB, t=2, p=1); 128-char input cap; constant-work login for unknown users; generic error message                                                                     | `auth/infrastructure/argon2-password-hasher.ts`, `auth/application/auth.service.ts` |
| Sessions              | 15-min JWT (alg/iss/aud pinned) in memory; rotating refresh token in `httpOnly; SameSite=Strict; Path=/api/auth` cookie, stored hashed; reuse → family revoked + audited          | ADR 0003                                                                            |
| Authorization         | Global guards; **default deny** when a route declares no policy; ADMIN not a superuser; row-level checks live in services (from Phase 1)                                          | `auth/http/guards/`                                                                 |
| Input                 | Zod validation on every body/query/param via global pipe — and on BullMQ job payloads read back from Redis; unknown response fields stripped by the Zod serializer                | `app.module.ts`                                                                     |
| Data access           | Prisma only (parameterized). Raw SQL must be a tagged template and justified in a comment (only `SELECT 1` health probe today)                                                    | `health/health.indicators.ts`                                                       |
| HTTP                  | Helmet headers; CORS allow-list; nginx CSP; `trust proxy` limited to private networks                                                                                             | `app.setup.ts`, `apps/web/nginx/`                                                   |
| Rate limiting         | 120 req/min default; writes 60/min (`@WriteThrottle`); login 5/min; refresh 30/min; runs before validation                                                                        | `app.module.ts`, `auth.controller.ts`                                               |
| Logging               | Pino with allow-listed request fields (no headers, no bodies); redaction as backstop; request IDs                                                                                 | `app.module.ts`                                                                     |
| Audit                 | `audit_logs` (who, what, when, before/after), written in the same transaction as the change; DB triggers block UPDATE/DELETE/TRUNCATE; master-data changes audited                | `modules/audit/`, init migration                                                    |
| Segregation of duties | Enforced in services, not the UI: no self-approval of PRs; PO issuer ≠ PR requester; goods receiver ≠ PO buyer; posted goods receipts immutable (DB trigger blocks UPDATE/DELETE) | `*/domain/*.ts`, receiving migration                                                |
| Supply chain          | Exact versions; lockfile; `pnpm audit` in CI; Dependabot; install-script allow-list; minimum release age                                                                          | `pnpm-workspace.yaml`, `.github/`                                                   |
| Containers            | Multi-stage builds; non-root users; no source maps or dev deps in runtime images; read-only FS; `cap_drop: ALL`; `no-new-privileges`; DB/Redis bound to 127.0.0.1                 | `apps/*/Dockerfile`, `docker-compose.yml`                                           |

## Known gaps (accepted for now)

- Role changes/deactivation apply at next refresh (≤ 15 min).
- Rate-limit state is per process (moves to Redis in Phase 5).
- Redis password is visible via `docker inspect` (local dev only).
- No MFA, no password-reset flow, no account lockout beyond rate limiting.

## Reporting

This is a learning project; open an issue rather than a public exploit write-up.
