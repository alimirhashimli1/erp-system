# audit module

**Owns:** the `audit_logs` table — who did what, when, to which entity, with before/after
snapshots. Global module; any use case can inject `AuditService`.

**Rules**

- Append-only: no update/delete API, and a DB trigger rejects `UPDATE`/`DELETE`.
- Never put secrets or full PII payloads into `before`/`after`/`metadata`.
- Action names are `UPPER_SNAKE` verbs, e.g. `AUTH_LOGIN_FAILED`, later `PO_ISSUED`.

**Port:** `AuditLogRepository` (`audit-log.port.ts`), Prisma adapter alongside.

Why it exists from day one: [docs/modules/auth.md §1](../../../../../docs/modules/auth.md)
