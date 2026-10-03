# requisitions module

Purchase requisitions (PR) and their multi-level approval (DoA matrix, ADR 0004).
Domain background: [docs/modules/requisitions.md](../../../../../docs/modules/requisitions.md).

| Endpoint                                 | Roles                                                           |
| ---------------------------------------- | --------------------------------------------------------------- |
| `GET /api/doa-levels`                    | any signed-in                                                   |
| `GET /api/requisitions?scope=&status=`   | REQUESTER, APPROVER, BUYER, FINANCE, ADMIN (row-level filtered) |
| `GET /api/requisitions/:id`              | same; 404 if not visible                                        |
| `POST /api/requisitions`, `PUT …/:id`    | REQUESTER (owner, DRAFT/RETURNED only)                          |
| `POST …/:id/submit`, `POST …/:id/cancel` | REQUESTER (owner)                                               |
| `POST …/:id/decision`                    | APPROVER (authority + SoD in domain)                            |

## Layout

```
domain/requisition.ts          state machine, DoA, SoD, visibility — pure, see requisition.spec.ts
application/requisition.service.ts  use cases; audit + version-checked writes in one UnitOfWork
application/ports.ts           RequisitionRepository, DoaMatrix, ApproverDirectory
infrastructure/                Prisma adapters
http/                          controller + domain → DTO mapping
```

Audit actions: `PR_SUBMITTED`, `PR_LEVEL_APPROVED`, `PR_APPROVED`, `PR_REJECTED`,
`PR_RETURNED`, `PR_CANCELLED`.
Tests: `domain/requisition.spec.ts` (rules), `test/integration/requisitions.int-spec.ts` (HTTP + Postgres).
