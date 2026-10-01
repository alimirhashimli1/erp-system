# auth module

**Owns:** users' credentials, sessions (refresh-token families), and the global
authentication/authorization guards.

**Endpoints:** `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`

**Refresh-token lifecycle** (per token row):

```
issued ──refresh──► revoked (replacedBy = next)
   │                    │
   │                    └─presented again──► REUSE → whole family revoked + audit event
   └──expiresAt passes──► expired (rejected)
logout / user deactivated ──► family revoked
```

**Ports:** `UserRepository`, `RefreshTokenRepository`, `PasswordHasher` (`application/ports.ts`).

Full write-up (SoD, token design, test map): [docs/modules/auth.md](../../../../../docs/modules/auth.md)
