# master-data module

Suppliers, items and cost centers: the records every P2P document points at.
Domain background: [docs/modules/master-data.md](../../../../../docs/modules/master-data.md).

| Endpoint                                     | Read          | Write          |
| -------------------------------------------- | ------------- | -------------- |
| `/api/suppliers`, `/api/suppliers/:id`       | any signed-in | BUYER, ADMIN   |
| `/api/items`, `/api/items/:id`               | any signed-in | BUYER, ADMIN   |
| `/api/cost-centers`, `/api/cost-centers/:id` | any signed-in | FINANCE, ADMIN |

- `GET` lists take `?q=` (code/name search) and `?includeInactive=true`, capped at 200 rows.
- No deletes: records are deactivated (`PATCH {isActive:false}`), because past documents
  still reference them.
- Every create/update writes `<ENTITY>_CREATED|UPDATED` with before/after to the audit log,
  in the same transaction.

## Layout

```
application/catalog.service.ts   generic list/get/create/update + audit, one instance per entity
application/ports.ts             CatalogRepository<T> port + DI tokens
infrastructure/                  Prisma adapters (BIGINT cents ↔ number, P2002 → 409)
http/                            controllers + DTOs from @procurestack/shared
```

Tests: `test/integration/master-data.int-spec.ts` (HTTP + real Postgres).
