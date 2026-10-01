# ADR 0003 — Authentication & session design

**Status:** Accepted · 2026-10-01

## Context

Need stateless request authentication, the ability to end sessions (deactivation, theft),
and protection from XSS token theft and CSRF in a browser SPA.

## Decision

- **Access token:** JWT HS256, 15 min, held in JS memory only. Claims: `sub`, `email`,
  `roles`, pinned `iss`/`aud`/`alg`.
- **Refresh token:** 256-bit random opaque value in an `httpOnly; SameSite=Strict;
Path=/api/auth` cookie, stored server-side as SHA-256. **Rotated on every use**; a reused
  (already rotated) token revokes its whole family and writes an audit event.
- **Same origin:** nginx (prod) and Vite (dev) proxy `/api`, so cookies never cross sites.
- **RBAC:** global `JwtAuthGuard` → `RolesGuard`. Every route must carry `@Public()`,
  `@AnyAuthenticated()` or `@Roles(...)`; anything else is denied. ADMIN is not a superuser.
- **Passwords:** argon2id (OWASP baseline params); constant-work login for unknown emails.
- No Passport: two small guards are easier to read and test than strategy indirection.

## Consequences

- Roles changes and deactivation take effect at the next refresh (≤15 min). Acceptable for
  now; a per-user `tokenVersion` claim can make it immediate if needed.
- Rate-limit counters are in-memory (single instance). Phase 5 moves them to Redis.
