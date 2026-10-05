# receiving module (goods receipts)

Records what physically arrived against an issued PO: the "second way" of the 3-way match.
Background: [docs/modules/receiving.md](../../../../../docs/modules/receiving.md).

| Endpoint                                 | Roles                            |
| ---------------------------------------- | -------------------------------- |
| `GET /api/goods-receipts?poId=`, `…/:id` | WAREHOUSE, BUYER, FINANCE, ADMIN |
| `POST /api/goods-receipts`               | WAREHOUSE                        |

## Layout

```
domain/goods-receipt.ts    checkReceipt: PO open?, SoD buyer≠receiver, over-delivery, accepted = received − rejected
application/               ReceivingService: GR + PO quantities + PO status + audit in one transaction
infrastructure/            Prisma adapter and GoodsReceiptRepository port
```

Audit: `GR_POSTED`. Tests: `domain/goods-receipt.spec.ts`, `test/integration/receiving.int-spec.ts`.
