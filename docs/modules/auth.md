# Identity, Access & Segregation of Duties

## 1. The procurement concept: Segregation of Duties (SoD)

Procure-to-Pay moves company money to outside parties. The classic fraud is simple: one
person creates a fake supplier, raises a purchase, approves it, "receives" it and pays it.
**Segregation of Duties** splits the chain so no single person controls it end to end:

| Step                     | Role         | Why separate                                               |
| ------------------------ | ------------ | ---------------------------------------------------------- |
| Raise a need (PR)        | Requester    | Knows the need, has a conflict of interest in approving it |
| Approve spend            | Approver     | Holds budget authority (Delegation of Authority)           |
| Source & order (RFx, PO) | Buyer        | Commercial expertise; must not invent demand               |
| Confirm delivery (GR)    | Warehouse    | Independent evidence goods actually arrived                |
| Match & pay              | Finance / AP | Pays only what was ordered **and** received                |

Auditors (SOX in the US, internal control frameworks elsewhere) test exactly this: who
_could_ do what, and who _did_ what. That is why this project has both RBAC and an
append-only audit log from the first commit.

Toxic combinations to watch in later phases: Requester + Approver on the same document,
Buyer + Warehouse on the same PO, anyone + Finance on their own supplier.
Rules like "you can't approve your own PR" are **row-level** checks in services, because
they depend on the document, not just the role.

## 2. Authentication design

```
login ──► access JWT (15 min, memory)  +  refresh cookie (7 d, httpOnly, rotated)
API call ──► Authorization: Bearer <JWT>  ──► JwtAuthGuard ──► RolesGuard ──► controller
401 ──► POST /auth/refresh (cookie) ──► new JWT + new cookie, old one revoked
```

- **Why two tokens?** A JWT is verified without a DB hit (cheap, scales) but cannot be
  revoked, so it is short-lived. The refresh token is a DB row, so it _can_ be revoked.
- **Rotation & reuse detection.** Each refresh replaces the token. If an old token is ever
  presented again, someone copied it; the server revokes the whole family and audits it
  (`refresh-token.policy.ts`, `auth.service.ts`). The web client therefore needs a
  _single-flight_ refresh (`apps/web/src/api/http.ts`), or two parallel refreshes from the
  same tab would trip the alarm.
- **Where tokens live.** Access token in memory: XSS can't read it from storage. Refresh
  token in an `httpOnly` cookie: JS can't read it at all; `SameSite=Strict` + same-origin
  proxy blocks CSRF.

## 3. Authorization design

- Global guards run on every route. A route must declare `@Public()`,
  `@AnyAuthenticated()` or `@Roles(...)`; otherwise it is **denied** and an error is
  logged. Forgetting a decorator fails closed (tested in `roles.guard.spec.ts` and e2e).
- ADMIN manages the system, not the money: it gets business actions only where listed.
- The frontend hides what you can't do (UX), but the API is the only real boundary.

## 4. Software design notes

- **Ports & adapters:** `AuthService` depends on `UserRepository`,
  `RefreshTokenRepository` and `PasswordHasher` interfaces (Dependency Inversion). Prisma
  and argon2 implement them; tests use in-memory fakes (`apps/api/test/fakes/`).
- **Pure domain policy:** `assessRefreshToken()` has no I/O, so every edge case (expired,
  revoked, boundary instant) is a one-line test.
- **Optimistic locking:** rotation uses `UPDATE … WHERE id = ? AND revokedAt IS NULL`; if
  two requests race, exactly one wins and the other is treated as reuse.
- **Rejected:** Passport strategies (indirection with little benefit for one strategy);
  storing JWTs in localStorage (XSS-readable); long-lived JWTs (unrevocable).

## 5. Test map

| Test                           | Proves                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `refresh-token.policy.spec.ts` | verdict rules incl. reuse-beats-expiry and the expiry boundary                  |
| `auth.service.spec.ts`         | rotation, reuse revokes family, generic login errors, deactivation              |
| `roles.guard.spec.ts`          | default deny, any-of roles, ADMIN not superuser, 401 vs 403                     |
| `test/auth.e2e-spec.ts`        | real HTTP stack: validation 400, cookie flags, refresh replay, 403s, rate limit |
| `role-sync.spec.ts`            | DB enum and shared enum cannot drift                                            |
