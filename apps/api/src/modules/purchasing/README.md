# purchasing module (purchase orders)

Turns an awarded RFx into purchase orders and manages them until they close.
Background: [docs/modules/purchasing.md](../../../../../docs/modules/purchasing.md).

| Endpoint                                          | Roles                                     |
| ------------------------------------------------- | ----------------------------------------- |
| `GET /api/purchase-orders`, `GET …/:id`           | BUYER, WAREHOUSE, FINANCE, ADMIN          |
| `POST /api/purchase-orders/from-rfx/:rfxId`       | BUYER (one draft PO per winning supplier) |
| `POST …/:id/issue · acknowledge · cancel · close` | BUYER                                     |

## Layout

```
domain/purchase-order.ts   state machine, planPurchaseOrders, issue rules (SoD, budget), receipt status
application/               PurchasingService + PurchaseOrderRepository port (also used by receiving/invoicing)
infrastructure/            Prisma adapter (unique activePrLineId / rfxBidLineId → 409)
```

Audit: `PO_CREATED`, `PO_ISSUED`, `PO_ACKNOWLEDGED`, `PO_CANCELLED`, `PO_CLOSED`.
Tests: `domain/purchase-order.spec.ts`, `test/integration/purchasing.int-spec.ts`.
